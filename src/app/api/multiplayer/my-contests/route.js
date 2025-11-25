import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const history = searchParams.get('history'); // If true, fetch completed lobbies

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // Fetch entries for this user, including lobby and race details
        // If history=true, fetch completed lobbies, otherwise fetch active ones
        const { data: entries, error } = await supabase
            .from('multiplayer_entries')
            .select(`
                *,
                lobby:multiplayer_lobbies!inner (
                    id,
                    status,
                    prize_pool,
                    race_id
                )
            `)
            .eq('user_id', userId)
        [history === 'true' ? 'eq' : 'neq']('lobby.status', 'completed')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Now we need to fetch race details for each lobby
        // We can't easily join the 'races' table because it might not be fully linked in Supabase types or just complex.
        // Let's fetch all relevant races manually.
        const raceIds = entries.map(e => e.lobby.race_id);

        // Fetch races from 'races' table
        const { data: races } = await supabase
            .from('races')
            .select('id, data')
            .in('id', raceIds);

        const raceMap = {};
        if (races) {
            races.forEach(r => {
                raceMap[r.id] = {
                    name: r.data?.WeekendInfo?.TrackDisplayName || 'Unknown Track',
                    track: r.data?.WeekendInfo?.TrackDisplayShortName || 'Unknown'
                };
            });
        }

        // Combine data
        const contests = entries.map(entry => ({
            id: entry.id,
            lobbyId: entry.lobby.id,
            raceId: entry.lobby.race_id,
            status: entry.lobby.status,
            prizePool: entry.lobby.prize_pool,
            entry_fee: entry.lobby.entry_fee || 500,
            raceName: raceMap[entry.lobby.race_id]?.name || 'Unknown Race',
            trackName: raceMap[entry.lobby.race_id]?.track || '',
            score: entry.score || 0,
            position: entry.rank || 0,
            winnings: entry.winnings || 0
        }));

        return NextResponse.json({ contests });

    } catch (error) {
        console.error('Error fetching my contests:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
