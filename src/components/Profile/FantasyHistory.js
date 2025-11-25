"use client";

import React, { useState, useEffect } from 'react';
import styles from './BettingHistory.module.css';
import { useUser } from '@/context/UserContext';

const FantasyHistory = () => {
    const { user } = useUser();
    const [contests, setContests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchHistory = async () => {
            try {
                const res = await fetch(`/api/multiplayer/my-contests?userId=${user.id}&history=true`);
                if (res.ok) {
                    const data = await res.json();
                    // Only show completed contests
                    const completed = data.contests.filter(c => c.status === 'completed');
                    setContests(completed);
                }
            } catch (err) {
                console.error('Failed to fetch fantasy history:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [user]);

    if (!user) return null;

    if (loading) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Fantasy History</h2>
                <div className={styles.empty}>Loading...</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Fantasy History</h2>
            {contests.length === 0 ? (
                <div className={styles.empty}>No completed fantasy contests yet.</div>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Race</th>
                            <th>Entry Fee</th>
                            <th>Prize Pool</th>
                            <th>Final Score</th>
                            <th>Rank</th>
                            <th>Winnings</th>
                        </tr>
                    </thead>
                    <tbody>
                        {contests.map((contest, index) => (
                            <tr key={index}>
                                <td>{contest.raceName || 'Unknown Race'}</td>
                                <td>${contest.entry_fee || 0}</td>
                                <td>${contest.prizePool || 0}</td>
                                <td>{contest.score?.toFixed(1) || '0.0'} pts</td>
                                <td>{contest.position > 0 ? `#${contest.position}` : 'TBD'}</td>
                                <td style={{ color: contest.winnings > 0 ? 'var(--primary-green)' : 'inherit' }}>
                                    {contest.winnings > 0 ? `$${contest.winnings}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default FantasyHistory;
