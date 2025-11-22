import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function GET() {
    try {
        const supabase = getSupabaseClient();

        // Calculate timestamp for 1 hour ago
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // Fetch active races updated within the last hour
        const { data: races, error } = await supabase
            .from('races')
            .select('id, name, track, last_updated, data')
            .gt('last_updated', oneHourAgo)
            .order('last_updated', { ascending: false });

        if (error) {
            console.error('Error fetching races:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Format for the frontend
        const formattedRaces = races.map(race => ({
            id: race.id,
            name: race.data?.WeekendInfo?.TrackDisplayName || 'Unknown Track',
            track: race.data?.WeekendInfo?.TrackDisplayShortName || 'Unknown',
            source: 'broadcast', // All DB races are broadcasts
            lastUpdate: race.last_updated
        }));

        return NextResponse.json({ races: formattedRaces });

    } catch (error) {
        console.error('Error in races API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
