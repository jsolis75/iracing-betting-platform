import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const supabase = getSupabaseClient();

    try {
        // 1. Get current active event
        const { data: event, error: eventError } = await supabase
            .from('winstel_events')
            .select('*')
            .in('status', ['upcoming', 'live'])
            .order('event_order', { ascending: true })
            .limit(1)
            .single();

        if (eventError || !event) {
            return NextResponse.json({ error: 'No active Winstel event found' }, { status: 404 });
        }

        // 2. Get drivers with their salaries for this event
        const { data: drivers, error: driverError } = await supabase
            .from('winstel_drivers')
            .select(`
                *,
                winstel_salaries (salary)
            `)
            .eq('winstel_salaries.event_id', event.id);

        if (driverError) throw driverError;

        // Flatten salary data
        const formattedDrivers = drivers.map(d => ({
            ...d,
            salary: d.winstel_salaries?.[0]?.salary || 0
        }));

        return NextResponse.json({ event, drivers: formattedDrivers });

    } catch (error) {
        console.error('Winstel drivers fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
