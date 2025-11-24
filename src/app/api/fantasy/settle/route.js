import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';

export async function POST(request) {
    try {
        const { lobbyId } = await request.json();

        if (!lobbyId) {
            return NextResponse.json({ error: 'Missing lobbyId' }, { status: 400 });
        }

        const supabase = getSupabaseServiceClient();

        // 1. Get lobby details
        const { data: lobby, error: lobbyError } = await supabase
            .from('multiplayer_lobbies')
            .select('*')
            .eq('id', lobbyId)
            .single();

        if (lobbyError || !lobby) {
            console.error('Lobby lookup failed:', { lobbyId, lobbyError, foundLobby: !!lobby });
            return NextResponse.json({
                error: 'Lobby not found',
                details: lobbyError?.message || 'No lobby with this ID'
            }, { status: 404 });
        }

        console.log(`Found lobby ${lobbyId}, status: ${lobby.status}, race_id: ${lobby.race_id}`);

        // Check if already completed
        if (lobby.status === 'completed') {
            return NextResponse.json({
                error: 'Lobby already settled',
                winner: lobby.winner_username
            }, { status: 400 });
        }

        // 2. Get race data
        const { data: race, error: raceError } = await supabase
            .from('races')
            .select('*')
            .eq('id', lobby.race_id)
            .single();

        if (raceError || !race || !race.data) {
            return NextResponse.json({ error: 'Race data not found' }, { status: 404 });
        }

        // 3. Extract driver results from race session
        const sessions = race.data.SessionInfo?.Sessions || [];
        const raceSession = sessions.find(s => s.SessionType === 'Race') || sessions[sessions.length - 1];
        const qualifyingSession = sessions.find(s =>
            s.SessionType === 'Qualify' || s.SessionType === 'Lone Qualify'
        );

        if (!raceSession?.ResultsPositions) {
            return NextResponse.json({ error: 'No race results available' }, { status: 400 });
        }

        const drivers = race.data.DriverInfo?.Drivers || [];

        // Get starting positions from qualifying
        const startingPositions = {};
        if (qualifyingSession?.ResultsPositions) {
            qualifyingSession.ResultsPositions.forEach(result => {
                startingPositions[result.CarIdx] = result.Position;
            });
        }

        // Create driver lookup with positions
        const driverResults = {};
        raceSession.ResultsPositions.forEach(result => {
            const driver = drivers.find(d => d.CarIdx === result.CarIdx);
            if (driver) {
                driverResults[driver.UserID] = {
                    position: result.Position,
                    startingPosition: startingPositions[result.CarIdx] || result.Position,
                    name: driver.UserName
                };
            }
        });

        // 4. Get all entries for this lobby with usernames
        const { data: entries, error: entriesError } = await supabase
            .from('multiplayer_entries')
            .select(`
                *,
                user:users!multiplayer_entries_user_id_fkey (
                    username
                )
            `)
            .eq('lobby_id', lobbyId);

        if (entriesError) {
            console.error('Entries fetch error:', entriesError);
            throw entriesError;
        }

        // 5. Calculate scores
        const calculateDriverScore = (driverId, isCaptain) => {
            const result = driverResults[driverId];
            if (!result) return 0;

            const { position, startingPosition } = result;

            // Position points (DraftKings scoring)
            let posPoints = 0;
            if (position === 1) posPoints = 45;
            else if (position === 2) posPoints = 42;
            else if (position === 3) posPoints = 41;
            else if (position === 4) posPoints = 40;
            else if (position >= 5 && position <= 43) {
                posPoints = 44 - position;
            } else {
                posPoints = 1;
            }

            // Place differential (starting - current)
            const diffPoints = startingPosition - position;

            let total = posPoints + diffPoints;

            // Captain multiplier
            if (isCaptain) {
                total *= 1.5;
            }

            return total;
        };

        const scoredEntries = entries.map(entry => {
            const score1 = calculateDriverScore(entry.driver_1, entry.captain_driver === entry.driver_1);
            const score2 = calculateDriverScore(entry.driver_2, entry.captain_driver === entry.driver_2);
            const score3 = calculateDriverScore(entry.driver_3, entry.captain_driver === entry.driver_3);
            const totalScore = score1 + score2 + score3;

            return {
                ...entry,
                username: entry.user?.username || 'Unknown',
                finalScore: totalScore
            };
        });

        // Sort by score descending
        scoredEntries.sort((a, b) => b.finalScore - a.finalScore);

        console.log('Scored entries:', scoredEntries.map(e => ({ username: e.username, score: e.finalScore })));

        // 6. Award payouts (winner takes all)
        if (!scoredEntries || scoredEntries.length === 0) {
            return NextResponse.json({ error: 'No entries found to settle' }, { status: 400 });
        }

        const winner = scoredEntries[0];
        const pot = lobby.entry_fee * entries.length;

        console.log(`Awarding ${pot} to user ${winner.user_id} (${winner.username})`);

        // Update winner's balance - use direct SQL update instead of RPC
        const { data: currentUser, error: userFetchError } = await supabase
            .from('users')
            .select('balance')
            .eq('id', winner.user_id)
            .single();

        if (userFetchError || !currentUser) {
            console.error('Failed to fetch user:', userFetchError);
            throw new Error(`Failed to fetch user balance: ${userFetchError?.message || 'User not found'}`);
        }

        const newBalance = (currentUser.balance || 0) + pot;

        const { error: balanceError } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('id', winner.user_id);

        if (balanceError) {
            console.error('Balance update failed:', balanceError);
            throw new Error(`Failed to award payout: ${balanceError.message}`);
        }

        console.log(`Balance updated successfully from ${currentUser.balance} to ${newBalance}`);

        // 7. Mark lobby as settled
        await supabase
            .from('multiplayer_lobbies')
            .update({ status: 'completed' })
            .eq('id', lobbyId);

        return NextResponse.json({
            success: true,
            winner: winner.username,
            winnings: pot,
            finalStandings: scoredEntries.map((e, idx) => ({
                rank: idx + 1,
                username: e.username,
                score: e.finalScore
            }))
        });

    } catch (error) {
        console.error('Fantasy settlement error:', error);
        return NextResponse.json({ error: 'Settlement failed: ' + error.message }, { status: 500 });
    }
}
