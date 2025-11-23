import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { raceId, drivers } = await request.json();

        if (!raceId && !drivers) {
            return NextResponse.json({ error: 'Missing race data' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        let raceDrivers = drivers;
        let targetSessionId = raceId;

        // Check if raceId looks like a UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raceId);

        // If drivers data is not provided, try to fetch it from the 'races' table
        if (!raceDrivers || isUUID) {
            let query = supabase.from('races').select('*');

            if (isUUID) {
                query = query.eq('id', raceId);
            } else {
                query = query.eq('iracing_session_id', raceId);
            }

            const { data: raceData, error: raceError } = await query.single();

            if (raceError || !raceData) {
                console.error(`Race lookup failed for ID ${raceId}:`, raceError);
                return NextResponse.json({ error: `Race not found in database with ID: ${raceId}` }, { status: 404 });
            }

            // Update targetSessionId to the correct integer from DB
            targetSessionId = raceData.iracing_session_id;

            if (!raceData.data) {
                return NextResponse.json({ error: 'Race found but has no data' }, { status: 400 });
            }

            if (raceData.data.DriverInfo) {
                const rawDrivers = raceData.data.DriverInfo.Drivers;
                const session = raceData.data.SessionInfo.Sessions.find(s => s.SessionType === 'Race') || raceData.data.SessionInfo.Sessions[raceData.data.SessionInfo.Sessions.length - 1];
                const resultsPositions = session.ResultsPositions || [];

                const posMap = {};
                const reasonOutMap = {};
                resultsPositions.forEach(p => {
                    posMap[p.CarIdx] = p.Position;
                    reasonOutMap[p.CarIdx] = p.ReasonOutStr;
                });

                raceDrivers = rawDrivers.map(d => {
                    const reasonOut = reasonOutMap[d.CarIdx]?.toLowerCase().trim() || "running";
                    let isDNF = false;
                    const dnfReasons = ["accident", "engine", "suspension", "handling", "brakes"];
                    if (dnfReasons.some(r => reasonOut.includes(r))) isDNF = true;
                    else if ((reasonOut.includes("disconnected") || reasonOut.includes("disco"))) isDNF = true;

                    return {
                        name: d.UserName,
                        currentPosition: posMap[d.CarIdx] || 999,
                        isDNF: isDNF,
                        incidents: d.CurDriverIncidentCount || 0
                    };
                });
            }
        }

        if (!raceDrivers) {
            return NextResponse.json({ error: 'Missing race results data' }, { status: 400 });
        }

        // 1. Fetch ALL pending bets
        const { data: pendingBets, error: fetchError } = await supabase
            .from('bets')
            .select('*')
            .eq('status', 'pending');

        if (fetchError) {
            throw fetchError;
        }

        if (!pendingBets || pendingBets.length === 0) {
            return NextResponse.json({ message: 'No pending bets to settle' });
        }

        let settledCount = 0;
        const updates = [];

        // Helper to check a single leg result
        const checkLeg = (driverName, betType, drivers, selection = null) => {
            // Skip slurmeister - it's manually settled
            if (betType === 'slurmeister') {
                return 'unknown'; // Leave as pending for manual settlement
            }

            // Handle special bets
            if (betType === 'terrorist' || betType === 'alqaeda') {
                const terroristCount = drivers.filter(d => d.incidents >= 17).length;

                if (betType === 'terrorist') {
                    // The Terrorist: 1+ driver with 17+ incidents
                    const hasTerrorist = terroristCount >= 1;
                    return (selection === 'Yes' && hasTerrorist) || (selection === 'No' && !hasTerrorist) ? 'won' : 'lost';
                } else if (betType === 'alqaeda') {
                    // Al Qaeda: 3+ drivers with 17+ incidents
                    const hasAlQaeda = terroristCount >= 3;
                    return (selection === 'Yes' && hasAlQaeda) || (selection === 'No' && !hasAlQaeda) ? 'won' : 'lost';
                }
            }

            // Handle regular driver bets
            const driver = drivers.find(d => d.name === driverName);
            if (!driver) return 'unknown';

            const pos = driver.currentPosition;
            const isDNF = driver.isDNF;

            switch (betType) {
                case 'Win':
                    return pos === 1 ? 'won' : 'lost';
                case 'Top 3':
                    return pos <= 3 ? 'won' : 'lost';
                case 'Top 10':
                    return pos <= 10 ? 'won' : 'lost';
                case 'Crash':
                    return isDNF ? 'won' : 'lost';
                default:
                    return 'unknown';
            }
        };

        const debugLogs = [];
        debugLogs.push(`Settling race ${raceId} (Target Session: ${targetSessionId})`);
        debugLogs.push(`Found ${pendingBets.length} total pending bets in DB`);

        for (const bet of pendingBets) {
            let result = 'pending';

            // Skip bets that are definitely for a different race (if we can tell)
            if (String(bet.race_id) !== String(targetSessionId) && bet.race_id !== 'multi') {
                debugLogs.push(`Skipping bet ${bet.id}: Race ID mismatch (${bet.race_id} !== ${targetSessionId})`);
                continue;
            }

            if (bet.bet_type === 'Parlay') {
                if (!bet.details || !Array.isArray(bet.details)) {
                    debugLogs.push(`Skipping parlay ${bet.id}: Missing details (Legacy bet?)`);
                    continue;
                }

                let allWon = true;
                let anyLost = false;
                let anyUnknown = false;

                for (const leg of bet.details) {
                    const legResult = checkLeg(leg.driver, leg.type, raceDrivers);

                    if (legResult === 'lost') {
                        anyLost = true;
                        break; // Parlay is dead
                    }
                    if (legResult === 'unknown') {
                        anyUnknown = true;
                        debugLogs.push(`Parlay ${bet.id} leg unknown: ${leg.driver}`);
                    }
                    if (legResult !== 'won') {
                        allWon = false;
                    }
                }

                if (anyLost) result = 'lost';
                else if (allWon && !anyUnknown) result = 'won';
                else result = 'pending';

            } else {
                // Single Bet
                const betType = bet.bet_type;

                // Check if it's a special bet
                if (betType === 'terrorist' || betType === 'alqaeda') {
                    // Extract selection from driver_name (e.g., "terrorist - Yes" or "alqaeda - No")
                    const selection = bet.driver_name?.includes('Yes') ? 'Yes' : 'No';
                    const singleResult = checkLeg(null, betType, raceDrivers, selection);
                    if (singleResult !== 'unknown') {
                        result = singleResult;
                    } else {
                        debugLogs.push(`Bet ${bet.id} special bet grading failed`);
                    }
                } else {
                    // Regular driver bet
                    const singleResult = checkLeg(bet.driver_name, betType, raceDrivers);
                    if (singleResult !== 'unknown') {
                        result = singleResult;
                    } else {
                        debugLogs.push(`Bet ${bet.id} driver unknown: ${bet.driver_name}`);
                    }
                }
            }

            // If we determined a result, queue the update
            if (result !== 'pending') {
                updates.push({
                    bet,
                    result
                });
                debugLogs.push(`Queueing update for bet ${bet.id}: ${result}`);
            }
        }

        // Process updates
        for (const update of updates) {
            const { bet, result } = update;

            // 1. ATOMIC UPDATE: Try to set status to 'settled' WHERE status is 'pending'
            // This prevents race conditions where multiple requests settle the same bet
            const { data: settledBet, error: updateError } = await supabase
                .from('bets')
                .update({
                    status: 'settled',
                    result: result,
                    settled_at: new Date().toISOString()
                })
                .eq('id', bet.id)
                .eq('status', 'pending') // CRITICAL: Only update if still pending
                .select()
                .single();

            if (updateError || !settledBet) {
                // If update failed or returned no data, it means another process already settled this bet
                debugLogs.push(`Skipping payment for bet ${bet.id}: Already settled or update failed`);
                continue;
            }

            // 2. If won, pay the user (Stake + Profit)
            if (result === 'won') {
                const { data: user } = await supabase
                    .from('users')
                    .select('balance')
                    .eq('id', bet.user_id)
                    .single();

                if (user) {
                    // FIX: Refund Stake + Pay Profit
                    // potential_payout is currently stored as PROFIT only
                    const totalPayout = Number(bet.stake) + Number(bet.potential_payout);

                    await supabase
                        .from('users')
                        .update({ balance: user.balance + totalPayout })
                        .eq('id', bet.user_id);

                    debugLogs.push(`Paid out $${totalPayout} for bet ${bet.id}`);
                }
            }
            settledCount++;
        }

        return NextResponse.json({
            success: true,
            settledCount,
            message: `Settled ${settledCount} bets`,
            debug: debugLogs
        });

    } catch (error) {
        console.error('Error settling race:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
