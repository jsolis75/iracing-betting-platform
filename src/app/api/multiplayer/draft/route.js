import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const supabase = getSupabaseClient();
    const { lobbyId, userId, drivers, captain } = await request.json();

    if (!lobbyId || !userId || !drivers || drivers.length !== 3 || !captain) {
        return NextResponse.json({ error: 'Invalid draft data' }, { status: 400 });
    }

    try {
        // Update the entry
        const { data, error } = await supabase
            .from('multiplayer_entries')
            .update({
                driver_1: drivers[0],
                driver_2: drivers[1],
                driver_3: drivers[2],
                captain_driver: captain
            })
            .eq('lobby_id', lobbyId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, entry: data });

    } catch (error) {
        console.error('Draft error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
