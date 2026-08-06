import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ============================================================
// GET /api/season — season-long standings, weekly champions,
// and cumulative profit series for the chart. Everything is
// computed server-side from the bets table (profit = won ?
// +potential_payout : -stake), so balance resets never corrupt
// season stats. CDN-cached 60s.
// ============================================================

const dayMs = 24 * 60 * 60 * 1000;

// Monday-start week bucket (UTC)
function weekStart(ts) {
    const d = new Date(ts);
    const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
    return start;
}

function weekLabel(startMs) {
    const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    const a = new Date(startMs).toLocaleDateString('en-US', opts);
    const b = new Date(startMs + 6 * dayMs).toLocaleDateString('en-US', opts);
    return `${a} – ${b}`;
}

function betProfit(bet) {
    if (bet.result === 'won') return Number(bet.potential_payout) || 0;
    if (bet.result === 'lost') return -(Number(bet.stake) || 0);
    return 0; // pending / void
}

function describeBet(bet) {
    let details = `${bet.driver_name} (${bet.bet_type} @ ${bet.odds})`;
    if (bet.race_id === 'multi' && Array.isArray(bet.details)) {
        const legs = bet.details.map(leg => `${leg.driver} (${leg.type})`).join(' + ');
        details = `Parlay: ${legs} (@ ${bet.odds})`;
    }
    return details;
}

export async function GET() {
    try {
        const supabase = getSupabaseClient();

        const [{ data: users }, { data: bets }] = await Promise.all([
            supabase.from('users').select('id, username, balance'),
            supabase.from('bets').select('id, user_id, race_id, driver_name, bet_type, odds, stake, potential_payout, status, result, details, created_at, settled_at')
        ]);

        const nameById = {};
        (users || []).forEach(u => { nameById[u.id] = u.username; });

        const settled = (bets || [])
            .filter(b => b.status !== 'pending' && (b.result === 'won' || b.result === 'lost'))
            .map(b => ({
                ...b,
                ts: new Date(b.settled_at || b.created_at).getTime(),
                profit: betProfit(b)
            }))
            .filter(b => Number.isFinite(b.ts))
            .sort((a, b) => a.ts - b.ts);

        // ---- Season standings (per user) ----
        const byUser = {};
        settled.forEach(b => {
            const u = (byUser[b.user_id] ||= {
                userId: b.user_id,
                username: nameById[b.user_id] || `User ${b.user_id}`,
                profit: 0, betCount: 0, wins: 0, losses: 0,
                biggestWin: { amount: 0, details: '' },
                underdogProfit: 0
            });
            u.profit += b.profit;
            u.betCount++;
            if (b.result === 'won') {
                u.wins++;
                const amt = Number(b.potential_payout) || 0;
                if (amt > u.biggestWin.amount) {
                    u.biggestWin = { amount: amt, details: describeBet(b) };
                }
                const oddsVal = typeof b.odds === 'string'
                    ? parseInt(String(b.odds).replace(/[+-]/g, ''), 10)
                    : Math.abs(Number(b.odds) || 0);
                const isPlus = String(b.odds).includes('+') || Number(b.odds) > 0;
                if (isPlus && oddsVal >= 400) u.underdogProfit += amt;
            } else {
                u.losses++;
            }
        });

        const standings = Object.values(byUser)
            .map(u => ({
                ...u,
                profit: Math.round(u.profit * 100) / 100,
                winRate: u.betCount > 0 ? Math.round((u.wins / u.betCount) * 100) : 0,
                balance: (users || []).find(x => x.id === u.userId)?.balance ?? null
            }))
            .sort((a, b) => b.profit - a.profit);

        // ---- Weekly champions (most recent 12 weeks with activity) ----
        const weeks = {};
        settled.forEach(b => {
            const ws = weekStart(b.ts);
            const w = (weeks[ws] ||= {});
            w[b.user_id] = (w[b.user_id] || 0) + b.profit;
        });

        const weekly = Object.entries(weeks)
            .map(([ws, totals]) => {
                const entries = Object.entries(totals)
                    .map(([uid, profit]) => ({
                        username: nameById[uid] || `User ${uid}`,
                        profit: Math.round(profit * 100) / 100
                    }))
                    .sort((a, b) => b.profit - a.profit);
                const startMs = Number(ws);
                return {
                    weekStart: startMs,
                    label: weekLabel(startMs),
                    isCurrent: weekStart(Date.now()) === startMs,
                    champion: entries[0] || null,
                    totals: entries.slice(0, 5)
                };
            })
            .sort((a, b) => b.weekStart - a.weekStart)
            .slice(0, 12);

        // ---- Cumulative profit series for the chart (top 6 by |profit|) ----
        const topUsers = [...standings]
            .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
            .slice(0, 6)
            .map(u => u.userId);

        const series = topUsers.map(uid => {
            let cum = 0;
            const points = [];
            settled.filter(b => b.user_id === uid).forEach(b => {
                cum += b.profit;
                points.push([b.ts, Math.round(cum * 100) / 100]);
            });
            return { username: nameById[uid] || `User ${uid}`, points };
        }).filter(s => s.points.length > 0);

        // ---- Slim bets for the global driver-performance section ----
        const slimBets = (bets || []).map(b => ({
            driver_name: b.driver_name,
            bet_type: b.bet_type,
            odds: b.odds,
            stake: b.stake,
            potential_payout: b.potential_payout,
            status: b.status,
            result: b.result,
            race_id: b.race_id
        }));

        const response = NextResponse.json({ standings, weekly, series, slimBets });
        response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        return response;

    } catch (error) {
        console.error('Season API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
