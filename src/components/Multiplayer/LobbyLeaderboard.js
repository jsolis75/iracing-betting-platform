import React from 'react';
import { useUser } from '@/context/UserContext';
import styles from './LobbyLeaderboard.module.css';

const LobbyLeaderboard = ({ entries, drivers, raceData }) => {
    const { user } = useUser();

    // --- SCORING LOGIC ---
    const calculateDriverScore = (driver, isCaptain) => {
        if (!driver || !driver.Position) return 0;

        // 1. Position Points (DraftKings Exact)
        let posPoints = 0;
        const pos = driver.Position;

        if (pos === 1) posPoints = 45;
        else if (pos === 2) posPoints = 42;
        else if (pos === 3) posPoints = 41;
        else if (pos === 4) posPoints = 40;
        else if (pos >= 5 && pos <= 43) {
            posPoints = 44 - pos;
        } else {
            posPoints = 1;
        }

        // 2. Place Differential
        const startPos = driver.CarIdxPosition || pos;
        const diffPoints = startPos - pos;

        let driverScore = posPoints + diffPoints;

        // 3. Captain Multiplier
        if (isCaptain) {
            driverScore *= 1.5;
        }

        return { posPoints, diffPoints, total: driverScore };
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

    return (
        <div className={styles.container}>
            <h2>Live Standings</h2>
            <div className={styles.table}>
                <div className={styles.headerRow}>
                    <span>Rank</span>
                    <span>User</span>
                    <span>Score</span>
                    <span>Breakdown</span>
                </div>
                {scoredEntries.map((entry, index) => {
                    const isMe = user && entry.user_id === user.id;
                    return (
                        <div key={entry.id} className={`${styles.row} ${isMe ? styles.me : ''}`}>
                            <span className={styles.rank}>{index + 1}</span>
                            <span className={styles.username}>{entry.username}</span>
                            <span className={styles.score}>{entry.scoreData.total.toFixed(1)}</span>
                            <div className={styles.breakdown}>
                                {entry.scoreData.breakdown.map((item, idx) => (
                                    <div key={idx} className={`${styles.driverScore} ${item.isCaptain ? styles.captain : ''}`}>
                                        <span className={styles.driverNum}>
                                            #{item.driver.CarNumber}
                                            {item.isCaptain && ' 👑'}
                                        </span>
                                        <span className={styles.driverPts}>
                                            {item.total.toFixed(1)}
                                        </span>
                                        <small className={styles.driverDetails}>
                                            (Pos: {item.posPoints} | Diff: {item.diffPoints >= 0 ? '+' : ''}{item.diffPoints})
                                        </small>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LobbyLeaderboard;
