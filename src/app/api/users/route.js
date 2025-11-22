import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - Fetch user by username
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('username');

        if (!username) {
            return NextResponse.json({ error: 'Username required' }, { status: 400 });
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .select('id, username, email, balance, created_at')
            .eq('username', username)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Create new user (signup) or login
export async function POST(request) {
    try {
        const { username, email, password, action } = await request.json();
        const supabase = getSupabaseClient();

        if (action === 'login') {
            // Simple login - just check if user exists
            const { data, error } = await supabase
                .from('users')
                .select('id, username, email, balance, created_at')
                .eq('username', username)
                .single();

            if (error || !data) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            return NextResponse.json({ success: true, user: data });
        }

        if (action === 'signup') {
            // Create new user
            const { data, error } = await supabase
                .from('users')
                .insert([
                    {
                        username,
                        email: email || `${username}@example.com`,
                        password_hash: 'simple_hash',
                        balance: 1000.00
                    }
                ])
                .select('id, username, email, balance, created_at')
                .single();

            if (error) {
                if (error.code === '23505') { // Unique violation
                    return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
                }
                console.error('Signup error:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, user: data });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error in user API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
