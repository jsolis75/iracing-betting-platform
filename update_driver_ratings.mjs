import { getSupabaseClient } from './src/lib/supabase.js';
import fs from 'fs';

async function updateRatings() {
    try {
        const driversJson = JSON.parse(fs.readFileSync('./src/data/winstel_drivers.json', 'utf8'));
        const sampleJson = JSON.parse(fs.readFileSync('./src/data/iracing-sample.json', 'utf8'));

        // Build a map from sample data
        const ratingsMap = {};
        if (sampleJson.DriverInfo && sampleJson.DriverInfo.Drivers) {
            sampleJson.DriverInfo.Drivers.forEach(d => {
                ratingsMap[d.UserName.toLowerCase()] = d.IRating;
            });
        }

        const supabase = getSupabaseClient();
        console.log('Updating driver iRatings in DB...');

        for (const driver of driversJson) {
            const realRating = ratingsMap[driver.name.toLowerCase()];
            if (realRating) {
                const { error } = await supabase
                    .from('winstel_drivers')
                    .update({ irating: realRating })
                    .eq('name', driver.name);

                if (error) {
                    console.error(`Error updating ${driver.name}:`, error);
                } else {
                    console.log(`Updated ${driver.name} with iRating: ${realRating}`);
                }
            } else {
                // Fallback: search for existing rating or assign a sensible random one if not set
                // For now, if we don't have real data, we leave it or assign a reasonable average (2500)
                console.log(`No real data found for ${driver.name}, keeping current or default.`);
            }
        }

        console.log('Update complete.');

    } catch (err) {
        console.error('Update failed:', err);
    }
}

updateRatings();
