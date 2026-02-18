import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const supabase = getSupabaseClient();

    try {
        const { data: standings, error } = await supabase
            .from('winstel_standings')
            .select(`
                total_score,
                users (username)
            `)
            .order('total_score', { ascending: false });

        if (error) throw error;

        const formattedStandings = standings.map(s => ({
            username: s.users?.username || 'Unknown',
            score: s.total_score
        }));

        return NextResponse.json({ standings: formattedStandings });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
