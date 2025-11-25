import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const raceId = searchParams.get('raceId');

        if (!raceId) {
            return NextResponse.json({ error: 'Race ID required' }, { status: 400 });
        }

        const supabase = getSupabaseClient();

        // Fetch all pending bets for this race
        // We only care about active bets (pending) or maybe all bets? 
        // Usually line movement is based on total volume taken.
        const { data: bets, error } = await supabase
            .from('bets')
            .select('driver_name, stake')
            .eq('race_id', raceId);

        if (error) {
            console.error('Error fetching bet stats:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Aggregate stakes by driver
        const stats = {};
        let totalVolume = 0;

        if (bets) {
            bets.forEach(bet => {
                const driver = bet.driver_name;
                const stake = Number(bet.stake) || 0;

                if (!stats[driver]) {
                    stats[driver] = 0;
                }
                stats[driver] += stake;
                totalVolume += stake;
            });
        }

        return NextResponse.json({
            stats,
            totalVolume
        });

    } catch (error) {
        console.error('Error in bet-stats API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
