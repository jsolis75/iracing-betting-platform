import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const supabase = getSupabaseClient();
    const { raceId, userId } = await request.json();

    if (!raceId || !userId) {
        return NextResponse.json({ error: 'Missing raceId or userId' }, { status: 400 });
    }

    try {
        // 1. Get or Create Lobby
        let { data: lobby, error: lobbyError } = await supabase
            .from('multiplayer_lobbies')
            .select('*')
            .eq('race_id', raceId)
            .single();

        if (lobbyError && lobbyError.code !== 'PGRST116') { // PGRST116 is "Row not found"
            throw lobbyError;
        }

        if (!lobby) {
            const { data: newLobby, error: createError } = await supabase
                .from('multiplayer_lobbies')
                .insert([{ race_id: raceId, status: 'open', prize_pool: 0 }])
                .select()
                .single();

            if (createError) throw createError;
            lobby = newLobby;
        }

        // 2. Check if user already joined
        const { data: existingEntry } = await supabase
            .from('multiplayer_entries')
            .select('*')
            .eq('lobby_id', lobby.id)
            .eq('user_id', userId)
            .single();

        if (existingEntry) {
            return NextResponse.json({ success: true, alreadyJoined: true, entry: existingEntry, lobby });
        }

        // 3. Deduct Balance (Transaction-like)
        // Note: Supabase doesn't support multi-table transactions easily via JS client without RPC.
        // We will do it sequentially and hope for the best (or use RPC if we had one).

        // Fetch user balance
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('balance')
            .eq('id', userId)
            .single();

        if (userError || !user) throw new Error('User not found');
        if (user.balance < 500) {
            return NextResponse.json({ error: 'Insufficient funds. Entry fee is $500.' }, { status: 402 });
        }

        // Deduct
        const { error: deductError } = await supabase
            .from('users')
            .update({ balance: user.balance - 500 })
            .eq('id', userId);

        if (deductError) throw deductError;

        // 4. Add Entry and Update Prize Pool
        const { data: entry, error: entryError } = await supabase
            .from('multiplayer_entries')
            .insert([{
                lobby_id: lobby.id,
                user_id: userId,
                score: 0,
                status: 'active'
            }])
            .select()
            .single();

        if (entryError) throw entryError;

        // Update Prize Pool
        await supabase
            .from('multiplayer_lobbies')
            .update({ prize_pool: lobby.prize_pool + 500 })
            .eq('id', lobby.id);

        return NextResponse.json({ success: true, entry, lobby });

    } catch (error) {
        console.error('Join error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
