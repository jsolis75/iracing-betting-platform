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
                response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
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
                // MULTI-RACE: with several broadcasters live at once, "most
                // recently updated" flip-flops between races every few seconds
                // as their updates leapfrog. Pick the OLDEST fresh race instead —
                // a stable default; other races are selected via the sidebar.
                const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
                query = query
                    .gt('last_updated', fiveMinutesAgo)
                    .order('created_at', { ascending: true })
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

        // If still no data, return 404/Empty (CDN-cached: idle polling is cheap)
        if (!data) {
            const emptyResponse = NextResponse.json({
                message: "No active race found",
                WeekendInfo: { TrackDisplayName: "Waiting for Broadcast..." },
                DriverInfo: { Drivers: [] }
            });
            emptyResponse.headers.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
            return emptyResponse;
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

        // 5. PROCESS DATA (Slim + Merge Positions & Stats)
        // The stored payload can be 100KB+ of raw iRacing YAML data. The frontend
        // only uses a small subset, so we rebuild a slim response (~90% smaller)
        // instead of echoing the whole thing back to every poller.
        const raw = data.data || {};
        const rawSessions = Array.isArray(raw.SessionInfo?.Sessions) ? raw.SessionInfo.Sessions : [];
        const rawDrivers = Array.isArray(raw.DriverInfo?.Drivers) ? raw.DriverInfo.Drivers : [];

        // Qualifying positions (starting grid)
        const qualifyingSession = rawSessions.find(s => s.SessionType === 'Qualify' || s.SessionType === 'Lone Qualify' || s.SessionType === 'Open Qualify');
        const startingPositions = {};
        if (Array.isArray(qualifyingSession?.ResultsPositions)) {
            qualifyingSession.ResultsPositions.forEach(result => {
                startingPositions[result.CarIdx] = result.Position;
            });
        }

        // Live positions come ONLY from an actual Race session (a practice
        // broadcast must not present practice standings as race positions)
        const raceSession = rawSessions.find(s => s.SessionType === 'Race');
        const positionsByCarIdx = {};
        if (Array.isArray(raceSession?.ResultsPositions)) {
            raceSession.ResultsPositions.forEach(result => {
                positionsByCarIdx[result.CarIdx] = result;
            });
        }

        const statsMap = getDriverStats();

        const slimDrivers = rawDrivers.map(driver => {
            const pos = positionsByCarIdx[driver.CarIdx];
            const driverStats = statsMap ? statsMap[driver.UserID] : null;
            return {
                CarIdx: driver.CarIdx,
                UserID: driver.UserID,
                CustID: driver.CustID,
                UserName: driver.UserName,
                TeamName: driver.TeamName,
                CarNumber: driver.CarNumber,
                IRating: driver.IRating,
                LicString: driver.LicString,
                LicSubLevel: driver.LicSubLevel,
                CurDriverIncidentCount: driver.CurDriverIncidentCount,
                CarIsPaceCar: driver.CarIsPaceCar,
                IsSpectator: driver.IsSpectator,
                CarIdxPosition: startingPositions[driver.CarIdx] || driver.CarIdxPosition,
                Position: pos?.Position,
                ClassPosition: pos?.ClassPosition,
                Lap: pos?.Lap,
                LastTime: pos?.LastTime,
                FastestTime: pos?.FastestTime,
                stats: driverStats ? {
                    starts: driverStats.starts,
                    wins: driverStats.wins,
                    avgPoints: driverStats.avgPoints,
                    avgIncidents: driverStats.avgIncidents,
                    avgFinish: driverStats.avgFinish,
                    top25Percent: driverStats.top25Percent,
                    winPercentage: driverStats.winPercentage
                } : undefined
            };
        });

        const slimSessions = rawSessions.map(s => ({
            SessionNum: s.SessionNum,
            SessionName: s.SessionName,
            SessionType: s.SessionType,
            SessionLaps: s.SessionLaps,
            SessionState: s.SessionState,
            ResultsLapsComplete: s.ResultsLapsComplete,
            ResultsPositions: Array.isArray(s.ResultsPositions) ? s.ResultsPositions.map(p => ({
                CarIdx: p.CarIdx,
                Position: p.Position,
                ClassPosition: p.ClassPosition,
                PositionsMoved: p.PositionsMoved,
                Lap: p.Lap,
                LapsComplete: p.LapsComplete,
                LastTime: p.LastTime,
                FastestTime: p.FastestTime,
                ReasonOutStr: p.ReasonOutStr,
                Incidents: p.Incidents
            })) : undefined
        }));

        const w = raw.WeekendInfo || {};
        let responsePayload = {
            _dbId: data.id,
            WeekendInfo: {
                SessionID: w.SessionID,
                SubSessionID: w.SubSessionID,
                SeriesID: w.SeriesID,
                TrackDisplayName: w.TrackDisplayName,
                TrackDisplayShortName: w.TrackDisplayShortName,
                TrackName: w.TrackName
            },
            SessionInfo: { Sessions: slimSessions },
            DriverInfo: { Drivers: slimDrivers },
            Telemetry: raw.Telemetry || {}
        };

        // 6. UPDATE CACHE
        if (!raceId) { // Only cache the main polling request
            globalCache.raceData = responsePayload;
            globalCache.lastUpdated = lastUpdated;
            globalCache.lastFetchTime = now;
        }

        // 7. RETURN RESPONSE
        // s-maxage lets Vercel's CDN serve all users from ONE origin response per
        // 5s window (origin transfer becomes O(1) per interval instead of O(users)).
        const response = NextResponse.json(responsePayload);
        if (lastUpdated) {
            response.headers.set('Last-Modified', lastUpdated.toUTCString());
            response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
            response.headers.set('X-Cache', 'MISS'); // Debug header
        }

        return response;

    } catch (error) {
        console.error('Error fetching race data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
