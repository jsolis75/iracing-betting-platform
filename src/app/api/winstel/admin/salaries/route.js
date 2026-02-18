import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const supabase = getSupabaseClient();

    try {
        const { userId, eventId, driverId, salary } = await request.json();

        // 1. Authorization - only "dumindu" can adjust salaries
        const { data: user } = await supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();

        if (!user || user.username !== 'dumindu') {
            return NextResponse.json({ error: 'Unauthorized. Only admin can adjust salaries.' }, { status: 403 });
        }

        // 2. Clear to update salary
        const { data, error } = await supabase
            .from('winstel_salaries')
            .upsert({
                event_id: eventId,
                driver_id: driverId,
                salary: salary
            }, { onConflict: 'event_id, driver_id' })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, salary: data });

    } catch (error) {
        console.error('Admin salary update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
