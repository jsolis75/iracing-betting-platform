"use client";

import React, { useState, useEffect } from 'react';
import styles from './Leaderboard.module.css';
import DriverStats from '@/components/Profile/DriverStats';
import SeasonChart from '@/components/Season/SeasonChart';

// ============================================================
// Leaderboard — season standings (profit-based), weekly
// champions, cumulative profit chart, plus the classic boards.
// All data comes from /api/season (computed server-side).
// ============================================================

const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
const profitMoney = (v) => `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(2)}`;

const Leaderboard = () => {
    const [standings, setStandings] = useState([]);
    const [weekly, setWeekly] = useState([]);
    const [series, setSeries] = useState([]);
    const [slimBets, setSlimBets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSeason = async () => {
            try {
                const response = await fetch('/api/season');
                if (!response.ok) throw new Error('Failed to fetch season data');
                const data = await response.json();
                setStandings(data.standings || []);
                setWeekly(data.weekly || []);
                setSeries(data.series || []);
                setSlimBets(data.slimBets || []);
            } catch (err) {
                console.error('Season fetch error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchSeason();
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchSeason();
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const rankClass = (index) =>
        `${styles.rank} ${index === 0 ? styles.rank1 : index === 1 ? styles.rank2 : index === 2 ? styles.rank3 : ''}`;

    const renderSimpleList = (rows, valueFn, formatFn, tooltipFn) => {
        if (loading) return <p className={styles.stateMsg}>Loading...</p>;
        if (error) return <p className={styles.errorMsg}>Error: {error}</p>;
        if (rows.length === 0) return <p className={styles.stateMsg}>No data yet</p>;
        return (
            <ul className={styles.list}>
                {rows.map((u, index) => (
                    <li key={u.username || index} className={styles.listItem}>
                        <span className={rankClass(index)}>{index + 1}</span>
                        <span className={styles.username}>{u.username}</span>
                        {tooltipFn ? (
                            <div className={styles.tooltipContainer}>
                                <span className={styles.value}>{formatFn(valueFn(u))}</span>
                                <span className={styles.tooltipText}>{tooltipFn(u)}</span>
                            </div>
                        ) : (
                            <span className={styles.value}>{formatFn(valueFn(u))}</span>
                        )}
                    </li>
                ))}
            </ul>
        );
    };

    const topByBalance = [...standings]
        .filter(u => u.balance != null)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);

    const topByBiggestWin = [...standings]
        .filter(u => u.biggestWin?.amount > 0)
        .sort((a, b) => b.biggestWin.amount - a.biggestWin.amount)
        .slice(0, 10);

    const topByUnderdog = [...standings]
        .filter(u => u.underdogProfit > 0)
        .sort((a, b) => b.underdogProfit - a.underdogProfit)
        .slice(0, 10);

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Season Standings</h1>
            <p className={styles.subtitle}>
                Profit-based, all-time — balance resets can&apos;t save you here.
            </p>

            {/* ---- Season standings table ---- */}
            <div className={styles.seasonCard}>
                {loading ? (
                    <p className={styles.stateMsg}>Loading...</p>
                ) : standings.length === 0 ? (
                    <p className={styles.stateMsg}>No settled bets yet — standings start with the first race.</p>
                ) : (
                    <table className={styles.seasonTable}>
                        <thead>
                            <tr>
                                <th></th>
                                <th>Bettor</th>
                                <th>Profit</th>
                                <th>Bets</th>
                                <th>Win %</th>
                                <th className={styles.hideMobile}>Biggest win</th>
                            </tr>
                        </thead>
                        <tbody>
                            {standings.map((u, i) => (
                                <tr key={u.userId} className={i === 0 ? styles.leaderRow : ''}>
                                    <td className={rankClass(i)}>{i === 0 ? '👑' : i + 1}</td>
                                    <td className={styles.username}>{u.username}</td>
                                    <td className={u.profit >= 0 ? styles.profitPos : styles.profitNeg}>
                                        {profitMoney(u.profit)}
                                    </td>
                                    <td>{u.betCount}</td>
                                    <td>{u.winRate}%</td>
                                    <td className={styles.hideMobile} title={u.biggestWin?.details || ''}>
                                        {u.biggestWin?.amount > 0 ? money(u.biggestWin.amount) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ---- Profit chart ---- */}
            <div className={styles.seasonCard}>
                <h2 className={styles.cardTitle}>📈 Profit Over the Season</h2>
                {loading ? <p className={styles.stateMsg}>Loading...</p> : <SeasonChart series={series} />}
            </div>

            {/* ---- Weekly champions ---- */}
            <div className={styles.seasonCard}>
                <h2 className={styles.cardTitle}>🗓️ Weekly Champions</h2>
                {loading ? (
                    <p className={styles.stateMsg}>Loading...</p>
                ) : weekly.length === 0 ? (
                    <p className={styles.stateMsg}>The first weekly crown is still up for grabs.</p>
                ) : (
                    <div className={styles.weekRow}>
                        {weekly.map(w => (
                            <div key={w.weekStart} className={`${styles.weekCard} ${w.isCurrent ? styles.weekCurrent : ''}`}>
                                <div className={styles.weekLabel}>
                                    {w.label}{w.isCurrent && <span className={styles.liveTag}>IN PROGRESS</span>}
                                </div>
                                {w.champion ? (
                                    <>
                                        <div className={styles.weekChampion}>
                                            {w.isCurrent ? '⏳' : '🏆'} {w.champion.username}
                                        </div>
                                        <div className={w.champion.profit >= 0 ? styles.profitPos : styles.profitNeg}>
                                            {profitMoney(w.champion.profit)}
                                        </div>
                                    </>
                                ) : (
                                    <div className={styles.stateMsg}>No bets</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ---- Classic boards ---- */}
            <div className={styles.grid}>
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>💰 Most Money</h2>
                    {renderSimpleList(topByBalance, u => u.balance, money)}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🏆 Biggest Single Win</h2>
                    {renderSimpleList(
                        topByBiggestWin,
                        u => u.biggestWin.amount,
                        money,
                        u => u.biggestWin.details
                    )}
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>🐕 Underdog Kings</h2>
                    <p className={styles.cardNote}>Most profit from odds +400 or higher</p>
                    {renderSimpleList(topByUnderdog, u => u.underdogProfit, money)}
                </div>
            </div>

            <div className={styles.driverSection}>
                <h2 className={styles.sectionTitle}>Global Driver Performance</h2>
                <DriverStats bets={slimBets} titlePrefix="Global" />
            </div>
        </div>
    );
};

export default Leaderboard;
