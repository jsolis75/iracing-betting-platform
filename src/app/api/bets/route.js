import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - Fetch user's bets (or all manual settlement bets if manual=true)
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const manual = searchParams.get('manual');
        const status = searchParams.get('status');

        const supabase = getSupabaseClient();

        // Special case: Fetch ALL pending manual settlement bets (for admins)
        if (manual === 'true') {
            let query = supabase
                .from('bets')
                .select('*')
                .in('bet_type', ['slurmeister', 'fatality', 'kingkong']);

            if (status) {
                query = query.eq('status', status);
            }

            query = query.order('created_at', { ascending: false });

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching manual bets:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json(data || []);
        }

        // Normal case: Fetch user's bets
        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

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

        // SECURITY: validate numbers. A negative stake used to pass the balance
        // check and INCREASE the user's balance; an inflated potentialPayout
        // minted free money at settlement. Payout is recomputed server-side.
        const stakeNum = Number(stake);
        const oddsNum = Number(odds);
        if (!Number.isFinite(stakeNum) || stakeNum <= 0 || stakeNum > 1000000) {
            return NextResponse.json({ error: 'Invalid stake' }, { status: 400 });
        }
        if (!Number.isFinite(oddsNum) || oddsNum === 0) {
            return NextResponse.json({ error: 'Invalid odds' }, { status: 400 });
        }
        // American odds payout: positive => stake * (odds/100), negative => stake * (100/|odds|)
        const computedPayout = oddsNum > 0
            ? stakeNum * (oddsNum / 100)
            : stakeNum * (100 / Math.abs(oddsNum));
        const safePayout = Math.round(computedPayout * 100) / 100;

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

        if (userData.balance < stakeNum) {
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
        }

        // Deduct stake from balance
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: userData.balance - stakeNum })
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
                    stake: stakeNum,
                    odds: oddsNum,
                    potential_payout: safePayout, // server-computed, never client-trusted
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
