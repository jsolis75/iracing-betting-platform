import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

function getStateName(state) {
    const states = {
        0: 'Invalid', 1: 'GetInCar', 2: 'Warmup', 3: 'ParadeLaps',
        4: 'Racing', 5: 'Checkered', 6: 'CoolDown'
    };
    return states[state] || 'Unknown';
}


export async function POST(request) {
    try {
        const supabase = getSupabaseClient();

        // BUGFIX: raceId was never read from the request body, so every
        // settlement call threw a ReferenceError and no bets ever settled.
        const body = await request.json().catch(() => ({}));
        const raceId = body.raceId;
        if (!raceId) {
            return NextResponse.json({ error: 'Missing raceId' }, { status: 400 });
        }

        let raceDrivers = null;
        let targetSessionId = raceId;

        // Check if raceId looks like a UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raceId);

        // ALWAYS fetch from database to ensure consistency (ignore client-provided drivers)
        console.log(`Settling race ${raceId}. Fetching fresh data from DB...`);
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

        if (raceData.data.SessionInfo && raceData.data.SessionInfo.Sessions) {
            const sessions = raceData.data.SessionInfo.Sessions;
            // Settle strictly from the Race session (never a Practice/Qualify fallback)
            const session = sessions.find(s => s.SessionType === 'Race');

            // CRITICAL: Only settle if there IS a race session
            if (!session) {
                return NextResponse.json({ message: 'Race not yet finished (no Race session in data)' });
            }

            // CRITICAL: Check SessionState to ensure race is actually over.
            // BUGFIX: SessionState lives under Telemetry in the broadcast payload;
            // the old code read raceData.data.SessionState (always undefined), so
            // the "race actually over" gate never worked.
            const sessionState = raceData.data.Telemetry?.SessionState ?? session.SessionState;
            if (typeof sessionState === 'number' && sessionState < 5) {
                return NextResponse.json({
                    message: `Race not yet finished (State: ${sessionState} - ${getStateName(sessionState)})`
                });
            }

            const rawDrivers = raceData.data.DriverInfo.Drivers;
            const resultsPositions = session.ResultsPositions || [];

            const posMap = {};
            const reasonOutMap = {};
            const lapsCompleteMap = {};

            resultsPositions.forEach(p => {
                posMap[p.CarIdx] = p.Position;
                reasonOutMap[p.CarIdx] = p.ReasonOutStr;
                lapsCompleteMap[p.CarIdx] = p.LapsComplete;
            });

            // Find the winner (Position 1)
            const winnerCarIdx = Object.keys(posMap).find(idx => posMap[idx] === 1);
            if (winnerCarIdx) {
                const winnerLaps = lapsCompleteMap[winnerCarIdx] || 0;
                if (winnerLaps === 0) {
                    return NextResponse.json({
                        message: `Race finished but winner has 0 laps (False positive - Race Start/Grid)`
                    });
                }
            }

            raceDrivers = rawDrivers.map(d => {
                const reasonOut = reasonOutMap[d.CarIdx]?.toLowerCase().trim() || "running";
                let isDNF = false;
                const dnfReasons = ["accident", "engine", "suspension", "handling", "brakes", "damaged", "crash", "retired"];
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
            // Skip manual settlement bets
            if (['slurmeister', 'fatality', 'kingkong'].includes(betType)) {
                return 'unknown';
            }

            // Handle special bets
            if (betType === 'terrorist' || betType === 'alqaeda') {
                const terroristCount = drivers.filter(d => d.incidents >= 17).length;
                if (betType === 'terrorist') {
                    const hasTerrorist = terroristCount >= 1;
                    return (selection === 'Yes' && hasTerrorist) || (selection === 'No' && !hasTerrorist) ? 'won' : 'lost';
                } else if (betType === 'alqaeda') {
                    const hasAlQaeda = terroristCount >= 3;
                    return (selection === 'Yes' && hasAlQaeda) || (selection === 'No' && !hasAlQaeda) ? 'won' : 'lost';
                }
            }

            // Handle Over/Under Incident Points
            if (betType === 'over_under') {
                const driver = drivers.find(d => d.name.trim() === driverName.trim());
                if (!driver) return 'unknown';
                const incidents = driver.incidents || 0;
                const line = 8.5;
                if (selection === 'Over') return incidents > line ? 'won' : 'lost';
                if (selection === 'Under') return incidents < line ? 'won' : 'lost';
            }

            // Handle regular driver bets
            const driver = drivers.find(d => d.name.trim() === driverName.trim());
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

            // Skip bets that are for a different race
            // Accept EITHER the database UUID OR the iRacing session ID
            const matchesUUID = String(bet.race_id) === String(raceId);
            const matchesSessionID = String(bet.race_id) === String(targetSessionId);
            const isMulti = bet.race_id === 'multi';

            if (!matchesUUID && !matchesSessionID && !isMulti) {
                debugLogs.push(`Skipping bet ${bet.id}: Race ID mismatch (${bet.race_id} !== ${raceId} / ${targetSessionId})`);
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
                // Get selection from details if available, otherwise fallback to driver_name parsing (for legacy)
                let selection = bet.details?.selection;
                if (!selection && (betType === 'terrorist' || betType === 'alqaeda')) {
                    selection = bet.driver_name?.includes('Yes') ? 'Yes' : 'No';
                }
                if (!selection && betType === 'over_under') {
                    // This shouldn't happen for new bets, but just in case
                    selection = 'Over';
                }

                // Check if it's a special bet or over/under
                if (betType === 'terrorist' || betType === 'alqaeda' || betType === 'over_under') {
                    const singleResult = checkLeg(bet.driver_name, betType, raceDrivers, selection);
                    if (singleResult !== 'unknown') {
                        result = singleResult;
                    } else {
                        debugLogs.push(`Bet ${bet.id} grading failed (Type: ${betType}, Selection: ${selection})`);
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

        // ===== AUTO-SETTLE FANTASY LOBBIES =====
        console.log(`\n🎮 Checking for fantasy lobbies to settle for race ${raceData.id}...`);
        try {
            // Find all open fantasy lobbies for this race
            const { data: fantasyLobbies, error: lobbyError } = await supabase
                .from('multiplayer_lobbies')
                .select('id, race_id')
                .eq('race_id', raceData.id) // Use the UUID from races table
                .eq('status', 'open');

            if (lobbyError) {
                console.error('Error fetching fantasy lobbies:', lobbyError);
            } else if (fantasyLobbies && fantasyLobbies.length > 0) {
                console.log(`Found ${fantasyLobbies.length} fantasy lobby(s) to settle`);

                for (const lobby of fantasyLobbies) {
                    try {
                        console.log(`Settling fantasy lobby ${lobby.id}...`);

                        // Call the fantasy settle endpoint internally
                        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
                        const settleRes = await fetch(`${baseUrl}/api/fantasy/settle`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lobbyId: lobby.id })
                        });

                        if (settleRes.ok) {
                            const result = await settleRes.json();
                            console.log(`✅ Fantasy lobby ${lobby.id} settled! Winner: ${result.winner}`);
                        } else {
                            const error = await settleRes.json();
                            console.error(`❌ Fantasy lobby ${lobby.id} failed:`, error.error);
                        }
                    } catch (lobbyErr) {
                        console.error(`Error settling fantasy lobby ${lobby.id}:`, lobbyErr);
                    }
                }
            } else {
                console.log(`No fantasy lobbies found for race ${raceData.id}`);
            }
        } catch (fantasyErr) {
            console.error('Fantasy lobby settlement error:', fantasyErr);
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
