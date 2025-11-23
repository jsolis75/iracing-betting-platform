import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { betId, result } = await request.json();

        if (!betId || !result) {
            return NextResponse.json({ error: 'Missing betId or result' }, { status: 400 });
        }

        if (result !== 'won' && result !== 'lost') {
            return NextResponse.json({ error: 'Result must be won or lost' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // Get the bet to verify it exists and is pending
        const { data: bet, error: fetchError } = await supabase
            .from('bets')
            .select('*')
            .eq('id', betId)
            .eq('status', 'pending')
            .single();

        if (fetchError || !bet) {
            return NextResponse.json({ error: 'Bet not found or already settled' }, { status: 404 });
        }

        // Only allow settling special bets manually
        if (!['slurmeister', 'fatality', 'kingkong'].includes(bet.bet_type)) {
            return NextResponse.json({ error: 'Only special bets can be manually settled' }, { status: 400 });
        }

        // Update bet status
        const { error: updateError } = await supabase
            .from('bets')
            .update({
                status: 'settled',
                result: result,
                settled_at: new Date().toISOString()
            })
            .eq('id', betId)
            .eq('status', 'pending'); // Double-check it's still pending

        if (updateError) {
            throw updateError;
        }

        // If won, pay out the user
        if (result === 'won') {
            const { data: userData } = await supabase
                .from('users')
                .select('balance')
                .eq('id', bet.user_id)
                .single();

            if (userData) {
                const totalPayout = Number(bet.stake) + Number(bet.potential_payout);
                await supabase
                    .from('users')
                    .update({ balance: userData.balance + totalPayout })
                    .eq('id', bet.user_id);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Bet settled as ${result}`
        });

    } catch (error) {
        console.error('Error in manual settlement:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
