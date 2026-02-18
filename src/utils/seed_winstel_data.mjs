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

    const schedule = [
        "Daytona International Speedway Oval - 2008",
        "Auto Club Speedway Oval",
        "Bristol Motor Speedway Dual Pit Roads",
        "Las Vegas Motor Speedway Oval",
        "[Legacy] Texas Motor Speedway - 2009 Oval",
        "Martinsville Speedway",
        "Charlotte Motor Speedway Oval Night",
        "Dover Motor Speedway",
        "[Legacy] Pocono Raceway - 2009 Oval",
        "New Hampshire Motor Speedway Oval",
        "Chicagoland Speedway",
        "Watkins Glen International Cup",
        "Indianapolis Motor Speedway NASCAR Oval",
        "Auto Club Speedway Oval",
        "Richmond Raceway Night",
        "Kansas Speedway Oval",
        "[Legacy] Michigan International Speedway - 2009",
        "Talladega Superspeedway",
        "[Legacy] Phoenix Raceway - 2008 Oval",
        "EchoPark Speedway (Atlanta) Oval - 2008"
    ];

    console.log('Seeding Winstel Events...');

    let startDate = new Date('2026-02-22');

    const { data: drivers } = await supabase.from('winstel_drivers').select('*');

    for (let i = 0; i < schedule.length; i++) {
        const raceDate = new Date(startDate);
        raceDate.setDate(startDate.getDate() + (i * 7));
        const dateStr = raceDate.toISOString().split('T')[0];

        const { data: event, error: eventError } = await supabase
            .from('winstel_events')
            .upsert({
                name: `Week ${i + 1}: ${schedule[i].split(' [')[0]}`,
                track_name: schedule[i],
                event_order: i + 1,
                race_date: dateStr,
                status: 'upcoming'
            }, { onConflict: 'event_order' })
            .select()
            .single();

        if (eventError) {
            console.error(`Error seeding event ${i + 1}:`, eventError);
            continue;
        }

        // Always update salaries for upcoming events to reflect new iRatings/rounding
        const salaries = drivers.map(d => {
            const rawSalary = Math.floor((d.irating / 7000) * 10000) + 4000;
            const roundedSalary = Math.round(rawSalary / 100) * 100;
            return {
                event_id: event.id,
                driver_id: d.id,
                salary: roundedSalary
            };
        });

        const { error: salaryError } = await supabase
            .from('winstel_salaries')
            .upsert(salaries, { onConflict: 'event_id, driver_id' });

        if (salaryError) console.error(`Error seeding salaries for week ${i + 1}:`, salaryError);
    }

    console.log('Winstel Seeding Complete!');
}

seed();
