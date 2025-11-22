import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET - Fetch race data
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const raceId = searchParams.get('raceId');

        const supabase = getSupabaseClient();

        let query = supabase
            .from('races')
            .select('*');

        if (raceId) {
            // Fetch specific race
            query = query.eq('id', raceId).single();
        } else {
            // Fetch most recently updated race, BUT only if it was updated in the last 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

            query = query
                .gt('last_updated', fiveMinutesAgo)
                .order('last_updated', { ascending: false })
                .limit(1)
                .single();
        }

        const { data, error } = await query;

        if (error || !data) {
            // Fallback for demo/testing if no live race
            // We can return a "Waiting for broadcast" state
            return NextResponse.json({
                message: "No active race found",
                WeekendInfo: { TrackDisplayName: "Waiting for Broadcast..." },
                SessionInfo: { Sessions: [] },
                DriverInfo: { Drivers: [] }
            });
        }

        // Return the stored JSON data
        return NextResponse.json(data.data);

    } catch (error) {
        console.error('Error fetching race data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
