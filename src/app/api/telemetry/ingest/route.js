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

        // 2. Identify the race (normalize: IDs can arrive as numbers or strings)
        const subSessionID = Number(weekendInfo?.SubSessionID) || 0;
        const sessionID = Number(weekendInfo?.SessionID) || 0;
        const uniqueID = subSessionID || sessionID;
        const trackName = weekendInfo?.TrackDisplayName || data.SessionInfo?.TrackDisplayName || 'Unknown Track';

        if (!uniqueID) {
            return NextResponse.json({ error: 'Invalid data: No SessionID' }, { status: 400 });
        }

        // 3. Update or Insert into Supabase (if configured)
        try {
            const supabase = getSupabaseClient();

            // First, check if race exists (maybeSingle + limit: never throws on 0 or duplicate rows)
            const { data: existingRace } = await supabase
                .from('races')
                .select('id')
                .eq('iracing_session_id', uniqueID)
                .limit(1)
                .maybeSingle();

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
                // Only score from an actual Race session — a Practice/Qualify broadcast
                // must never write practice standings into Winstel scoring.
                const sessions = data.SessionInfo?.Sessions || [];
                const raceSession = sessions.find(s => s.SessionType === 'Race');

                if (raceSession?.ResultsPositions) {
                    const telemetryDrivers = data.DriverInfo?.Drivers || [];

                    // c. Map telemetry results to Winstel drivers
                    const { data: winstelDrivers } = await supabase.from('winstel_drivers').select('*');
                    const driverResultsMapping = {};

                    raceSession.ResultsPositions.forEach(res => {
                        const tDriver = telemetryDrivers.find(d => d.CarIdx === res.CarIdx);
                        if (tDriver && tDriver.UserName) {
                            // Try to match by name (null-safe on both sides)
                            const wDriver = (winstelDrivers || []).find(wd =>
                                (wd.name || '').toLowerCase() === tDriver.UserName.toLowerCase()
                            );
                            if (wDriver) {
                                const moved = Number(res.PositionsMoved) || 0; // guard: field can be absent
                                driverResultsMapping[wDriver.id] = {
                                    position: res.Position,
                                    startingPosition: res.Position - moved, // PositionsMoved is + for gaining spots
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

        // 5. AUTO-SETTLE: once the session reaches CoolDown (state 6), every car
        // has finished and results are final. Trigger settlement SERVER-SIDE so
        // bets settle even if nobody has the website open at the finish.
        // (settle-race is idempotent, so an occasional duplicate call is harmless.)
        try {
            const sessionState = Number(data.Telemetry?.SessionState) || 0;
            const raceSession = (data.SessionInfo?.Sessions || []).find(s => s.SessionType === 'Race');
            if (sessionState >= 6 && Array.isArray(raceSession?.ResultsPositions) && raceSession.ResultsPositions.length > 0) {
                if (!globalThis.__autoSettledSessions) globalThis.__autoSettledSessions = new Set();
                if (!globalThis.__autoSettledSessions.has(uniqueID)) {
                    globalThis.__autoSettledSessions.add(uniqueID);
                    const origin = new URL(request.url).origin;
                    console.log(`Auto-settling race ${uniqueID} (SessionState=${sessionState})`);
                    await fetch(`${origin}/api/settle-race`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ raceId: uniqueID })
                    }).catch(err => console.error('Auto-settle call failed:', err));
                }
            }
        } catch (autoSettleError) {
            console.error('Auto-settle check failed:', autoSettleError);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Ingest error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
