'use client';

import React from 'react';
import styles from './WinstelStandings.module.css';

const WinstelStandings = ({ standings }) => {
    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Season Standings</h2>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>User</th>
                            <th style={{ textAlign: 'right' }}>Total Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {standings.length === 0 ? (
                            <tr>
                                <td colSpan="3" className={styles.empty}>No standings data available yet.</td>
                            </tr>
                        ) : (
                            standings.map((entry, idx) => (
                                <tr key={idx} className={idx === 0 ? styles.leader : ''}>
                                    <td>
                                        {idx === 0 ? '🏆' : idx + 1}
                                    </td>
                                    <td className={styles.username}>{entry.username}</td>
                                    <td className={styles.score}>{entry.score.toLocaleString()}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WinstelStandings;
