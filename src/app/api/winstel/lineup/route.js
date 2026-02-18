import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const userId = searchParams.get('userId');

    if (!eventId || !userId) {
        return NextResponse.json({ error: 'Missing eventId or userId' }, { status: 400 });
    }

    try {
        const { data: entry, error } = await supabase
            .from('winstel_entries')
            .select('*')
            .eq('event_id', eventId)
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        return NextResponse.json({ entry: entry || null });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const supabase = getSupabaseClient();

    try {
        const { eventId, userId, driverIds } = await request.json();

        if (!eventId || !userId || !driverIds || driverIds.length !== 6) {
            return NextResponse.json({ error: 'Valid lineup requires 6 drivers' }, { status: 400 });
        }

        // 1. Verify salary cap
        const { data: salaries, error: salaryError } = await supabase
            .from('winstel_salaries')
            .select('salary')
            .eq('event_id', eventId)
            .in('driver_id', driverIds);

        if (salaryError) throw salaryError;

        const totalSalary = salaries.reduce((sum, s) => sum + s.salary, 0);
        if (totalSalary > 50000) {
            return NextResponse.json({ error: `Salary cap exceeded: $${totalSalary}` }, { status: 400 });
        }

        // 2. Check if event is still open
        const { data: event } = await supabase
            .from('winstel_events')
            .select('status')
            .eq('id', eventId)
            .single();

        if (event.status !== 'upcoming') {
            return NextResponse.json({ error: 'Event is already live or finished' }, { status: 400 });
        }

        // 3. Save lineup
        const { data, error: entryError } = await supabase
            .from('winstel_entries')
            .upsert({
                event_id: eventId,
                user_id: userId,
                driver_ids: driverIds
            }, { onConflict: 'event_id, user_id' })
            .select()
            .single();

        if (entryError) throw entryError;

        return NextResponse.json({ success: true, entry: data });

    } catch (error) {
        console.error('Lineup submission error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
