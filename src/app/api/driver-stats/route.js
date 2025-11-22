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

        // Load CSV file
        const csvPath = path.join(process.cwd(), 'iracerdata', 'Oval_driver_stats.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        // Parse CSV
        const lines = csvContent.split('\n');
        const headers = lines[0].split(',');

        // Find column indices
        const driverIndex = 0; // DRIVER
        const custIdIndex = 1; // CUSTID
        const avgIncIndex = 12; // AVG_INC
        const startsIndex = 4; // STARTS
        const winsIndex = 5; // WINS
        const avgPointsIndex = 8; // AVG_POINTS
        const top25Index = 9; // TOP25PCNT
        const classIndex = 13; // CLASS

        // Build stats map (key = CUSTID, value = stats object)
        const statsMap = {};

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const cols = lines[i].split(',');
            if (cols.length < 14) continue;

            const driverName = cols[driverIndex];
            const custId = cols[custIdIndex]; // Get Customer ID
            const avgIncidents = parseFloat(cols[avgIncIndex]) || 3.0;
            const starts = parseInt(cols[startsIndex]) || 0;
            const wins = parseInt(cols[winsIndex]) || 0;
            const avgPoints = parseFloat(cols[avgPointsIndex]) || 50;
            const top25Percent = parseInt(cols[top25Index]) || 0;
            const licenseClass = cols[classIndex];

            // Use CUSTID as key if available, otherwise fallback to name (unlikely)
            const key = custId || driverName;

            statsMap[key] = {
                name: driverName, // Store name for reference
                avgIncidents,
                starts,
                wins,
                avgPoints,
                top25Percent,
                winPercentage: starts > 0 ? (wins / starts) * 100 : 0,
                avgFinish: 0, // Not in CSV
                licenseClass
            };
        }

        // Cache the results
        statsCache = statsMap;
        lastLoadTime = now;

        return NextResponse.json({ stats: statsMap });

    } catch (error) {
        console.error('Error loading driver stats:', error);
        return NextResponse.json({ error: 'Failed to load driver stats', stats: {} }, { status: 500 });
    }
}
