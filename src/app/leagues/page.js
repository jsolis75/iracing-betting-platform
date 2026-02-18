"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import DraftTeam from '@/components/Multiplayer/DraftTeam';
import LobbyLeaderboard from '@/components/Multiplayer/LobbyLeaderboard';
import MyContests from '@/components/Multiplayer/MyContests';
import styles from '../multiplayer/Multiplayer.module.css';

const LeaguesContent = () => {
    const { user } = useUser();

    // For now, let's assume we use a specific raceId or lobby for Winstel Cup
    // In a real scenario, this would dynamically find the active Winstel Cup race
    const searchParams = useSearchParams();
    const raceId = searchParams.get('raceId') || 'winstel-cup-active'; // Placeholder or specific ID

    const [lobby, setLobby] = useState(null);
    const [entries, setEntries] = useState([]);
    const [myEntry, setMyEntry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [raceData, setRaceData] = useState(null);

    // Fetch Race Data
    useEffect(() => {
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
        const interval = setInterval(fetchLobby, 30000);
        return () => clearInterval(interval);
    }, [raceId, user]);

    const handleJoin = async () => {
        if (!user) return alert("Please login first");
        if (!confirm("Join Winstel Cup Series Fantasy for $500?")) return;

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

    if (loading) return <div className={styles.container}>Loading Winstel Cup Series...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <h1 style={{ color: '#eab308' }}>Winstel Cup Series</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Fantasy Contest - Draft your winning team!</p>
                </div>
                <div className={styles.prizePool}>
                    Prize Pool: <span>${lobby ? lobby.prize_pool : 0}</span>
                </div>
            </div>

            {!myEntry ? (
                <div className={styles.joinSection} style={{ borderTop: '2px solid #eab308' }}>
                    <h2 style={{ marginBottom: '1rem' }}>Entry Fee: $500</h2>
                    <p style={{ marginBottom: '2rem' }}>Compete against other players in the Winstel Cup Series Fantasy Draft.</p>
                    <button onClick={handleJoin} className={styles.joinBtn} style={{ background: '#eab308', color: '#000' }}>
                        Join Winstel Cup Contest
                    </button>
                </div>
            ) : (
                <div className={styles.gameArea}>
                    {!myEntry.driver_1 || !myEntry.driver_2 || !myEntry.driver_3 ? (
                        <>
                            <div className={styles.leftCol}>
                                <DraftTeam
                                    drivers={(raceData?.DriverInfo?.Drivers || []).filter(d => d.CarIsPaceCar === 0 && d.IsSpectator === 0)}
                                    entry={myEntry}
                                    lobbyId={lobby.id}
                                    onDraftUpdate={fetchLobby}
                                />
                            </div>
                            <div className={styles.rightCol}>
                                <div className={styles.leaderboardPlaceholder}>
                                    <h3>Live Standings</h3>
                                    <p>Draft your team to view the leaderboard!</p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className={styles.fullWidthCol}>
                            <LobbyLeaderboard
                                entries={entries}
                                drivers={raceData?.DriverInfo?.Drivers || []}
                                raceData={raceData}
                                lobbyId={lobby.id}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const LeaguesPage = () => {
    return (
        <Suspense fallback={<div className={styles.container}>Loading...</div>}>
            <LeaguesContent />
        </Suspense>
    );
};

export default LeaguesPage;
