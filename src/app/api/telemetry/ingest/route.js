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
        const supabase = getSupabaseClient();

        // 2. Identify the race
        // We use SubSessionID (more specific) or SessionID from iRacing as the unique identifier
        const subSessionID = data.WeekendInfo?.SubSessionID;
        const sessionID = data.WeekendInfo?.SessionID;
        const uniqueID = subSessionID && subSessionID !== '0' ? subSessionID : sessionID;

        const trackName = data.WeekendInfo?.TrackDisplayName || 'Unknown Track';

        if (!uniqueID) {
            return NextResponse.json({ error: 'Invalid data: No SessionID' }, { status: 400 });
        }

        // 3. Update or Insert into Supabase
        // We'll store the latest JSON blob in the 'races' table

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
            return NextResponse.json({ error: result.error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Ingest error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
