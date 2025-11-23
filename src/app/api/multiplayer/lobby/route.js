import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get('raceId');

    if (!raceId) {
        return NextResponse.json({ error: 'Missing raceId' }, { status: 400 });
    }

    try {
        // Get Lobby
        const { data: lobby, error: lobbyError } = await supabase
            .from('multiplayer_lobbies')
            .select('*')
            .eq('race_id', raceId)
            .single();

        if (lobbyError) {
            if (lobbyError.code === 'PGRST116') {
                return NextResponse.json({ lobby: null });
            }
            throw lobbyError;
        }

        // Get Entries with Usernames
        const { data: entries, error: entriesError } = await supabase
            .from('multiplayer_entries')
            .select(`
                *,
                users (username)
            `)
            .eq('lobby_id', lobby.id);

        if (entriesError) throw entriesError;

        // Flatten user data
        const formattedEntries = entries.map(e => ({
            ...e,
            username: e.users?.username || 'Unknown'
        }));

        return NextResponse.json({ lobby, entries: formattedEntries });

    } catch (error) {
        console.error('Lobby fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
