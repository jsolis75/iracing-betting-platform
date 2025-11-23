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

    // ... (keep existing useEffects)

    // ... (keep fetchLobby and handleJoin)

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
                    <div className={styles.leftCol}>
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
