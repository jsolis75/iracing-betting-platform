"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import DraftTeam from '@/components/Multiplayer/DraftTeam';
import LobbyLeaderboard from '@/components/Multiplayer/LobbyLeaderboard';
import RockPaperScissors from '@/components/Multiplayer/RockPaperScissors';
import styles from './Multiplayer.module.css';

const MultiplayerPage = () => {
    const { user } = useUser();
    const searchParams = useSearchParams();
    const raceId = searchParams.get('raceId');

    const [lobby, setLobby] = useState(null);
    const [entries, setEntries] = useState([]);
    const [myEntry, setMyEntry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [raceData, setRaceData] = useState(null);

    // Fetch Race Data (for drivers list)
    useEffect(() => {
        if (!raceId) return;
        const fetchRace = async () => {
            try {
                const res = await fetch(`/api/race-data?raceId=${raceId}`);
                if (res.ok) {
                    const data = await res.json();
                    setRaceData(data);
                }
            } catch (err) {
                console.error("Failed to fetch race data", err);
            }
        };
        fetchRace();
    }, [raceId]);

    // Fetch Lobby Data
    const fetchLobby = async () => {
        if (!raceId) return;
        try {
            const res = await fetch(`/api/multiplayer/lobby?raceId=${raceId}`);
            if (res.ok) {
                const data = await res.json();
                setLobby(data.lobby);
                setEntries(data.entries || []);
                if (user && data.entries) {
                    setMyEntry(data.entries.find(e => e.user_id === user.id));
                }
            }
        } catch (err) {
            console.error("Failed to fetch lobby", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLobby();
        const interval = setInterval(fetchLobby, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [raceId, user]);

    const handleJoin = async () => {
        if (!user) return alert("Please login first");
        if (!confirm("Join lobby for $500?")) return;

        try {
            const res = await fetch('/api/multiplayer/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raceId, userId: user.id })
            });
            const data = await res.json();
            if (data.success) {
                fetchLobby();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Join failed");
        }
    };

    if (!raceId) return <div className="container">Please select a race from the home page.</div>;
    if (loading) return <div className="container">Loading Lobby...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Fantasy Draft Lobby</h1>
                <div className={styles.prizePool}>
                    Prize Pool: <span>${lobby ? lobby.prize_pool : 0}</span>
                </div>
            </div>

            {lobby && lobby.status === 'tiebreaker' && myEntry?.status === 'active' && (
                <div className={styles.rpsOverlay}>
                    <RockPaperScissors
                        lobbyId={lobby.id}
                        userId={user.id}
                        onPlayed={() => fetchLobby()} // Refresh to check status
                    />
                </div>
            )}

            {!myEntry ? (
                <div className={styles.joinSection}>
                    <h2>Entry Fee: $500</h2>
                    <button onClick={handleJoin} className={styles.joinBtn}>
                        Join Contest
                    </button>
                </div>
            ) : (
                <div className={styles.gameArea}>
                    <div className={styles.leftCol}>
                        <DraftTeam
                            drivers={raceData?.DriverInfo?.Drivers || []}
                            entry={myEntry}
                            lobbyId={lobby.id}
                            onDraftUpdate={fetchLobby}
                        />
                    </div>
                    <div className={styles.rightCol}>
                        <LobbyLeaderboard
                            entries={entries}
                            drivers={raceData?.DriverInfo?.Drivers || []}
                            raceData={raceData}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultiplayerPage;
