import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/supabase';

// GET - Fetch user's bets
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        const pool = await getDbConnection();
        const result = await pool.query(
            'SELECT * FROM bets WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        await pool.end();

        return NextResponse.json({ bets: result.rows });
    } catch (error) {
        console.error('Error fetching bets:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Place new bet
export async function POST(request) {
    try {
        const { userId, raceId, driverName, betType, stake, odds, potentialPayout } = await request.json();

        if (!userId || !raceId || !driverName || !betType || !stake || !odds) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pool = await getDbConnection();

        // Check user balance
        const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);

        if (userResult.rows.length === 0) {
            await pool.end();
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (userResult.rows[0].balance < stake) {
            await pool.end();
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
        }

        // Deduct stake from balance
        await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [stake, userId]);

        // Create bet
        const result = await pool.query(
            `INSERT INTO bets (user_id, race_id, driver_name, bet_type, stake, odds, potential_payout, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
            [userId, raceId, driverName, betType, stake, odds, potentialPayout]
        );

        await pool.end();

        return NextResponse.json({ success: true, bet: result.rows[0] });
    } catch (error) {
        console.error('Error placing bet:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT - Update bet status (settle)
export async function PUT(request) {
    try {
        const { betId, status, result: betResult } = await request.json();

        const pool = await getDbConnection();

        // Get bet details
        const betQuery = await pool.query('SELECT * FROM bets WHERE id = $1', [betId]);

        if (betQuery.rows.length === 0) {
            await pool.end();
            return NextResponse.json({ error: 'Bet not found' }, { status: 404 });
        }

        const bet = betQuery.rows[0];

        // Update bet
        await pool.query(
            'UPDATE bets SET status = $1, result = $2, settled_at = NOW() WHERE id = $3',
            [status, betResult, betId]
        );

        // If won, add payout to user balance
        if (betResult === 'won') {
            await pool.query(
                'UPDATE users SET balance = balance + $1 WHERE id = $2',
                [bet.potential_payout, bet.user_id]
            );
        }

        await pool.end();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error settling bet:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
