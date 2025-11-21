import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { registerRace, updateRace, getRaceData } from '../races/route.js';

let driverStatsCache = null;
let defaultRaceId = null;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const raceId = searchParams.get('raceId');

    const maxRetries = 3;
    let lastError;

    // Load driver stats if not already loaded
    if (!driverStatsCache) {
        try {
            const statsPath = path.join(process.cwd(), 'src', 'data', 'driver_stats.json');
            const statsContent = fs.readFileSync(statsPath, 'utf8');
            driverStatsCache = JSON.parse(statsContent);
            console.log("Driver stats loaded into memory.");
        } catch (err) {
            console.error("Failed to load driver stats:", err);
            driverStatsCache = {}; // Fallback to empty
        }
    }

    // If raceId provided, try to get from registry first
    if (raceId) {
        const cachedData = getRaceData(raceId);
        if (cachedData) {
            return NextResponse.json(cachedData);
        }
    }

    for (let i = 0; i < maxRetries; i++) {
        try {
            // Read from the source data file
            const filePath = path.join(process.cwd(), 'src', 'data', 'iracing-sample.json');
            const fileContents = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContents);

            // Inject stats into drivers
            if (data.DriverInfo && data.DriverInfo.Drivers) {
                data.DriverInfo.Drivers.forEach(driver => {
                    const custId = String(driver.UserID);
                    if (driverStatsCache[custId]) {
                        driver.Stats = driverStatsCache[custId];
                    } else {
                        // Default stats if not found
                        driver.Stats = {
                            starts: 0,
                            wins: 0,
                            avgPoints: 0,
                            avgIncidents: 0,
                            avgFinish: 0,
                            top25Percent: 0,
                            winPercentage: 0
                        };
                    }
                });
            }

            // Register or update this race in the registry
            const raceName = data.WeekendInfo?.EventType || 'Live Race';
            const trackName = data.WeekendInfo?.TrackDisplayName || 'Unknown Track';

            if (!defaultRaceId) {
                defaultRaceId = registerRace({
                    name: raceName,
                    track: trackName,
                    source: 'live',
                    ...data
                });
            } else {
                updateRace(defaultRaceId, data);
            }

            return NextResponse.json(data);
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            lastError = error;
            // Wait a small amount of time before retrying (e.g., 50ms)
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    console.error('Error serving race data after retries:', lastError);
    return NextResponse.json(
        { error: 'Failed to load race data', details: lastError.message },
        { status: 500 }
    );
}
