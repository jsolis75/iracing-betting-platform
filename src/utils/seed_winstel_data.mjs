import { getSupabaseClient } from '../lib/supabase.js';
import fs from 'fs';
import path from 'path';

async function seed() {
    const supabase = getSupabaseClient();

    // Read drivers data
    const driversData = JSON.parse(fs.readFileSync('./src/data/winstel_drivers.json', 'utf8'));

    console.log('Seeding Winstel Drivers...');

    // 1. Insert Drivers
    for (const d of driversData) {
        const { error } = await supabase
            .from('winstel_drivers')
            .upsert({
                name: d.name,
                team: d.team,
                car_number: d.car_number,
                notes: d.notes || null,
                irating: Math.floor(Math.random() * 5000) + 1000 // Placeholder iRating
            }, { onConflict: 'name, car_number' });

        if (error) console.error(`Error inserting driver ${d.name}:`, error);
    }

    // 2. Create an initial event if none exists
    const { data: events, error: eventError } = await supabase
        .from('winstel_events')
        .select('*')
        .limit(1);

    if (eventError) {
        console.error('Error checking events:', eventError);
        return;
    }

    if (events.length === 0) {
        console.log('Creating initial Winstel event...');
        const { data: newEvent, error: insertEventError } = await supabase
            .from('winstel_events')
            .insert({
                name: 'Season Launch: Daytona',
                event_order: 1,
                status: 'upcoming'
            })
            .select()
            .single();

        if (insertEventError) {
            console.error('Error creating event:', insertEventError);
            return;
        }

        // 3. Seed initial salaries for the event
        const { data: drivers } = await supabase.from('winstel_drivers').select('*');
        const salaries = drivers.map(d => ({
            event_id: newEvent.id,
            driver_id: d.id,
            salary: Math.floor((d.irating / 7000) * 10000) + 4000 // Scale salary by iRating
        }));

        const { error: salaryError } = await supabase
            .from('winstel_salaries')
            .insert(salaries);

        if (salaryError) console.error('Error seeding salaries:', salaryError);
    }

    console.log('Winstel Seeding Complete!');
}

seed();
