import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const supabase = getSupabaseClient();
    const { lobbyId, userId, choice } = await request.json();

    if (!lobbyId || !userId || !['rock', 'paper', 'scissors'].includes(choice)) {
        return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    try {
        // 1. Record Choice
        await supabase
            .from('multiplayer_entries')
            .update({ rps_choice: choice })
            .eq('lobby_id', lobbyId)
            .eq('user_id', userId);

        // 2. Check if all active tied users have chosen
        // First, get all active entries in this lobby (assuming we are in tiebreaker mode)
        // We assume the lobby status is 'tiebreaker' and only tied users are 'active'
        const { data: activeEntries } = await supabase
            .from('multiplayer_entries')
            .select('*')
            .eq('lobby_id', lobbyId)
            .eq('status', 'active');

        const allChosen = activeEntries.every(e => e.rps_choice || (e.user_id === userId && choice)); // Check current user too if DB update is slow/async race

        if (allChosen) {
            // RESOLVE ROUND
            // Fetch fresh data to be sure
            const { data: entries } = await supabase
                .from('multiplayer_entries')
                .select('*')
                .eq('lobby_id', lobbyId)
                .eq('status', 'active');

            const choices = entries.map(e => e.rps_choice);
            const uniqueChoices = [...new Set(choices)];

            let winners = [];
            let losers = [];
            let isTie = false;

            if (uniqueChoices.length === 1) {
                // All same -> Tie
                isTie = true;
            } else if (uniqueChoices.length === 3) {
                // All three present -> Tie (Rock beats Scissors, Scissors beats Paper, Paper beats Rock)
                isTie = true;
            } else {
                // Two choices present -> One wins
                const c1 = uniqueChoices[0];
                const c2 = uniqueChoices[1];
                let winningChoice;

                if (
                    (c1 === 'rock' && c2 === 'scissors') ||
                    (c1 === 'scissors' && c2 === 'paper') ||
                    (c1 === 'paper' && c2 === 'rock')
                ) {
                    winningChoice = c1;
                } else {
                    winningChoice = c2;
                }

                winners = entries.filter(e => e.rps_choice === winningChoice);
                losers = entries.filter(e => e.rps_choice !== winningChoice);
            }

            if (isTie) {
                // Reset choices for everyone to play again
                await supabase
                    .from('multiplayer_entries')
                    .update({ rps_choice: null })
                    .eq('lobby_id', lobbyId)
                    .eq('status', 'active');

                return NextResponse.json({ result: 'tie', message: 'Tie! Play again.' });
            } else {
                // Eliminate losers
                const loserIds = losers.map(e => e.user_id);
                await supabase
                    .from('multiplayer_entries')
                    .update({ status: 'eliminated' })
                    .in('user_id', loserIds)
                    .eq('lobby_id', lobbyId);

                // Reset winners' choices for next round (if needed)
                await supabase
                    .from('multiplayer_entries')
                    .update({ rps_choice: null })
                    .in('user_id', winners.map(e => e.user_id))
                    .eq('lobby_id', lobbyId);

                // Check if only 1 winner remains
                if (winners.length === 1) {
                    // WE HAVE A CHAMPION
                    const champion = winners[0];
                    // Trigger settlement (could call another API or do it here)
                    // For now, just mark lobby as finished? Or let the settlement script handle it?
                    // Let's just return the result.
                    return NextResponse.json({ result: 'winner', winner: champion });
                } else {
                    return NextResponse.json({ result: 'next_round', message: 'Losers eliminated. Survivors play again.' });
                }
            }
        }

        return NextResponse.json({ result: 'waiting', message: 'Waiting for opponents...' });

    } catch (error) {
        console.error('RPS error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
