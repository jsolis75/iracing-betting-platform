import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        // 1. Check API Key (Simple security)
        const apiKey = request.headers.get('x-api-key');
        if (apiKey !== 'iracing-broadcast-key-123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();
        // 2. Identify the race
        const subSessionID = data.WeekendInfo?.SubSessionID;
        const sessionID = data.WeekendInfo?.SessionID;
        const uniqueID = subSessionID && subSessionID !== '0' ? subSessionID : sessionID;
        const trackName = data.WeekendInfo?.TrackDisplayName || 'Unknown Track';

        if (!uniqueID) {
            return NextResponse.json({ error: 'Invalid data: No SessionID' }, { status: 400 });
        }

        // 3. Update or Insert into Supabase (if configured)
        try {
            const supabase = getSupabaseClient();

            // First, check if race exists
            const { data: existingRace } = await supabase
                .from('races')
                .select('id')
                .eq('iracing_session_id', uniqueID)
                .single();

            let result;

            if (existingRace) {
                // Update existing
                result = await supabase
                    .from('races')
                    .update({
                        data: data,
                        last_updated: new Date().toISOString(),
                        status: 'active'
                    })
                    .eq('id', existingRace.id);
            } else {
                // Insert new
                result = await supabase
                    .from('races')
                    .insert([
                        {
                            iracing_session_id: uniqueID,
                            name: trackName,
                            track: trackName,
                            status: 'active',
                            data: data,
                            created_at: new Date().toISOString(),
                            last_updated: new Date().toISOString()
                        }
                    ]);
            }

            if (result.error) {
                console.error('Database error:', result.error);
                // Continue to fallback even if DB fails
            }
        } catch (dbError) {
            // Supabase not configured or failed, ignore and use fallback
            // console.warn('Supabase skipped:', dbError.message);
        }

        // 4. FALLBACK: Write to local JSON file for development/backup
        // This ensures data is available even if Supabase is not configured or fails
        try {
            const fs = require('fs');
            const path = require('path');
            const dataDir = path.join(process.cwd(), 'src', 'data');

            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const filePath = path.join(dataDir, 'live_race_data.json');

            // Add a timestamp to the data
            const localData = {
                ...data,
                last_updated: new Date().toISOString()
            };

            fs.writeFileSync(filePath, JSON.stringify(localData, null, 2));
            // console.log('Saved live race data to local file:', filePath);
        } catch (fileError) {
            console.error('Failed to write local race data:', fileError);
            // Don't fail the request if local write fails, but log it
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Ingest error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
