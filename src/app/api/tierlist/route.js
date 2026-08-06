import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// ============================================================
// Community Tier Lists
//  GET  /api/tierlist?userId=  -> driver pool + top-10s + my votes
//  POST /api/tierlist          -> toggle a vote { userId, category, driverKey, driverName }
//
// Driver pool = everyone who has appeared in a broadcast race on the
// site (the community + their split rivals), enriched with career
// stats (avg incidents) from the stats file.
// Requires: TIER_LIST_SETUP.sql run in Supabase.
// ============================================================

const CATEGORIES = ['terrorists', 'cleanest'];

// In-memory caches (warm lambda)
let poolCache = { drivers: null, builtAt: 0 };
let statsCache = { map: null, loadedAt: 0 };
const POOL_TTL = 10 * 60 * 1000;   // rebuild pool every 10 min
const STATS_TTL = 60 * 60 * 1000;

function loadStatsMap() {
    const now = Date.now();
    if (statsCache.map && now - statsCache.loadedAt < STATS_TTL) return statsCache.map;
    try {
        const p = path.join(process.cwd(), 'src', 'data', 'driver_stats.json');
        if (fs.existsSync(p)) {
            statsCache = { map: JSON.parse(fs.readFileSync(p, 'utf-8')), loadedAt: now };
            return statsCache.map;
        }
    } catch (e) {
        console.error('tierlist stats load failed:', e);
    }
    statsCache = { map: {}, loadedAt: now };
    return statsCache.map;
}

async function buildDriverPool(supabase) {
    const now = Date.now();
    if (poolCache.drivers && now - poolCache.builtAt < POOL_TTL) return poolCache.drivers;

    // Pull drivers from the most recent broadcast races (jsonb projection only)
    const { data: races } = await supabase
        .from('races')
        .select('drivers:data->DriverInfo->Drivers, last_updated')
        .order('last_updated', { ascending: false })
        .limit(60);

    const statsMap = loadStatsMap();
    const byId = new Map();

    (races || []).forEach(r => {
        (Array.isArray(r.drivers) ? r.drivers : []).forEach(d => {
            const userId = d.UserID || d.CustID;
            if (!userId || userId < 0) return;                        // pace car etc.
            if (Number(d.CarIsPaceCar || 0) === 1) return;
            if (Number(d.IsSpectator || 0) === 1) return;
            if (!d.UserName) return;

            // Most recent appearance wins (freshest iRating / license)
            if (!byId.has(String(userId))) {
                const stats = statsMap[userId] || statsMap[String(userId)] || null;
                byId.set(String(userId), {
                    key: String(userId),
                    name: d.UserName,
                    iRating: d.IRating || null,
                    license: d.LicString || stats?.licenseClass || null,  // e.g. "A 4.99" (class + safety rating)
                    avgIncidents: stats ? stats.avgIncidents : null,
                    starts: stats ? stats.starts : null
                });
            }
        });
    });

    const drivers = [...byId.values()].sort((a, b) => (b.iRating || 0) - (a.iRating || 0));
    poolCache = { drivers, builtAt: now };
    return drivers;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        const supabase = getSupabaseClient();
        const pool = await buildDriverPool(supabase);
        const poolByKey = new Map(pool.map(d => [d.key, d]));

        // All votes (tiny table; aggregate in memory)
        const { data: votes, error } = await supabase
            .from('tier_votes')
            .select('user_id, category, driver_key, driver_name');

        if (error) {
            // Table probably missing — tell the owner what to do, don't 500 the UI
            return NextResponse.json({
                pool, categories: {}, myVotes: {},
                setupRequired: true,
                error: 'tier_votes table not found — run TIER_LIST_SETUP.sql in Supabase'
            });
        }

        const counts = {}; // category -> key -> {votes, name}
        CATEGORIES.forEach(c => (counts[c] = {}));
        const myVotes = {};
        CATEGORIES.forEach(c => (myVotes[c] = []));

        (votes || []).forEach(v => {
            if (!counts[v.category]) return;
            if (!counts[v.category][v.driver_key]) {
                counts[v.category][v.driver_key] = { votes: 0, name: v.driver_name };
            }
            counts[v.category][v.driver_key].votes++;
            if (userId && String(v.user_id) === String(userId)) {
                myVotes[v.category].push(v.driver_key);
            }
        });

        const categories = {};
        CATEGORIES.forEach(c => {
            categories[c] = Object.entries(counts[c])
                .map(([key, info]) => {
                    const d = poolByKey.get(key);
                    return {
                        key,
                        name: d?.name || info.name,
                        iRating: d?.iRating ?? null,
                        license: d?.license ?? null,
                        avgIncidents: d?.avgIncidents ?? null,
                        votes: info.votes
                    };
                })
                .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
                .slice(0, 10);
        });

        return NextResponse.json({ pool, categories, myVotes });

    } catch (error) {
        console.error('Tierlist GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { userId, category, driverKey, driverName } = await request.json();

        if (!userId || !Number.isFinite(Number(userId))) {
            return NextResponse.json({ error: 'Login required to vote' }, { status: 401 });
        }
        if (!CATEGORIES.includes(category)) {
            return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
        }
        if (!driverKey || !driverName) {
            return NextResponse.json({ error: 'Missing driver' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // TOGGLE: try to insert; if the vote already exists, remove it
        const { error: insertError } = await supabase
            .from('tier_votes')
            .insert([{
                user_id: Number(userId),
                category,
                driver_key: String(driverKey),
                driver_name: String(driverName).slice(0, 100)
            }]);

        if (insertError) {
            if (insertError.code === '23505') { // unique violation -> unvote
                await supabase
                    .from('tier_votes')
                    .delete()
                    .eq('user_id', Number(userId))
                    .eq('category', category)
                    .eq('driver_key', String(driverKey));
                return NextResponse.json({ success: true, voted: false });
            }
            console.error('Tierlist vote error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, voted: true });

    } catch (error) {
        console.error('Tierlist POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
