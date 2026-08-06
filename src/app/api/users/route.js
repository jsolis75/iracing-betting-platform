import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - Fetch user by username OR all users for leaderboard
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('username');

        const supabase = getSupabaseClient();

        // If no username, return all users for leaderboard
        if (!username) {
            try {
                // Fetch all users
                const { data: users, error: usersError } = await supabase
                    .from('users')
                    .select('id, username, email, balance, created_at')
                    .order('balance', { ascending: false });

                if (usersError) {
                    console.error('Error fetching users:', usersError);
                    return NextResponse.json({ users: [] }, { status: 200 });
                }

                // Fetch bet history for all users
                const { data: bets, error: betsError } = await supabase
                    .from('bets')
                    .select('*');

                if (betsError) {
                    console.error('Error fetching bets:', betsError);
                }

                // Attach bet history to each user
                const usersWithBets = users.map(user => ({
                    ...user,
                    betHistory: bets ? bets.filter(bet => bet.user_id === user.id) : []
                }));

                return NextResponse.json({ users: usersWithBets });
            } catch (err) {
                console.error('Leaderboard data fetch error:', err);
                // Return empty array instead of error for better UX
                return NextResponse.json({ users: [] }, { status: 200 });
            }
        }

        // Fetch specific user by username
        const { data, error } = await supabase
            .from('users')
            .select('id, username, email, balance, created_at, twitch_handle')
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
                .select('id, username, email, balance, created_at, twitch_handle')
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

// PUT - Update profile settings (currently: twitch handle)
export async function PUT(request) {
    try {
        const { userId, twitchHandle } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        // Sanitize: twitch logins are 3-25 chars, alphanumeric + underscore.
        // Accept full URLs too ("twitch.tv/somebody" -> "somebody"). Empty clears it.
        let handle = (twitchHandle || '').trim().toLowerCase();
        handle = handle.replace(/^https?:\/\//, '').replace(/^(www\.)?twitch\.tv\//, '').replace(/\/.*$/, '');
        if (handle && !/^[a-z0-9_]{3,25}$/.test(handle)) {
            return NextResponse.json({ error: 'That does not look like a valid Twitch username' }, { status: 400 });
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .update({ twitch_handle: handle || null })
            .eq('id', userId)
            .select('id, username, email, balance, created_at, twitch_handle')
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'That Twitch account is already linked to another user' }, { status: 400 });
            }
            console.error('Twitch handle update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, user: data });
    } catch (error) {
        console.error('Error updating profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
