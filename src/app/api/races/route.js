import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET() {
    try {
        const supabase = getSupabaseClient();

        // Calculate timestamp for 1 hour ago
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // Fetch active races updated within the last hour.
        // BANDWIDTH: project only the JSON fields we need instead of pulling the
        // whole `data` blob (100KB+ per race) out of Supabase on every poll.
        const { data: races, error } = await supabase
            .from('races')
            .select('id, name, track, last_updated, trackDisplayName:data->WeekendInfo->>TrackDisplayName, trackShortName:data->WeekendInfo->>TrackDisplayShortName, sessionState:data->Telemetry->>SessionState')
            .gt('last_updated', oneHourAgo)
            .order('last_updated', { ascending: false });

        if (error) {
            console.error('Error fetching races:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // BUGFIX: the old filter hid any race whose Race session had non-empty
        // ResultsPositions — but iRacing fills those in LIVE during the race, so
        // races disappeared from the sidebar the moment the green flag dropped.
        // A race is "over" when the session reaches CoolDown (6); everything
        // fresher than an hour and not in cooldown is shown.
        const activeRaces = (races || []).filter(race => {
            const state = Number(race.sessionState);
            return !(state >= 6); // hide only cooldown/finished; unknown state => show
        });

        // Format for the frontend
        const formattedRaces = activeRaces.map(race => ({
            id: race.id,
            name: race.trackDisplayName || race.name || 'Unknown Track',
            track: race.trackShortName || race.track || 'Unknown',
            source: 'broadcast', // All DB races are broadcasts
            lastUpdate: race.last_updated
        }));

        const response = NextResponse.json({ races: formattedRaces });
        // Let the CDN absorb polling across users
        response.headers.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
        return response;

    } catch (error) {
        console.error('Error in races API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
