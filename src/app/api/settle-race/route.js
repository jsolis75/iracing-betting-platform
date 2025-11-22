import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { raceId, drivers } = await request.json();

        if (!raceId || !drivers) {
            return NextResponse.json({ error: 'Missing race data' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // 1. Fetch ALL pending bets for this race (or parlays involving this race)
        // Note: For 'multi' race parlays, this is trickier. For now, we'll assume 
        // if a parlay is pending and we have results, we check if it can be settled.
        // But to be safe, let's just fetch all pending bets.
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
                let anyLost = false;
                let anyUnknown = false;

                for (const leg of bet.details) {
                    // leg has { driver, type } (mapped from frontend 'driver' and 'type')
                    // Wait, frontend saves it as { driver: 'Name', type: 'Win' }
                    const legResult = checkLeg(leg.driver, leg.type, drivers);

                    if (legResult === 'lost') {
                        anyLost = true;
                        break; // Parlay is dead
                    }
                    if (legResult === 'unknown') {
                        // If we can't find the driver, maybe they are in a different race?
                        // If this is a multi-race parlay, we can't settle it yet unless we have data for all races.
                        // For now, if we can't find the driver, we assume the leg is NOT for this race, 
                        // so we can't settle the parlay yet.
                        anyUnknown = true;
                    }
                    if (legResult !== 'won') {
                        allWon = false;
                    }
                }

                if (anyLost) result = 'lost';
                else if (allWon && !anyUnknown) result = 'won';
                else result = 'pending'; // Still waiting on other legs

            } else {
                // Single Bet
                const singleResult = checkLeg(bet.driver_name, bet.bet_type, drivers);
                if (singleResult !== 'unknown') {
                    result = singleResult;
                }
            }

            // If we determined a result, queue the update
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
