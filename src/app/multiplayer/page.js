"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import DraftTeam from '@/components/Multiplayer/DraftTeam';
import LobbyLeaderboard from '@/components/Multiplayer/LobbyLeaderboard';
import RockPaperScissors from '@/components/Multiplayer/RockPaperScissors';
import MyContests from '@/components/Multiplayer/MyContests';
import styles from './Multiplayer.module.css';

const MultiplayerContent = () => {
    const { user } = useUser();
    const searchParams = useSearchParams();
    const raceId = searchParams.get('raceId');

    const [activeTab, setActiveTab] = useState('lobby'); // 'lobby' or 'my-contests'
    const [lobby, setLobby] = useState(null);
    const [entries, setEntries] = useState([]);
    const [myEntry, setMyEntry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [raceData, setRaceData] = useState(null);
    const [activeRaces, setActiveRaces] = useState([]);

    // Fetch Active Races (if no raceId)
    useEffect(() => {
        if (!raceId) {
            fetch('/api/races')
                .then(res => res.json())
                .then(data => setActiveRaces(data.races || []))
                .catch(err => console.error("Failed to fetch races", err));
        }
    }, [raceId]);

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
        console.log("Fetching lobby for raceId:", raceId);
        try {
            const res = await fetch(`/api/multiplayer/lobby?raceId=${raceId}`);
            if (res.ok) {
                const data = await res.json();
                console.log("Lobby data received:", data);
                setLobby(data.lobby);
                setEntries(data.entries || []);
                if (user && data.entries) {
                    setMyEntry(data.entries.find(e => e.user_id === user.id));
                }
            } else {
                console.error("Lobby fetch failed status:", res.status);
            }
        } catch (err) {
            console.error("Failed to fetch lobby", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        console.log("MultiplayerPage mounted. RaceId:", raceId, "User:", user?.username);
        fetchLobby();

        // Poll every 30 seconds (reduced from 5s to save costs)
        const interval = setInterval(() => {
            // Only poll if tab is visible to save API calls
            if (document.visibilityState === 'visible') {
                fetchLobby();
            }
        }, 30000); // 30 seconds

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
                if (data.alreadyJoined) {
                    alert("You have already joined this lobby!");
                }
                fetchLobby();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Join failed");
        }
    };

    // If no raceId, show Active Races AND My Contests
    if (!raceId) {
        return (
            <div className={styles.container}>
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'lobby' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('lobby')}
                    >
                        Active Races
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'my-contests' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('my-contests')}
                    >
                        My Contests
                    </button>
                </div>

                {activeTab === 'my-contests' ? (
                    <MyContests />
                ) : (
                    <>
                        <h1>Select a Race to Join Lobby</h1>
                        <div className={styles.raceList}>
                            {activeRaces.length === 0 ? (
                                <p>No active races found.</p>
                            ) : (
                                activeRaces.map(race => (
                                    <div key={race.id} className={styles.raceCard}>
                                        <h3>{race.name}</h3>
                                        <p>{race.track}</p>
                                        <a href={`/multiplayer?raceId=${race.id}`} className={styles.joinBtn}>
                                            Enter Lobby
                                        </a>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    }

    if (loading) return <div className={styles.container}>Loading Lobby...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <a href="/multiplayer" className={styles.backBtn}>← All Races</a>
                    <h1>Fantasy Draft Lobby</h1>
                </div>
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
                    {/* Check if lineup is locked */}
                    {!myEntry || !myEntry.driver_1 || !myEntry.driver_2 || !myEntry.driver_3 ? (
                        <>
                            <div className={styles.leftCol}>
                                {/* DEBUG INFO */}
                                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
                                    Drivers Loaded: {raceData?.DriverInfo?.Drivers?.length || 0}
                                </div>
                                <DraftTeam
                                    drivers={(raceData?.DriverInfo?.Drivers || []).filter(d => d.CarIsPaceCar === 0 && d.IsSpectator === 0)}
                                    entry={myEntry}
                                    lobbyId={lobby.id}
                                    onDraftUpdate={fetchLobby}
                                />
                            </div>
                            <div className={styles.rightCol}>
                                {myEntry && myEntry.driver_1 ? (
                                    <LobbyLeaderboard
                                        entries={entries}
                                        drivers={raceData?.DriverInfo?.Drivers || []}
                                        raceData={raceData}
                                    />
                                ) : (
                                    <div className={styles.leaderboardPlaceholder}>
                                        <h3>Live Standings</h3>
                                        <p>Draft your team to view the leaderboard!</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        // Lineup is locked - show only leaderboard at full width
                        <div className={styles.fullWidthCol}>
                            <LobbyLeaderboard
                                entries={entries}
                                drivers={raceData?.DriverInfo?.Drivers || []}
                                raceData={raceData}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const MultiplayerPage = () => {
    return (
        <Suspense fallback={<div className={styles.container}>Loading...</div>}>
            <MultiplayerContent />
        </Suspense>
    );
};

export default MultiplayerPage;
