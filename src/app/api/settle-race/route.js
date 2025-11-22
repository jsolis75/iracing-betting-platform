import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { raceId, drivers } = await request.json();

        if (!raceId || !drivers) {
            return NextResponse.json({ error: 'Missing race data' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        let raceDrivers = drivers;

        // If drivers data is not provided, try to fetch it from the 'races' table
        if (!raceDrivers && raceId) {
            const { data: raceData, error: raceError } = await supabase
                .from('races')
                .select('data')
                .eq('id', raceId)
                .single();

            if (raceData && raceData.data && raceData.data.DriverInfo) {
                // We need to reconstruct the 'drivers' array structure expected by the logic below
                // The stored JSON is the raw iRacing data.
                // We need to map it similar to how page.js does.
                // This is a bit complex to duplicate the mapping logic here.
                // Alternatively, we can just require the user to pass the data.
                // BUT, for a robust backend, we should probably store the *processed* results or handle raw data here.

                // Let's try to map the raw data.
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
                    else if ((reasonOut.includes("disconnected") || reasonOut.includes("disco"))) isDNF = true; // Simplified DNF logic for backend

                    return {
                        name: d.UserName,
                        currentPosition: posMap[d.CarIdx] || 999,
                        isDNF: isDNF
                    };
                });
            }
        }

        if (!raceDrivers) {
            return NextResponse.json({ error: 'Missing race results data' }, { status: 400 });
        }

        // 1. Fetch ALL pending bets for this race (or parlays involving this race)

        if (!pendingBets || pendingBets.length === 0) {
            return NextResponse.json({ message: 'No pending bets to settle' });
        }

        let settledCount = 0;
        const updates = [];

        // Helper to check a single leg result
        const checkLeg = (driverName, betType, drivers) => {
            const driver = drivers.find(d => d.name === driverName);
            if (!driver) return 'unknown'; // Driver not in this race data

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

        for (const bet of pendingBets) {
            let result = 'pending';

            // Skip bets that are definitely for a different race (if we can tell)
            // If race_id matches, or if it's a parlay (multi), we try to grade it.
            if (bet.race_id !== raceId && bet.race_id !== 'multi') {
                continue;
            }

            if (bet.bet_type === 'Parlay') {
                if (!bet.details || !Array.isArray(bet.details)) {
                    console.warn(`Parlay bet ${bet.id} missing details`);
                    continue;
                }

                let allWon = true;
                if (result !== 'pending') {
                    updates.push({
                        bet,
                        result
                    });
                }
            }

            // Process updates
            for (const update of updates) {
                const { bet, result } = update;

                // 1. Update bet status
                await supabase
                    .from('bets')
                    .update({
                        status: 'settled',
                        result: result,
                        settled_at: new Date().toISOString()
                    })
                    .eq('id', bet.id);

                // 2. If won, pay the user
                if (result === 'won') {
                    // We need to fetch the user's CURRENT balance first to avoid race conditions 
                    // (though strictly we should use a stored procedure or atomic increment, 
                    // but for this MVP fetching is okay-ish if traffic is low).
                    // Better: RPC call if we had one. 
                    // We'll just fetch-and-update.
                    const { data: user } = await supabase
                        .from('users')
                        .select('balance')
                        .eq('id', bet.user_id)
                        .single();

                    if (user) {
                        await supabase
                            .from('users')
                            .update({ balance: user.balance + bet.potential_payout })
                            .eq('id', bet.user_id);
                    }
                }
                settledCount++;
            }

            return NextResponse.json({
                success: true,
                settledCount,
                message: `Settled ${settledCount} bets`
            });

        } catch (error) {
            console.error('Error settling race:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    }
