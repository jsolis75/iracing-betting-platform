import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
    try {
        // 1. Check API Key (Simple security)
        const apiKey = request.headers.get('x-api-key');
        if (apiKey !== 'iracing-broadcast-key-123') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await request.json();

        // Handle raw YAML from C# broadcaster
        let weekendInfo = data.WeekendInfo;
        if (weekendInfo?.RawYAML) {
            // Parse YAML to extract SessionID
            const yaml = weekendInfo.RawYAML;
            const sessionIdMatch = yaml.match(/SubSessionID:\s*(\d+)/);
            const sessionMatch = yaml.match(/SessionID:\s*(\d+)/);

            weekendInfo = {
                SubSessionID: sessionIdMatch ? sessionIdMatch[1] : '0',
                SessionID: sessionMatch ? sessionMatch[1] : '0'
            };
        }

        // 2. Identify the race
        const subSessionID = weekendInfo?.SubSessionID;
        const sessionID = weekendInfo?.SessionID;
        const uniqueID = subSessionID && subSessionID !== '0' ? subSessionID : sessionID;
        const trackName = weekendInfo?.TrackDisplayName || data.SessionInfo?.TrackDisplayName || 'Unknown Track';

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

        // 4. Winstel Cup Live Scoring Logic
        try {
            const supabase = getSupabaseClient();

            // a. Find active Winstel event
            const now = new Date();
            const { data: event } = await supabase
                .from('winstel_events')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .order('race_date', { ascending: true })
                .limit(1)
                .single();

            if (event) {
                // b. Extract driver results from telemetry
                const sessions = data.SessionInfo?.Sessions || [];
                const raceSession = sessions.find(s => s.SessionType === 'Race') || sessions[sessions.length - 1];

                if (raceSession?.ResultsPositions) {
                    const telemetryDrivers = data.DriverInfo?.Drivers || [];

                    // c. Map telemetry results to Winstel drivers
                    const { data: winstelDrivers } = await supabase.from('winstel_drivers').select('*');
                    const driverResultsMapping = {};

                    raceSession.ResultsPositions.forEach(res => {
                        const tDriver = telemetryDrivers.find(d => d.CarIdx === res.CarIdx);
                        if (tDriver) {
                            // Try to match by name
                            const wDriver = winstelDrivers.find(wd =>
                                wd.name.toLowerCase() === tDriver.UserName.toLowerCase()
                            );
                            if (wDriver) {
                                driverResultsMapping[wDriver.id] = {
                                    position: res.Position,
                                    startingPosition: res.Position - res.PositionsMoved, // PositionsMoved is + for gaining spots
                                    name: tDriver.UserName
                                };
                            }
                        }
                    });

                    // d. Update entries for this event
                    const { data: entries } = await supabase
                        .from('winstel_entries')
                        .select('*')
                        .eq('event_id', event.id);

                    if (entries && entries.length > 0) {
                        const { calculateEntryScore } = require('@/lib/winstel_scoring');

                        for (const entry of entries) {
                            const entryScore = calculateEntryScore(entry.driver_ids, driverResultsMapping);

                            // Update entry score
                            await supabase
                                .from('winstel_entries')
                                .update({ score: entryScore })
                                .eq('id', entry.id);
                        }

                        // e. Update season standings (recalculate totals for all users in entries)
                        // This is simpler than incremental updates to avoid drift
                        const { data: allTotals } = await supabase
                            .from('winstel_entries')
                            .select('user_id, score');

                        const userTotals = {};
                        allTotals.forEach(ent => {
                            userTotals[ent.user_id] = (userTotals[ent.user_id] || 0) + (Number(ent.score) || 0);
                        });

                        for (const [userId, total] of Object.entries(userTotals)) {
                            await supabase
                                .from('winstel_standings')
                                .upsert({
                                    user_id: parseInt(userId),
                                    total_score: total,
                                    updated_at: new Date().toISOString()
                                }, { onConflict: 'user_id' });
                        }
                    }

                    // f. Update event status to 'live' if it was 'upcoming'
                    if (event.status === 'upcoming') {
                        await supabase
                            .from('winstel_events')
                            .update({ status: 'live' })
                            .eq('id', event.id);
                    }
                }
            }
        } catch (scoringError) {
            console.error('Winstel live scoring error:', scoringError);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Ingest error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
