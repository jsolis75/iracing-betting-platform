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

        // Check if user is admin 'dumindu'
        const { data: user } = await supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();

        const isAdmin = user?.username === 'dumindu';

        let query = supabase
            .from('multiplayer_entries')
            .select(`
                *,
                lobby:multiplayer_lobbies!inner (
                    id,
                    status,
                    prize_pool,
                    race_id
                )
            `);

        if (isAdmin && history !== 'true') {
            // Admin sees ALL active lobbies, not just their entries
            // We need to fetch lobbies directly instead of entries for admin
            const { data: lobbies, error: lobbyError } = await supabase
                .from('multiplayer_lobbies')
                .select('*')
                .neq('status', 'completed')
                .order('created_at', { ascending: false });

            if (lobbyError) throw lobbyError;

            // Mock entries for these lobbies so the rest of the logic works
            const adminContests = lobbies.map(lobby => ({
                id: `admin-${lobby.id}`,
                lobbyId: lobby.id,
                raceId: lobby.race_id,
                status: lobby.status,
                prizePool: lobby.prize_pool,
                entry_fee: lobby.entry_fee || 500,
                score: 0,
                position: 0,
                winnings: 0
            }));

            // We still need race names, so let's proceed to the race fetch part
            const raceIds = lobbies.map(l => l.race_id);
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

            const contests = adminContests.map(c => ({
                ...c,
                raceName: raceMap[c.raceId]?.name || 'Unknown Race',
                trackName: raceMap[c.raceId]?.track || ''
            }));

            return NextResponse.json({ contests });
        }

        // Normal user logic (or admin history)
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
