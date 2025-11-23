import React from 'react';
import { useUser } from '@/context/UserContext';
import styles from './LobbyLeaderboard.module.css';

const LobbyLeaderboard = ({ entries, drivers, raceData }) => {
    const { user } = useUser();

    // --- SCORING LOGIC ---
    const calculateScore = (entry) => {
        if (!raceData || !drivers.length) return 0;

        const entryDrivers = [entry.driver_1, entry.driver_2, entry.driver_3];
        let totalScore = 0;

        entryDrivers.forEach(driverId => {
            const driver = drivers.find(d => String(d.UserID) === String(driverId));
            if (!driver) return;

            // 1. Position Points (DraftKings Exact)
            // 1st=45, 2nd=42, 3rd=41... 43rd=1
            let posPoints = 0;
            const pos = driver.Position; // Live position

            if (pos === 1) posPoints = 45;
            else if (pos === 2) posPoints = 42;
            else if (pos === 3) posPoints = 41;
            else if (pos === 4) posPoints = 40;
            else if (pos >= 5 && pos <= 43) {
                posPoints = 44 - pos; // 5th=39, 6th=38... 43rd=1
            } else {
                posPoints = 1; // Floor at 1 point
            }

            // 2. Place Differential
            // Start - Current
            const startPos = driver.StartPosition || pos; // Fallback if start pos missing
            const diffPoints = startPos - pos;

            let driverScore = posPoints + diffPoints;

            // 3. Captain Multiplier
            if (entry.captain_driver === String(driverId)) {
                driverScore *= 1.5;
            }

            totalScore += driverScore;
        });

        return totalScore;
    };

    // Calculate scores for all entries and sort
    const scoredEntries = entries.map(entry => ({
        ...entry,
        currentScore: calculateScore(entry)
    })).sort((a, b) => b.currentScore - a.currentScore);

    return (
        <div className={styles.container}>
            <h2>Live Standings</h2>
            <div className={styles.table}>
                <div className={styles.headerRow}>
                    <span>Rank</span>
                    <span>User</span>
                    <span>Score</span>
                    <span>Lineup</span>
                </div>
                {scoredEntries.map((entry, index) => {
                    const isMe = user && entry.user_id === user.id;
                    return (
                        <div key={entry.id} className={`${styles.row} ${isMe ? styles.me : ''}`}>
                            <span className={styles.rank}>{index + 1}</span>
                            <span className={styles.username}>{entry.username}</span>
                            <span className={styles.score}>{entry.currentScore.toFixed(1)}</span>
                            <div className={styles.lineup}>
                                {[entry.driver_1, entry.driver_2, entry.driver_3].map(did => {
                                    const drv = drivers.find(d => String(d.UserID) === String(did));
                                    const isCpt = entry.captain_driver === String(did);
                                    return (
                                        <span key={did} className={`${styles.miniBadge} ${isCpt ? styles.cptBadge : ''}`}>
                                            {drv ? `#${drv.CarNumber}` : '?'}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LobbyLeaderboard;
