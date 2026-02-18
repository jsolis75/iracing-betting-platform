import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const supabase = getSupabaseClient();

    try {
        // 1. Calculate the "Target Race Date" based on "Wednesday morning" swap
        // A week starts on Wednesday and ends on Tuesday.
        // The race is always the Sunday within that span.
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 is Sunday, 3 is Wednesday

        // Find most recent Wednesday
        const lastWed = new Date(now);
        const diffToWed = (dayOfWeek < 3) ? (dayOfWeek + 4) : (dayOfWeek - 3);
        lastWed.setDate(now.getDate() - diffToWed);
        lastWed.setHours(0, 0, 0, 0);

        // Target Sunday is Wednesday + 4 days
        const targetSunday = new Date(lastWed);
        targetSunday.setDate(lastWed.getDate() + 4);
        const dateStr = targetSunday.toISOString().split('T')[0];

        // 2. Get the event for that date
        let currentEvent;
        const { data: event, error: eventError } = await supabase
            .from('winstel_events')
            .select('*')
            .eq('race_date', dateStr)
            .single();

        if (eventError || !event) {
            // Fallback to the next upcoming event if specific date not found
            const { data: fallbackEvent } = await supabase
                .from('winstel_events')
                .select('*')
                .gte('race_date', now.toISOString().split('T')[0])
                .order('race_date', { ascending: true })
                .limit(1)
                .single();

            if (!fallbackEvent) {
                return NextResponse.json({ error: 'No active Winstel event found' }, { status: 404 });
            }
            currentEvent = fallbackEvent;
        } else {
            currentEvent = event;
        }

        // 3. Get drivers with their salaries for this event
        const { data: drivers, error: driverError } = await supabase
            .from('winstel_drivers')
            .select(`
                *,
                winstel_salaries (salary)
            `)
            .eq('winstel_salaries.event_id', currentEvent.id);

        if (driverError) throw driverError;

        // Flatten salary data
        const formattedDrivers = drivers.map(d => ({
            ...d,
            salary: d.winstel_salaries?.[0]?.salary || 0
        }));

        return NextResponse.json({ event: currentEvent, drivers: formattedDrivers });

    } catch (error) {
        console.error('Winstel drivers fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
