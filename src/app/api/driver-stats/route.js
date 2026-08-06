import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Cache the stats in memory
let statsCache = null;
let lastLoadTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

function loadStats() {
    const now = Date.now();
    if (statsCache && (now - lastLoadTime) < CACHE_DURATION) {
        return statsCache;
    }

    // 1. Try loading user-provided JSON (Array format)
    const userJsonPath = path.join(process.cwd(), 'iracerdata', 'Oval_driver_stats.json');

    if (fs.existsSync(userJsonPath)) {
        const jsonContent = fs.readFileSync(userJsonPath, 'utf-8');
        const statsArray = JSON.parse(jsonContent);

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
        return statsMap;
    }

    // 2. Fallback to pre-generated JSON file (Map format)
    const jsonPath = path.join(process.cwd(), 'src', 'data', 'driver_stats.json');

    if (fs.existsSync(jsonPath)) {
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        statsCache = JSON.parse(jsonContent);
        lastLoadTime = now;
        return statsCache;
    }

    statsCache = {};
    lastLoadTime = now;
    return statsCache;
}

// BANDWIDTH FIX: this endpoint used to return the ENTIRE stats file
// (~90MB of JSON, half a million drivers) to every caller. The homepage
// no longer calls it at all (stats are injected per-driver by /api/race-data);
// if anything still needs stats, it must ask for specific driver IDs:
//   GET /api/driver-stats?ids=123,456,789
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const idsParam = searchParams.get('ids');

        if (!idsParam) {
            return NextResponse.json({
                error: 'Pass ?ids=<comma-separated driver IDs>. Full-file downloads are disabled (the file is ~90MB).',
                stats: {}
            }, { status: 400 });
        }

        const allStats = loadStats();
        const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);

        const stats = {};
        ids.forEach(id => {
            if (allStats[id]) stats[id] = allStats[id];
        });

        const response = NextResponse.json({ stats });
        // Stats change rarely; let the CDN cache per-ids responses for an hour
        response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return response;

    } catch (error) {
        console.error('Error loading driver stats:', error);
        return NextResponse.json({ error: 'Failed to load driver stats', stats: {} }, { status: 500 });
    }
}
