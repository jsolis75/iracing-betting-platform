"use client";

import React, { useState, useEffect } from 'react';
import styles from './Leaderboard.module.css';

const Leaderboard = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchLeaderboardData = async () => {
            try {
                const response = await fetch('/api/users');
                if (!response.ok) throw new Error('Failed to fetch leaderboard data');
                const data = await response.json();
                setUsers(data.users || []);
            } catch (err) {
                console.error('Leaderboard fetch error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboardData();
        // Refresh every 30 seconds
        const interval = setInterval(fetchLeaderboardData, 30000);
        return () => clearInterval(interval);
    }, []);

    const calculateBiggestWin = (user) => {
        if (!user.betHistory || user.betHistory.length === 0) return 0;
        const wins = user.betHistory.filter(bet => bet.result === 'won');
        if (wins.length === 0) return 0;
        return Math.max(...wins.map(bet => bet.payout - bet.amount));
    };

    const calculateUnderdogProfit = (user) => {
        if (!user.betHistory || user.betHistory.length === 0) return 0;
        const underdogWins = user.betHistory.filter(bet =>
            bet.result === 'won' &&
            bet.odds &&
            parseInt(bet.odds.replace('+', '')) >= 400
        );
        return underdogWins.reduce((sum, bet) => sum + (bet.payout - bet.amount), 0);
    };

    // Sort users by balance
    const topByBalance = [...users].sort((a, b) => b.balance - a.balance).slice(0, 10);

    // Sort by biggest single win
    const topByBiggestWin = [...users]
        .map(u => ({ ...u, biggestWin: calculateBiggestWin(u) }))
        .sort((a, b) => b.biggestWin - a.biggestWin)
        .slice(0, 10);

    // Sort by underdog profit
    const topByUnderdog = [...users]
        .map(u => ({ ...u, underdogProfit: calculateUnderdogProfit(u) }))
        .filter(u => u.underdogProfit > 0)
        .sort((a, b) => b.underdogProfit - a.underdogProfit)
        .slice(0, 10);

    const renderList = (users, valueExtractor, formatValue) => {
        if (loading) {
            return <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</p>;
        }

        if (error) {
            return <p style={{ textAlign: 'center', color: '#f87171', padding: '2rem' }}>Error: {error}</p>;
        }

        if (users.length === 0) {
            return <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No data yet</p>;
        }

        return (
            <ul className={styles.list}>
                {users.map((u, index) => (
                    <li key={u.username || index} className={styles.listItem}>
                        <span className={`${styles.rank} ${index === 0 ? styles.rank1 : index === 1 ? styles.rank2 : index === 2 ? styles.rank3 : ''}`}>
                            {index + 1}
                        </span>
                        <span className={styles.username}>{u.username}</span>
                        <span className={styles.value}>{formatValue(valueExtractor(u))}</span>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Leaderboards</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Top performers updated live
            </p>
            <div className={styles.grid}>
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>💰 Most Money</h2>
                    {renderList(topByBalance, u => u.balance, v => `$${v.toFixed(2)}`)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🏆 Biggest Single Win</h2>
                    {renderList(topByBiggestWin, u => u.biggestWin || 0, v => `$${v.toFixed(2)}`)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🐕 Underdog Kings</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Most profit from odds +400 or higher</p>
                    {renderList(topByUnderdog, u => u.underdogProfit || 0, v => `$${v.toFixed(2)}`)}
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;
