"use client";

import React from 'react';
import styles from './Leaderboard.module.css';

const Leaderboard = () => {
    // Placeholder data - will be replaced with database query later
    const placeholderUsers = [
        { username: 'Coming Soon', balance: 0, betHistory: [] }
    ];

    const renderList = (users, valueExtractor, formatValue) => (
        <ul className={styles.list}>
            {users.map((u, index) => (
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
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Leaderboards will be available once the database integration is complete!
            </p>
            <div className={styles.grid}>
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>💰 Most Money</h2>
                    {renderList(placeholderUsers, u => u.balance, v => `$${v.toFixed(2)}`)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🏆 Biggest Single Win</h2>
                    {renderList(placeholderUsers, u => 0, v => `$${v.toFixed(2)}`)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🐕 Underdog Kings</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Most profit from odds +400 or higher</p>
                    {renderList(placeholderUsers, u => 0, v => `$${v.toFixed(2)}`)}
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
