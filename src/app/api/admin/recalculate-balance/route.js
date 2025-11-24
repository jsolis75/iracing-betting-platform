import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('username');

        if (!username) {
            return NextResponse.json({ error: 'Missing username' }, { status: 400 });
        }

        const supabase = getSupabaseServiceClient();

        // 1. Get User
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (userError || !user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // 2. Initial Balance
        const initialBalance = 1000;
        let calculatedBalance = initialBalance;
        const log = [`Initial Balance: $${initialBalance}`];

        // 3. Process Bets
        const { data: bets, error: betsError } = await supabase
            .from('bets')
            .select('*')
            .eq('user_id', user.id);

        if (betsError) throw betsError;

        let totalStakes = 0;
        let totalBetWinnings = 0;

        bets.forEach(bet => {
            const stake = Number(bet.stake) || 0;
            totalStakes += stake;

            if (bet.result === 'won') {
                const payout = Number(bet.potential_payout) || 0;
                // Winnings = Stake + Profit
                const totalReturn = stake + payout;
                totalBetWinnings += totalReturn;
                log.push(`Bet ${bet.id} (WON): -${stake} stake, +${totalReturn} return`);
            } else if (bet.result === 'void' || bet.status === 'refunded') {
                totalBetWinnings += stake;
                log.push(`Bet ${bet.id} (VOID): -${stake} stake, +${stake} return`);
            } else {
                log.push(`Bet ${bet.id} (${bet.result}): -${stake} stake`);
            }
        });

        calculatedBalance = calculatedBalance - totalStakes + totalBetWinnings;
        log.push(`Net Betting: -$${totalStakes} stakes + $${totalBetWinnings} returns`);

        // 4. Process Fantasy Entries
        // Get all entries for this user
        const { data: userEntries, error: userEntriesError } = await supabase
            .from('multiplayer_entries')
            .select(`
                *,
                lobby:multiplayer_lobbies (
                    id,
                    status,
                    race_id
                )
            `)
            .eq('user_id', user.id);

        if (userEntriesError) throw userEntriesError;

        let totalFantasyFees = 0;
        let totalFantasyWinnings = 0;

        // Group by lobby to process efficiently
        const lobbyIds = [...new Set(userEntries.map(e => e.lobby.id))];

        // Fetch all lobbies and their races
        for (const lobbyId of lobbyIds) {
            const userEntry = userEntries.find(e => e.lobby.id === lobbyId);

            // Deduct Fee
            const fee = 500;
            totalFantasyFees += fee;

            if (userEntry.lobby.status !== 'completed') continue;

            // Fetch full lobby entries
            const { data: lobbyEntries } = await supabase
                .from('multiplayer_entries')
                .select('*, user:users(username)')
                .eq('lobby_id', lobbyId);

            // Fetch race data
            const { data: race } = await supabase
                .from('races')
                .select('*')
                .eq('id', userEntry.lobby.race_id)
                .single();

            if (!race || !race.data) continue;

            // --- SCORING LOGIC ---
            const sessions = race.data.SessionInfo?.Sessions || [];
            const raceSession = sessions.find(s => s.SessionType === 'Race') || sessions[sessions.length - 1];
            const qualifyingSession = sessions.find(s => s.SessionType === 'Qualify' || s.SessionType === 'Lone Qualify');

            if (!raceSession?.ResultsPositions) continue;

            const drivers = race.data.DriverInfo?.Drivers || [];
            const startingPositions = {};
            if (qualifyingSession?.ResultsPositions) {
                qualifyingSession.ResultsPositions.forEach(result => {
                    startingPositions[result.CarIdx] = result.Position;
                });
            }

            const driverResults = {};
            raceSession.ResultsPositions.forEach(result => {
                const driver = drivers.find(d => d.CarIdx === result.CarIdx);
                if (driver) {
                    driverResults[driver.UserID] = {
                        position: result.Position,
                        startingPosition: startingPositions[result.CarIdx] || result.Position
                    };
                }
            });

            const calculateDriverScore = (driverId, isCaptain) => {
                const result = driverResults[driverId];
                if (!result) return 0;
                const { position, startingPosition } = result;
                let posPoints = 0;
                if (position === 1) posPoints = 45;
                else if (position === 2) posPoints = 42;
                else if (position === 3) posPoints = 41;
                else if (position === 4) posPoints = 40;
                else if (position >= 5 && position <= 43) posPoints = 44 - position;
                else posPoints = 1;
                const diffPoints = startingPosition - position;
                let total = posPoints + diffPoints;
                if (isCaptain) total *= 1.5;
                return total;
            };

            const scoredEntries = lobbyEntries.map(entry => {
                const score1 = calculateDriverScore(entry.driver_1, entry.captain_driver === entry.driver_1);
                const score2 = calculateDriverScore(entry.driver_2, entry.captain_driver === entry.driver_2);
                const score3 = calculateDriverScore(entry.driver_3, entry.captain_driver === entry.driver_3);
                return {
                    ...entry,
                    finalScore: score1 + score2 + score3,
                    username: entry.user?.username
                };
            });

            // Sort
            scoredEntries.sort((a, b) => b.finalScore - a.finalScore);
            const winner = scoredEntries[0];

            if (winner && winner.user_id === user.id) {
                const pot = fee * lobbyEntries.length;
                totalFantasyWinnings += pot;
                log.push(`Fantasy Win (Lobby ${lobbyId}): +${pot} (Score: ${winner.finalScore})`);
            }
        }

        calculatedBalance = calculatedBalance - totalFantasyFees + totalFantasyWinnings;
        log.push(`Net Fantasy: -$${totalFantasyFees} fees + $${totalFantasyWinnings} winnings`);

        // 5. Update User
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: calculatedBalance })
            .eq('id', user.id);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            username,
            oldBalance: user.balance,
            newBalance: calculatedBalance,
            breakdown: {
                initial: initialBalance,
                betting: {
                    stakes: totalStakes,
                    winnings: totalBetWinnings,
                    net: totalBetWinnings - totalStakes
                },
                fantasy: {
                    fees: totalFantasyFees,
                    winnings: totalFantasyWinnings,
                    net: totalFantasyWinnings - totalFantasyFees
                },
                log
            }
        });

    } catch (error) {
        console.error('Recalculation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
