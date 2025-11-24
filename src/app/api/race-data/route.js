import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET - Fetch race data
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const raceId = searchParams.get('raceId');
        const ifModifiedSince = request.headers.get('if-modified-since');

        let data = null;
        let error = null;
        let lastUpdated = null;

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
            if (result.data) {
                data = result.data;
                lastUpdated = new Date(data.last_updated);
            }
            error = result.error;
        } catch (dbError) {
            // Supabase not configured, continue to local file
        }

        // If DB failed or empty, TRY LOCAL FALLBACK
        if (!data || error) {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(process.cwd(), 'src', 'data', 'live_race_data.json');

                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const localData = JSON.parse(fileContent);

                    // Check if data is recent (within 5 minutes)
                    const localLastUpdated = new Date(localData.last_updated || 0);
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

                    if (localLastUpdated > fiveMinutesAgo) {
                        data = { data: localData }; // Structure to match DB format
                        lastUpdated = localLastUpdated;
                    }
                }
            } catch (localError) {
                console.error('Local fallback failed:', localError);
            }
        }

        // If still no data, return 404/Empty
        if (!data) {
            return NextResponse.json({
                message: "No active race found",
                WeekendInfo: { TrackDisplayName: "Waiting for Broadcast..." },
                DriverInfo: { Drivers: [] }
            });
        }

        // CHECK CACHE
        if (ifModifiedSince && lastUpdated) {
            const ifModifiedSinceDate = new Date(ifModifiedSince);
            // Compare timestamps (allow 1s difference for precision)
            if (lastUpdated.getTime() <= ifModifiedSinceDate.getTime() + 1000) {
                return new NextResponse(null, { status: 304 });
            }
        }

        // Return Data with Last-Modified Header
        // Inject the Database UUID so the frontend can reference this race correctly
        let responsePayload = { ...data.data, _dbId: data.id };

        // MERGE LIVE POSITIONS: Combine DriverInfo with current race positions from SessionInfo
        if (responsePayload.SessionInfo?.Sessions && responsePayload.DriverInfo?.Drivers) {
            // Find the current session (last one in the array)
            const sessions = responsePayload.SessionInfo.Sessions;
            const currentSession = sessions[sessions.length - 1];

            if (currentSession?.ResultsPositions) {
                // Create lookup by CarIdx
                const positionsByCarIdx = {};
                currentSession.ResultsPositions.forEach(result => {
                    positionsByCarIdx[result.CarIdx] = result;
                });

                // Merge position data into each driver
                responsePayload.DriverInfo.Drivers = responsePayload.DriverInfo.Drivers.map(driver => ({
                    ...driver,
                    // Add live position fields
                    Position: positionsByCarIdx[driver.CarIdx]?.Position,
                    ClassPosition: positionsByCarIdx[driver.CarIdx]?.ClassPosition,
                    Lap: positionsByCarIdx[driver.CarIdx]?.Lap,
                    LastTime: positionsByCarIdx[driver.CarIdx]?.LastTime,
                    FastestTime: positionsByCarIdx[driver.CarIdx]?.FastestTime
                }));
            }
        }

        const response = NextResponse.json(responsePayload);
        if (lastUpdated) {
            response.headers.set('Last-Modified', lastUpdated.toUTCString());
            // Add Cache-Control to prevent browser from caching too aggressively without validation
            response.headers.set('Cache-Control', 'no-cache, must-revalidate');
        }

        return response;

    } catch (error) {
        console.error('Error fetching race data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
