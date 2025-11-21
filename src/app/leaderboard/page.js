"use client";

import React from 'react';
import styles from './Leaderboard.module.css';
import { useUser } from '@/context/UserContext';

const Leaderboard = () => {
    const { users } = useUser();

    // Helper to sort users
    const getSortedUsers = (criteria) => {
        return [...users].sort((a, b) => {
            if (criteria === 'balance') return b.balance - a.balance;
            if (criteria === 'biggestWin') {
                const maxWinA = Math.max(0, ...a.betHistory.filter(b => b.result === 'Won').map(b => b.payout));
                const maxWinB = Math.max(0, ...b.betHistory.filter(b => b.result === 'Won').map(b => b.payout));
                return maxWinB - maxWinA;
            }
            if (criteria === 'underdog') {
                const underdogWinA = a.betHistory.filter(b => b.result === 'Won' && b.odds >= 5.0).reduce((acc, curr) => acc + curr.payout, 0);
                const underdogWinB = b.betHistory.filter(b => b.result === 'Won' && b.odds >= 5.0).reduce((acc, curr) => acc + curr.payout, 0);
                return underdogWinB - underdogWinA;
            }
            return 0;
        }).slice(0, 10);
    };

    const renderList = (sortedUsers, valueExtractor, formatValue) => (
        <ul className={styles.list}>
            {sortedUsers.map((u, index) => (
                <li key={u.username} className={styles.listItem}>
                    <span className={`${styles.rank} ${index === 0 ? styles.rank1 : index === 1 ? styles.rank2 : index === 2 ? styles.rank3 : ''}`}>
                        {index + 1}
                    </span>
                    <span className={styles.username}>{u.username}</span>
                    <span className={styles.value}>{formatValue(valueExtractor(u))}</span>
                </li>
            ))}
        </ul>
    );

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Leaderboards</h1>
            <div className={styles.grid}>
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>💰 Most Money</h2>
                    {renderList(getSortedUsers('balance'), u => u.balance, v => `$${v.toFixed(2)}`)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🏆 Biggest Single Win</h2>
                    {renderList(getSortedUsers('biggestWin'), u => Math.max(0, ...u.betHistory.filter(b => b.result === 'Won').map(b => b.payout)) || 0, v => `$${v.toFixed(2)}`)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🐕 Underdog Kings</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Most profit from odds +400 or higher</p>
                    {renderList(getSortedUsers('underdog'), u => u.betHistory.filter(b => b.result === 'Won' && b.odds >= 5.0).reduce((acc, curr) => acc + curr.payout, 0), v => `$${v.toFixed(2)}`)}
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
