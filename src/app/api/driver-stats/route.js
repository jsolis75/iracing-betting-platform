import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Cache the stats in memory
let statsCache = null;
let lastLoadTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export async function GET(request) {
    try {
        // Check if cache is still valid
        const now = Date.now();
        if (statsCache && (now - lastLoadTime) < CACHE_DURATION) {
            return NextResponse.json({ stats: statsCache });
        }

        // 1. Try loading user-provided JSON (Array format)
        const userJsonPath = path.join(process.cwd(), 'iracerdata', 'Oval_driver_stats.json');

        if (fs.existsSync(userJsonPath)) {
            // console.log("Loading stats from user-provided JSON...");
            const jsonContent = fs.readFileSync(userJsonPath, 'utf-8');
            const statsArray = JSON.parse(jsonContent);

            // Convert Array to Map
            const statsMap = {};
            statsArray.forEach(driver => {
                if (driver.CUSTID) {
                    statsMap[driver.CUSTID] = {
                        name: driver.DRIVER,
                        avgIncidents: driver.AVG_INC,
                        starts: driver.STARTS,
                        wins: driver.WINS,
                        avgPoints: driver.AVG_POINTS,
                        top25Percent: driver.TOP25PCNT,
                        winPercentage: driver.STARTS > 0 ? (driver.WINS / driver.STARTS) * 100 : 0,
                        avgFinish: driver.AVG_FINISH_POS,
                        licenseClass: driver.CLASS
                    };
                }
            });

            statsCache = statsMap;
            lastLoadTime = now;
            return NextResponse.json({ stats: statsMap });
        }

        // 2. Fallback to pre-generated JSON file (Map format)
        const jsonPath = path.join(process.cwd(), 'src', 'data', 'driver_stats.json');

        if (!fs.existsSync(jsonPath)) {
            console.error('Stats JSON not found. Run convert_csv_to_json.py first.');
            return NextResponse.json({ stats: {} });
        }

        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const statsMap = JSON.parse(jsonContent);

        // Cache the results
        statsCache = statsMap;
        lastLoadTime = now;

        return NextResponse.json({ stats: statsMap });

    } catch (error) {
        console.error('Error loading driver stats:', error);
        return NextResponse.json({ error: 'Failed to load driver stats', stats: {} }, { status: 500 });
    }
}
