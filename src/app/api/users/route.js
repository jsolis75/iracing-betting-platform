import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/supabase';

// GET - Fetch user by username
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('username');

        if (!username) {
            return NextResponse.json({ error: 'Username required' }, { status: 400 });
        }

        const pool = await getDbConnection();
        const result = await pool.query(
            'SELECT id, username, email, balance, created_at FROM users WHERE username = $1',
            [username]
        );

        await pool.end();

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Create new user (signup) or login
export async function POST(request) {
    try {
        const { username, email, password, action } = await request.json();

        const pool = await getDbConnection();

        if (action === 'login') {
            // Simple login - just check if user exists
            const result = await pool.query(
                'SELECT id, username, email, balance, created_at FROM users WHERE username = $1',
                [username]
            );

            await pool.end();

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            return NextResponse.json({ success: true, user: result.rows[0] });
        }

        if (action === 'signup') {
            // Create new user
            try {
                const result = await pool.query(
                    'INSERT INTO users (username, email, password_hash, balance) VALUES ($1, $2, $3, $4) RETURNING id, username, email, balance, created_at',
                    [username, email || `${username}@example.com`, 'simple_hash', 1000.00]
                );

                await pool.end();

                return NextResponse.json({ success: true, user: result.rows[0] });
            } catch (error) {
                await pool.end();

                if (error.code === '23505') { // Unique violation
                    return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
                }
                throw error;
            }
        }

        await pool.end();
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error in user API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
