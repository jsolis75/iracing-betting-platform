import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { lobbyId } = await request.json();

        if (!lobbyId) {
            return NextResponse.json({ error: 'Missing lobbyId' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // 1. Get lobby details
        const { data: lobby, error: lobbyError } = await supabase
            .from('fantasy_lobbies')
            .select('*')
            .eq('id', lobbyId)
            .single();

        if (lobbyError || !lobby) {
            return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
        }

        // 2. Get race data
        const { data: race, error: raceError } = await supabase
            .from('races')
            .select('*')
            .eq('id', lobby.race_id)
            .single();

        if (raceError || !race || !race.data) {
            const { data: entries, error: entriesError } = await supabase
                .from('fantasy_entries')
                .select('*')
                .eq('lobby_id', lobbyId);

            if (entriesError) {
                throw entriesError;
            }

            // 5. Calculate scores
            const calculateDriverScore = (driverId, isCaptain) => {
                const result = driverResults[driverId];
                if (!result) return 0;

                const { position, startingPosition } = result;

                // Position points (DraftKings scoring)
                let posPoints = 0;
                if (position === 1) posPoints = 45;
                else if (position === 2) posPoints = 42;
                else if (position === 3) posPoints = 41;
                else if (position === 4) posPoints = 40;
                else if (position >= 5 && position <= 43) {
                    posPoints = 44 - position;
                } else {
                    posPoints = 1;
                }

                // Place differential (starting - current, so positive = gained)
                const diffPoints = startingPosition - position;

                let total = posPoints + diffPoints;

                // Captain multiplier
                if (isCaptain) {
                    total *= 1.5;
                }

                return total;
            };

            const scoredEntries = entries.map(entry => {
                const score1 = calculateDriverScore(entry.driver_1, entry.captain_driver === entry.driver_1);
                const score2 = calculateDriverScore(entry.driver_2, entry.captain_driver === entry.driver_2);
                const score3 = calculateDriverScore(entry.driver_3, entry.captain_driver === entry.driver_3);
                const totalScore = score1 + score2 + score3;

                return {
                    ...entry,
                    finalScore: totalScore
                };
            });

            // Sort by score
            scoredEntries.sort((a, b) => b.finalScore - a.finalScore);

            // 6. Award payouts (winner takes all for now)
            const winner = scoredEntries[0];
            const pot = lobby.entry_fee * entries.length;

            // Update winner's balance
            await supabase.rpc('increment_balance', {
                user_id_input: winner.user_id,
                amount: pot
            });

            // 7. Mark lobby as settled
            await supabase
                .from('fantasy_lobbies')
                .update({ status: 'completed' })
                .eq('id', lobbyId);

            return NextResponse.json({
                success: true,
                winner: winner.username,
                winnings: pot,
                finalStandings: scoredEntries.map((e, idx) => ({
                    rank: idx + 1,
                    username: e.username,
                    score: e.finalScore
                }))
            });

        } catch (error) {
            console.error('Fantasy settlement error:', error);
            return NextResponse.json({ error: 'Settlement failed' }, { status: 500 });
        }
    }
