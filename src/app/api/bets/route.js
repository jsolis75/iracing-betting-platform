import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - Fetch user's bets
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('bets')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching bets:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ bets: data || [] });
    } catch (error) {
        console.error('Error fetching bets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Place new bet
export async function POST(request) {
    try {
        const { userId, raceId, driverName, betType, stake, odds, potentialPayout, details } = await request.json();

        if (!userId || !raceId || !driverName || !betType || !stake || !odds) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // Check user balance
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('balance')
            .eq('id', userId)
            .single();

        if (userError || !userData) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (userData.balance < stake) {
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
        }

        // Deduct stake from balance
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: userData.balance - stake })
            .eq('id', userId);

        if (updateError) {
            console.error('Error updating balance:', updateError);
            return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 });
        }

        // Create bet
        const { data: betData, error: betError } = await supabase
            .from('bets')
            .insert([
                {
                    user_id: userId,
                    race_id: raceId,
                    driver_name: driverName,
                    bet_type: betType,
                    stake,
                    odds,
                    potential_payout: potentialPayout,
                    status: 'pending',
                    details: details
                }
            ])
            .select()
            .single();

        if (betError) {
            console.error('Error creating bet:', betError);
            return NextResponse.json({ error: betError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, bet: betData });
    } catch (error) {
        console.error('Error placing bet:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT - Update bet status (settle)
export async function PUT(request) {
    try {
        const { betId, status, result: betResult } = await request.json();
        const supabase = getSupabaseClient();

        // Get bet details
        const { data: bet, error: betError } = await supabase
            .from('bets')
            .select('*')
            .eq('id', betId)
            .single();

        if (betError || !bet) {
            return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
        }

        // Update bet - ATOMIC CHECK
        const { data: settledBet, error: updateError } = await supabase
            .from('bets')
            .update({
                status,
                result: betResult,
                settled_at: new Date().toISOString()
            })
            .eq('id', betId)
            .eq('status', 'pending') // CRITICAL: Only update if still pending
            .select()
            .single();

        if (updateError || !settledBet) {
            // If update failed or returned no data, it means another process already settled this bet
            return NextResponse.json({ error: 'Bet already settled or update failed' }, { status: 400 });
        }

        // If won, add payout to user balance
        if (betResult === 'won') {
            const { data: userData } = await supabase
                .from('users')
                .select('balance')
                .eq('id', bet.user_id)
                .single();

            if (userData) {
                // FIX: Refund Stake + Pay Profit
                const totalPayout = Number(bet.stake) + Number(bet.potential_payout);

                await supabase
                    .from('users')
                    .update({ balance: userData.balance + totalPayout })
                    .eq('id', bet.user_id);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error settling bet:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
