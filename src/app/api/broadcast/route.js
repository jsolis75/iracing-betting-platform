import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        // 1. Check API Key
        const apiKey = request.headers.get('x-api-key');
        if (apiKey !== 'iracing-broadcast-key-123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();

        // Handle raw YAML from C# broadcaster
        let weekendInfo = data.WeekendInfo;
        if (weekendInfo?.RawYAML) {
            const yaml = weekendInfo.RawYAML;
            const sessionIdMatch = yaml.match(/SubSessionID:\s*(\d+)/);
            const sessionMatch = yaml.match(/SessionID:\s*(\d+)/);

            weekendInfo = {
                SubSessionID: sessionIdMatch ? sessionIdMatch[1] : '0',
                SessionID: sessionMatch ? sessionMatch[1] : '0'
            };
        }

        const subSessionID = weekendInfo?.SubSessionID;
        const sessionID = weekendInfo?.SessionID;
        const uniqueID = subSessionID && subSessionID !== '0' ? subSessionID : sessionID;
        const trackName = weekendInfo?.TrackDisplayName || 'Unknown Track';

        if (!uniqueID) {
            return NextResponse.json({ error: 'Invalid data: No SessionID' }, { status: 400 });
        }

        // Save to Supabase
        try {
            const supabase = getSupabaseClient();
            const { data: existingRace } = await supabase
                .from('races')
                .select('id')
                .eq('iracing_session_id', uniqueID)
                .single();

            if (existingRace) {
                await supabase
                    .from('races')
                    .update({
                        data: data,
                        last_updated: new Date().toISOString(),
                        status: 'active'
                    })
                    .eq('id', existingRace.id);
            } else {
                await supabase
                    .from('races')
                    .insert([{
                        iracing_session_id: uniqueID,
                        name: trackName,
                        track: trackName,
                        status: 'active',
                        data: data,
                        created_at: new Date().toISOString(),
                        last_updated: new Date().toISOString()
                    }]);
            }
        } catch (dbError) {
            console.error('DB Error:', dbError);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Broadcast error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
