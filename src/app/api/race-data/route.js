import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET - Fetch race data
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const raceId = searchParams.get('raceId');

        let data = null;
        let error = null;

        // Try to fetch from Supabase (if configured)
        try {
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

            const result = await query;
            data = result.data;
            error = result.error;
        } catch (dbError) {
            // Supabase not configured, continue to local file
            // console.log("Supabase not available:", dbError.message);
        }

        // If we got data from DB, return it
        if (data && !error) {
            return NextResponse.json(data.data);
        }

        // If DB failed or empty, TRY LOCAL FALLBACK
        // console.log("DB failed or empty, checking local file...");
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(process.cwd(), 'src', 'data', 'live_race_data.json');

            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const localData = JSON.parse(fileContent);

                // Check if data is recent (within 5 minutes)
                const lastUpdated = new Date(localData.last_updated || 0);
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

                if (lastUpdated > fiveMinutesAgo) {
                    // console.log('Serving race data from local file fallback');
                    return NextResponse.json(localData);
                }
            }
        } catch (localError) {
            console.error('Local fallback failed:', localError);
        }

        // If both DB and Local failed, return "No active race"
        return NextResponse.json({
            message: "No active race found",
            WeekendInfo: { TrackDisplayName: "Waiting for Broadcast..." },
            DriverInfo: { Drivers: [] }
        });

    } catch (error) {
        console.error('Error fetching race data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
