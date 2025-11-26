import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// --- IN-MEMORY CACHE ---
// This cache persists across requests as long as the serverless container is warm
let globalCache = {
    raceData: null,
    lastUpdated: null,
    lastFetchTime: 0,
    driverStats: null,
    statsLastLoaded: 0
};

const CACHE_TTL = 5000; // 5 seconds cache for race data
const STATS_TTL = 60 * 60 * 1000; // 1 hour cache for driver stats (they change rarely)

// Helper to load driver stats efficiently
const getDriverStats = () => {
    const now = Date.now();
    if (globalCache.driverStats && (now - globalCache.statsLastLoaded < STATS_TTL)) {
        return globalCache.driverStats;
    }

    try {
        const statsPath = path.join(process.cwd(), 'src', 'data', 'driver_stats.json');
        if (fs.existsSync(statsPath)) {
            const statsContent = fs.readFileSync(statsPath, 'utf-8');
            globalCache.driverStats = JSON.parse(statsContent);
            globalCache.statsLastLoaded = now;
            return globalCache.driverStats;
        }
    } catch (error) {
        console.error('Error loading driver stats:', error);
    }
    return null;
};

// GET - Fetch race data
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const raceId = searchParams.get('raceId');
        const ifModifiedSince = request.headers.get('if-modified-since');
        const now = Date.now();

        // 1. SERVE FROM CACHE IF FRESH (and no specific raceId requested)
        // This bypasses DB calls and file reads completely for high-traffic polling
        if (!raceId && globalCache.raceData && (now - globalCache.lastFetchTime < CACHE_TTL)) {
            // Check If-Modified-Since against CACHED lastUpdated
            if (ifModifiedSince && globalCache.lastUpdated) {
                const ifModifiedSinceDate = new Date(ifModifiedSince);
                if (globalCache.lastUpdated.getTime() <= ifModifiedSinceDate.getTime() + 1000) {
                    return new NextResponse(null, { status: 304 });
                }
            }

            // Return cached payload
            const response = NextResponse.json(globalCache.raceData);
            if (globalCache.lastUpdated) {
                response.headers.set('Last-Modified', globalCache.lastUpdated.toUTCString());
                response.headers.set('Cache-Control', 'no-cache, must-revalidate');
                response.headers.set('X-Cache', 'HIT'); // Debug header
            }
            return response;
        }

        let data = null;
        let error = null;
        let lastUpdated = null;

        // 2. FETCH NEW DATA (DB or File)
        try {
            const supabase = getSupabaseClient();
            let query = supabase.from('races').select('*');

            if (raceId) {
                query = query.eq('id', raceId).single();
            } else {
                // Fetch most recently updated race (optimized query)
                const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
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
            // Supabase not configured or failed, continue to local file
        }

        // 3. LOCAL FALLBACK (Optimized)
        if (!data || error) {
            try {
                const filePath = path.join(process.cwd(), 'src', 'data', 'live_race_data.json');

                if (fs.existsSync(filePath)) {
                    // Check modification time BEFORE reading content
                    const stats = fs.statSync(filePath);
                    const localLastUpdated = stats.mtime;
                    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

                    if (localLastUpdated > fiveMinutesAgo) {
                        const fileContent = fs.readFileSync(filePath, 'utf-8');
                        const localData = JSON.parse(fileContent);
                        data = { data: localData, id: 'local' }; // Structure to match DB format
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

        // 4. CHECK IF-MODIFIED-SINCE (Before processing)
        if (ifModifiedSince && lastUpdated) {
            const ifModifiedSinceDate = new Date(ifModifiedSince);
            if (lastUpdated.getTime() <= ifModifiedSinceDate.getTime() + 1000) {
                // Update cache timestamp even on 304 so we don't hit DB again immediately
                globalCache.lastFetchTime = now;
                globalCache.lastUpdated = lastUpdated;
                return new NextResponse(null, { status: 304 });
            }
        }

        // 5. PROCESS DATA (Merge Positions & Stats)
        let responsePayload = { ...data.data, _dbId: data.id };

        // Merge Live Positions
        if (responsePayload.SessionInfo?.Sessions && responsePayload.DriverInfo?.Drivers) {
            const sessions = responsePayload.SessionInfo.Sessions;

            // Qualifying positions
            const qualifyingSession = sessions.find(s => s.SessionType === 'Qualify' || s.SessionType === 'Lone Qualify');
            const startingPositions = {};
            if (qualifyingSession?.ResultsPositions) {
                qualifyingSession.ResultsPositions.forEach(result => {
                    startingPositions[result.CarIdx] = result.Position;
                });
            }

            // Race positions
            const raceSession = sessions.find(s => s.SessionType === 'Race') || sessions[sessions.length - 1];
            if (raceSession?.ResultsPositions) {
                const positionsByCarIdx = {};
                raceSession.ResultsPositions.forEach(result => {
                    positionsByCarIdx[result.CarIdx] = result;
                });

                responsePayload.DriverInfo.Drivers = responsePayload.DriverInfo.Drivers.map(driver => ({
                    ...driver,
                    CarIdxPosition: startingPositions[driver.CarIdx] || driver.CarIdxPosition,
                    Position: positionsByCarIdx[driver.CarIdx]?.Position,
                    ClassPosition: positionsByCarIdx[driver.CarIdx]?.ClassPosition,
                    Lap: positionsByCarIdx[driver.CarIdx]?.Lap,
                    LastTime: positionsByCarIdx[driver.CarIdx]?.LastTime,
                    FastestTime: positionsByCarIdx[driver.CarIdx]?.FastestTime
                }));
            }
        }

        // Inject Driver Stats (From Memory Cache)
        const statsMap = getDriverStats();
        if (statsMap) {
            responsePayload.DriverInfo.Drivers = responsePayload.DriverInfo.Drivers.map(driver => {
                const driverStats = statsMap[driver.UserID];
                if (driverStats) {
                    return {
                        ...driver,
                        stats: {
                            starts: driverStats.starts,
                            wins: driverStats.wins,
                            avgPoints: driverStats.avgPoints,
                            avgIncidents: driverStats.avgIncidents,
                            avgFinish: driverStats.avgFinish,
                            top25Percent: driverStats.top25Percent,
                            winPercentage: driverStats.winPercentage
                        }
                    };
                }
                return driver;
            });
        }

        // 6. UPDATE CACHE
        if (!raceId) { // Only cache the main polling request
            globalCache.raceData = responsePayload;
            globalCache.lastUpdated = lastUpdated;
            globalCache.lastFetchTime = now;
        }

        // 7. RETURN RESPONSE
        const response = NextResponse.json(responsePayload);
        if (lastUpdated) {
            response.headers.set('Last-Modified', lastUpdated.toUTCString());
            response.headers.set('Cache-Control', 'no-cache, must-revalidate');
            response.headers.set('X-Cache', 'MISS'); // Debug header
        }

        return response;

    } catch (error) {
        console.error('Error fetching race data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
