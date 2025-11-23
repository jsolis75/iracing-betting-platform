"use client";

import React, { useState, useEffect } from 'react';
import styles from './Leaderboard.module.css';
import DriverStats from '@/components/Profile/DriverStats';

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
        // Refresh every 60 seconds
        const interval = setInterval(fetchLeaderboardData, 60000);
        return () => clearInterval(interval);
    }, []);

    const getBetDetails = (bet) => {
        if (!bet.details) return null;
        if (Array.isArray(bet.details)) return bet.details;
        try {
            return JSON.parse(bet.details);
        } catch (e) {
            console.error('Error parsing bet details:', e);
            return null;
        }
    };

    const getBiggestWin = (user) => {
        if (!user.betHistory || user.betHistory.length === 0) return { amount: 0, details: '' };
        const wins = user.betHistory.filter(bet => bet.result === 'won');
        if (wins.length === 0) return { amount: 0, details: '' };

        // Find bet with max profit
        const bestBet = wins.reduce((max, bet) => Number(bet.potential_payout) > Number(max.potential_payout) ? bet : max, wins[0]);

        let details = `${bestBet.driver_name} (${bestBet.bet_type} @ ${bestBet.odds})`;

        // Format Parlay details
        const parlayDetails = getBetDetails(bestBet);
        if (bestBet.race_id === 'multi' && parlayDetails && Array.isArray(parlayDetails)) {
            const legs = parlayDetails.map(leg => `${leg.driver} (${leg.type})`).join(' + ');
            details = `Parlay: ${legs} (@ ${bestBet.odds})`;
        }

        return {
            amount: Number(bestBet.potential_payout),
            details: details
        };
    };

    const getUnderdogStats = (user) => {
        if (!user.betHistory || user.betHistory.length === 0) return { amount: 0, details: '' };
        const underdogWins = user.betHistory.filter(bet => {
            if (bet.result !== 'won' || !bet.odds) return false;
            const oddsValue = typeof bet.odds === 'string'
                ? parseInt(bet.odds.replace(/[+-]/g, ''))
                : Math.abs(bet.odds);
            return oddsValue >= 400;
        });

        if (underdogWins.length === 0) return { amount: 0, details: '' };

        const total = underdogWins.reduce((sum, bet) => sum + Number(bet.potential_payout), 0);

        // Find biggest contributor for tooltip
        const bestBet = underdogWins.reduce((max, bet) => Number(bet.potential_payout) > Number(max.potential_payout) ? bet : max, underdogWins[0]);

        let details = `Top: ${bestBet.driver_name} (${bestBet.bet_type} @ ${bestBet.odds})`;

        // Format Parlay details
        const parlayDetails = getBetDetails(bestBet);
        if (bestBet.race_id === 'multi' && parlayDetails && Array.isArray(parlayDetails)) {
            const legs = parlayDetails.map(leg => `${leg.driver} (${leg.type})`).join(' + ');
            details = `Top: Parlay (${legs} @ ${bestBet.odds})`;
        }

        return {
            amount: total,
            details: details
        };
    };

    // Sort users by balance
    const topByBalance = [...users].sort((a, b) => b.balance - a.balance).slice(0, 10);

    // Sort by biggest single win
    const topByBiggestWin = [...users]
        .map(u => ({ ...u, biggestWinData: getBiggestWin(u) }))
        .sort((a, b) => b.biggestWinData.amount - a.biggestWinData.amount)
        .slice(0, 10);

    // Sort by underdog profit
    const topByUnderdog = [...users]
        .map(u => ({ ...u, underdogData: getUnderdogStats(u) }))
        .filter(u => u.underdogData.amount > 0)
        .sort((a, b) => b.underdogData.amount - a.underdogData.amount)
        .slice(0, 10);

    const renderList = (users, valueExtractor, formatValue, tooltipExtractor) => {
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
                        {tooltipExtractor ? (
                            <div className={styles.tooltipContainer}>
                                <span className={styles.value}>
                                    {formatValue(valueExtractor(u))}
                                </span>
                                <span className={styles.tooltipText}>
                                    {tooltipExtractor(u)}
                                </span>
                            </div>
                        ) : (
                            <span className={styles.value}>
                                {formatValue(valueExtractor(u))}
                            </span>
                        )}
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
                    {renderList(
                        topByBiggestWin,
                        u => u.biggestWinData.amount,
                        v => `$${v.toFixed(2)}`,
                        u => u.biggestWinData.details
                    )}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🐕 Underdog Kings</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Most profit from odds +400 or higher</p>
                    {renderList(
                        topByUnderdog,
                        u => u.underdogData.amount,
                        v => `$${v.toFixed(2)}`,
                        u => u.underdogData.details
                    )}
                </div>
            </div>

            <div style={{ marginTop: '3rem' }}>
                <h2 className={styles.title} style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Global Driver Performance</h2>
                <DriverStats bets={users.flatMap(u => u.betHistory || [])} titlePrefix="Global" />
            </div>
        </div>
    );
};

export default Leaderboard;
