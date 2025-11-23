import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// DELETE - Remove old race data
export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const keepRecent = searchParams.get('keep') || 10; // Default to keeping last 10 races
        const secret = searchParams.get('secret');

        // Simple protection
        if (secret !== process.env.CRON_SECRET && secret !== 'cleanup-key-123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getSupabaseClient();

        // 1. Get IDs of the most recent races to KEEP
        const { data: recentRaces, error: fetchError } = await supabase
            .from('races')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(keepRecent);

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        const keepIds = recentRaces.map(r => r.id);

        if (keepIds.length === 0) {
            return NextResponse.json({ message: 'No races found to clean up.' });
        }

        // 2. Delete races NOT in the keep list
        const { error: deleteError, count } = await supabase
            .from('races')
            .delete({ count: 'exact' })
            .not('id', 'in', `(${keepIds.join(',')})`);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Deleted ${count} old races. Kept ${keepIds.length} most recent.`
        });

    } catch (error) {
        console.error('Error cleaning up races:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
