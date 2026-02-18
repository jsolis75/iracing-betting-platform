import { getSupabaseClient } from './src/lib/supabase.js';

async function checkDrivers() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('winstel_drivers')
            .select('*')
            .limit(5);

        if (error) {
            console.error('Error fetching drivers:', error);
            return;
        }

        console.log('Sample Drivers from DB:');
        data.forEach(d => {
            console.log(`${d.name} (#${d.car_number}): iRating=${d.irating}`);
        });

        const { count } = await supabase
            .from('winstel_drivers')
            .select('*', { count: 'exact', head: true });

        console.log(`Total drivers in DB: ${count}`);

    } catch (err) {
        console.error('Failed to connect to Supabase:', err.message);
    }
}

checkDrivers();
