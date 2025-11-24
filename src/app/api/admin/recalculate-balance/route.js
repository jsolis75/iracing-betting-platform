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
                // Refunded bets: stake is returned, so net 0 change if we subtract stake first then add it back
                // Or just don't subtract stake?
                // Usually: Balance = Initial - Stakes + Returns
                // If refunded, Return = Stake.
                totalBetWinnings += stake;
                log.push(`Bet ${bet.id} (VOID): -${stake} stake, +${stake} return`);
            } else {
                log.push(`Bet ${bet.id} (${bet.result}): -${stake} stake`);
            }
        });

        calculatedBalance = calculatedBalance - totalStakes + totalBetWinnings;
        log.push(`Net Betting: -$${totalStakes} stakes + $${totalBetWinnings} returns`);

        // 4. Process Fantasy Entries
        const { data: entries, error: entriesError } = await supabase
            .from('multiplayer_entries')
            .select(`
                *,
                lobby:multiplayer_lobbies (
                    id,
                    status,
                    prize_pool,
                    winner_username
                )
            `)
            .eq('user_id', user.id);

        if (entriesError) throw entriesError;

        let totalFantasyFees = 0;
        let totalFantasyWinnings = 0;

        entries.forEach(entry => {
            // Fee is hardcoded 500 in join logic
            const fee = 500;
            totalFantasyFees += fee;

            // Check if won
            // Logic: If lobby is completed and winner_username matches
            if (entry.lobby?.status === 'completed' && entry.lobby?.winner_username === username) {
                // Winnings = Pot
                // Use prize_pool if available, otherwise we'd need to calculate it.
                const pot = Number(entry.lobby.prize_pool) || 0;

                if (pot > 0) {
                    totalFantasyWinnings += pot;
                    log.push(`Fantasy Win (Lobby ${entry.lobby.id}): +${pot}`);
                }
            }
        });

        // 4b. Fetch won lobbies to get accurate pot if prize_pool was missing
        const wonLobbyIds = entries
            .filter(e => e.lobby?.status === 'completed' && e.lobby?.winner_username === username && !e.lobby.prize_pool)
            .map(e => e.lobby.id);

        for (const lobbyId of wonLobbyIds) {
            const { count } = await supabase
                .from('multiplayer_entries')
                .select('*', { count: 'exact', head: true })
                .eq('lobby_id', lobbyId);

            const fee = 500;
            const pot = fee * (count || 0);
            totalFantasyWinnings += pot;
            log.push(`Fantasy Win (Lobby ${lobbyId} - Calc): +${pot}`);
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
