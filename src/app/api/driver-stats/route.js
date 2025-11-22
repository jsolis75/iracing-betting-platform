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

        // Load pre-generated JSON file
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
