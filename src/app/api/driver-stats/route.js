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

        if (fs.existsSync(jsonPath)) {
            const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
            const statsMap = JSON.parse(jsonContent);
            statsCache = statsMap;
            lastLoadTime = now;
            return NextResponse.json({ stats: statsMap });
        }

        // 3. Fallback to CSV file (Slower but works without conversion step)
        const csvPath = path.join(process.cwd(), 'iracerdata', 'Oval_driver_stats.csv');

        if (fs.existsSync(csvPath)) {
            // console.log("Loading stats from CSV...");
            const csvContent = fs.readFileSync(csvPath, 'utf-8');
            const lines = csvContent.split('\n');

            // Find column indices
            const driverIndex = 0; // DRIVER
            const custIdIndex = 1; // CUSTID
            const avgIncIndex = 12; // AVG_INC
            const startsIndex = 4; // STARTS
            const winsIndex = 5; // WINS
            const avgPointsIndex = 8; // AVG_POINTS
            const top25Index = 9; // TOP25PCNT
            const classIndex = 13; // CLASS

            const statsMap = {};

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                const cols = lines[i].split(',');
                if (cols.length < 14) continue;

                const driverName = cols[driverIndex];
                const custId = cols[custIdIndex];
                const avgIncidents = parseFloat(cols[avgIncIndex]) || 3.0;
                const starts = parseInt(cols[startsIndex]) || 0;
                const wins = parseInt(cols[winsIndex]) || 0;
                const avgPoints = parseFloat(cols[avgPointsIndex]) || 50;
                const top25Percent = parseInt(cols[top25Index]) || 0;
                const licenseClass = cols[classIndex];

                const key = custId || driverName;

                statsMap[key] = {
                    name: driverName,
                    avgIncidents,
                    starts,
                    wins,
                    avgPoints,
                    top25Percent,
                    winPercentage: starts > 0 ? (wins / starts) * 100 : 0,
                    avgFinish: 0,
                    licenseClass
                };
            }

            statsCache = statsMap;
            lastLoadTime = now;
            return NextResponse.json({ stats: statsMap });
        }

        console.error('No stats file found (JSON or CSV).');
        return NextResponse.json({ stats: {} });

    } catch (error) {
        console.error('Error loading driver stats:', error);
        return NextResponse.json({ error: 'Failed to load driver stats', stats: {} }, { status: 500 });
    }
}
