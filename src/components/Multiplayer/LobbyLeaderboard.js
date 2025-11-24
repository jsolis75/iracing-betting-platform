import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import styles from './LobbyLeaderboard.module.css';

// Series mapping
const seriesMapping = {
    164: "NASCAR Truck Series",
    165: "NASCAR Xfinity Series",
    166: "NASCAR Cup Series",
    312: "ARCA Menards Series",
    382: "Street Stock",
    // Add more as needed
};

// Helper to get ordinal suffix (1st, 2nd, 3rd, etc.)
const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const LobbyLeaderboard = ({ entries, drivers, raceData, lobbyId }) => {
    const { user } = useUser();
    const [showScoringRules, setShowScoringRules] = useState(false);
    const [settling, setSettling] = useState(false);

    // Force settle function
    const handleForceSettle = async () => {
        if (!confirm('Force settle this fantasy lobby? This cannot be undone.')) return;

        setSettling(true);
        try {
            const res = await fetch('/api/fantasy/settle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lobbyId })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Settlement complete! Winner: ${data.winner} ($${data.winnings})`);
                window.location.reload();
            } else {
                const error = await res.json();
                alert(`Settlement failed: ${error.error}`);
            }
        } catch (err) {
            alert('Settlement error: ' + err.message);
        } finally {
            setSettling(false);
        }
    };

    // --- SCORING LOGIC ---
    const calculateDriverScore = (driver, isCaptain) => {
        if (!driver) return { posPoints: 0, diffPoints: 0, total: 0, currentPos: null, startPos: null };

        const currentPos = driver.Position;
        const startPos = driver.CarIdxPosition;

        if (!currentPos || !startPos) {
            return { posPoints: 0, diffPoints: 0, total: 0, currentPos: null, startPos: null };
        }

        // 1. Position Points (DraftKings Exact)
        let posPoints = 0;
        if (currentPos === 1) posPoints = 45;
        else if (currentPos === 2) posPoints = 42;
        else if (currentPos === 3) posPoints = 41;
        else if (currentPos === 4) posPoints = 40;
        else if (currentPos >= 5 && currentPos <= 43) {
            posPoints = 44 - currentPos;
        } else {
            posPoints = 1;
        }

        // 2. Place Differential (start - current, positive = gained, negative = lost)
        const diffPoints = startPos - currentPos;

        let driverScore = posPoints + diffPoints;

        // 3. Captain Multiplier
        if (isCaptain) {
            driverScore *= 1.5;
        }

        return { posPoints, diffPoints, total: driverScore, currentPos, startPos };
    };

    const calculateScore = (entry) => {
        if (!raceData || !drivers.length) return { total: 0, breakdown: [] };

        const entryDrivers = [
            { id: entry.driver_1, isCaptain: entry.captain_driver === entry.driver_1 },
            { id: entry.driver_2, isCaptain: entry.captain_driver === entry.driver_2 },
            { id: entry.driver_3, isCaptain: entry.captain_driver === entry.driver_3 }
        ];

        let totalScore = 0;
        const breakdown = [];

        entryDrivers.forEach(({ id, isCaptain }) => {
            const driver = drivers.find(d => String(d.UserID) === String(id));
            if (!driver) return;

            const scores = calculateDriverScore(driver, isCaptain);
            totalScore += scores.total;
            breakdown.push({
                driver,
                isCaptain,
                ...scores
            });
        });

        return { total: totalScore, breakdown };
    };

    // Calculate scores for all entries and sort
    const scoredEntries = entries.map(entry => ({
        ...entry,
        scoreData: calculateScore(entry)
    })).sort((a, b) => b.scoreData.total - a.scoreData.total);

    // Extract race info
    const raceSession = raceData?.SessionInfo?.Sessions?.find(s => s.SessionType === 'Race');
    const totalLaps = raceSession?.SessionLaps || '?';
    const seriesId = raceData?.WeekendInfo?.SeriesID;
    const seriesName = seriesId ? (seriesMapping[seriesId] || `Series ${seriesId}`) : 'Race';
    const trackName = raceData?.WeekendInfo?.TrackDisplayName || 'Track';

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h2>Live Standings</h2>
                    {raceData?.WeekendInfo && (
                        <p className={styles.raceInfo}>
                            {seriesName} at {trackName}
                        </p>
                    )}
                </div>
                <div className={styles.headerButtons}>
                    {user?.username === 'dumindu' && (
                        <button
                            className={styles.settleButton}
                            onClick={handleForceSettle}
                            disabled={settling}
                        >
                            {settling ? 'Settling...' : '⚡ Force Settle'}
                        </button>
                    )}
                    <button
                        className={styles.rulesButton}
                        onClick={() => setShowScoringRules(!showScoringRules)}
                    >
                        &#9432; How Scoring Works
                    </button>
                </div>
            </div>

            {showScoringRules && (
                <div className={styles.scoringRules}>
                    <h3>Fantasy Scoring</h3>
                    <ul>
                        <li><strong>Position Points:</strong> 1st = 45pts, 2nd = 42pts, 3rd = 41pts, 4th = 40pts, 5th-43rd = (44 - position)</li>
                        <li><strong>Place Differential:</strong> +1pt per position gained from start (or -1pt per position lost)</li>
                        <li><strong>Captain Bonus:</strong> All points for your captain are multiplied by 1.5x</li>
                    </ul>
                </div>
            )}

            <div className={styles.table}>
                <div className={styles.headerRow}>
                    <span>Rank</span>
                    <span>User</span>
                    <span>Lap</span>
                    <span>Score</span>
                    <span>Lineup</span>
                </div>
                {scoredEntries.map((entry, index) => {
                    const isMe = user && entry.user_id === user.id;

                    // Calculate lap info - use lowest lap from their drivers
                    const entryLaps = entry.scoreData?.breakdown?.map(item => item.driver?.Lap).filter(Boolean) || [];
                    const currentLap = entryLaps.length > 0 ? Math.min(...entryLaps) : 0;

                    return (
                        <div key={entry.id} className={`${styles.row} ${isMe ? styles.me : ''}`}>
                            <span className={styles.rank}>{index + 1}</span>
                            <span className={styles.username}>{entry.username}</span>
                            <span className={styles.lapInfo}>{currentLap}/{totalLaps}</span>
                            <span className={styles.score}>{(entry.scoreData?.total || 0).toFixed(1)}pts</span>
                            <div className={styles.breakdown}>
                                {entry.scoreData?.breakdown?.map((item, idx) => {
                                    const currentPlace = item.currentPos ? getOrdinal(item.currentPos) : '?';
                                    const startPlace = item.startPos || '?';
                                    const diffText = item.diffPoints > 0 ? `+${item.diffPoints}` : item.diffPoints;

                                    return (
                                        <div key={idx} className={`${styles.driverScore} ${item.isCaptain ? styles.captain : ''}`}>
                                            <span className={styles.driverName}>
                                                {item.driver?.UserName || item.driver?.AbbrevName || '#' + item.driver?.CarNumber}
                                                {item.isCaptain && ' 👑'}
                                            </span>
                                            <span className={styles.positionInfo}>
                                                P{item.currentPos || '?'} <span className={styles.startedAt}>(started P{startPlace})</span>
                                            </span>
                                            <span className={styles.driverPts}>
                                                {(item.total || 0).toFixed(1)}pts
                                            </span>
                                            <small className={styles.driverDetails}>
                                                ({currentPlace} place, {diffText} differential)
                                            </small>
                                        </div>
                                    );
                                }) || <span style={{ color: '#888', fontSize: '0.85rem' }}>No lineup set</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LobbyLeaderboard;
