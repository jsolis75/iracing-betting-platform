"use client";

import React, { useState, useMemo } from 'react';
import styles from './DriverStats.module.css';
import { useBetting } from '@/context/BettingContext';

const DriverStats = ({ bets, titlePrefix = '' }) => {
    const { placedBets: contextBets } = useBetting();
    const [bannedSort, setBannedSort] = useState('amount'); // 'amount' or 'frequency'
    const [profitSort, setProfitSort] = useState('amount'); // 'amount' or 'frequency'

    // Use provided bets prop or fall back to context (user's bets)
    const betsToAnalyze = bets || contextBets;

    const stats = useMemo(() => {
        if (!betsToAnalyze) return { banned: [], profitable: [] };

        const driverMap = {};

        betsToAnalyze.forEach(bet => {
            // Skip pending bets
            if (bet.status === 'pending') return;

            // Handle Parlays (Multi-driver) - Skip for now as they are "Team" efforts?
            // Or maybe attribute to all? For simplicity, let's skip 'Parlay' type for individual driver stats
            // unless we want to parse the details. The user asked for "Parlay Banned List" but 
            // usually that means "Drivers I shouldn't put in a parlay".
            // Let's stick to single bets or parse if possible. 
            // Actually, if race_id is 'multi', bet.driver_name is 'X Legs'.
            // We should probably look at the 'details' if available, but for now let's focus on single bets
            // to avoid double counting or complex attribution.
            if (bet.race_id === 'multi') return;

            const name = bet.driver_name;
            if (!driverMap[name]) {
                driverMap[name] = { name, net: 0, wins: 0, losses: 0, totalBets: 0 };
            }

            const stake = parseFloat(bet.stake);
            const profit = parseFloat(bet.potential_payout); // This is profit only

            driverMap[name].totalBets++;

            if (bet.result === 'won') {
                driverMap[name].wins++;
                driverMap[name].net += profit;
            } else if (bet.result === 'lost') {
                driverMap[name].losses++;
                driverMap[name].net -= stake;
            }
        });

        const allDrivers = Object.values(driverMap);

        const banned = allDrivers
            .filter(d => d.net < 0)
            .sort((a, b) => {
                if (bannedSort === 'amount') return a.net - b.net; // Ascending (most negative first)
                return b.losses - a.losses; // Descending (most losses first)
            });

        const profitable = allDrivers
            .filter(d => d.net > 0)
            .sort((a, b) => {
                if (profitSort === 'amount') return b.net - a.net; // Descending (most profit first)
                return b.wins - a.wins; // Descending (most wins first)
            });

        return { banned, profitable };
    }, [betsToAnalyze, bannedSort, profitSort]);

    return (
        <div className={styles.container}>
            {/* PARLAY BANNED LIST (Net Losers) */}
            <div className={styles.card}>
                <div className={styles.title}>
                    <span className={styles.bannedTitle}>🚫 {titlePrefix} Parlay Banned List</span>
                </div>
                <div className={styles.controls}>
                    <span>Sort by:</span>
                    <button
                        className={`${styles.sortBtn} ${bannedSort === 'amount' ? styles.activeSort : ''}`}
                        onClick={() => setBannedSort('amount')}
                    >
                        Loss Amount
                    </button>
                    <button
                        className={`${styles.sortBtn} ${bannedSort === 'frequency' ? styles.activeSort : ''}`}
                        onClick={() => setBannedSort('frequency')}
                    >
                        Frequency
                    </button>
                </div>

                {stats.banned.length === 0 ? (
                    <div className={styles.empty}>No drivers have lost money yet!</div>
                ) : (
                    <ul className={styles.list}>
                        {stats.banned.map(driver => (
                            <li key={driver.name} className={styles.listItem}>
                                <span className={styles.driverName}>{driver.name}</span>
                                <div className={styles.stats}>
                                    <span className={`${styles.amount} ${styles.negative}`}>
                                        -${Math.abs(driver.net).toFixed(2)}
                                    </span>
                                    <span className={styles.subStat}>
                                        {driver.losses} Losses ({driver.totalBets} Bets)
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* MOST PROFITABLE (Net Winners) */}
            <div className={styles.card}>
                <div className={styles.title}>
                    <span className={styles.profitableTitle}>💰 {titlePrefix} Most Profitable</span>
                </div>
                <div className={styles.controls}>
                    <span>Sort by:</span>
                    <button
                        className={`${styles.sortBtn} ${profitSort === 'amount' ? styles.activeSort : ''}`}
                        onClick={() => setProfitSort('amount')}
                    >
                        Profit Amount
                    </button>
                    <button
                        className={`${styles.sortBtn} ${profitSort === 'frequency' ? styles.activeSort : ''}`}
                        onClick={() => setProfitSort('frequency')}
                    >
                        Frequency
                    </button>
                </div>

                {stats.profitable.length === 0 ? (
                    <div className={styles.empty}>No profitable drivers yet.</div>
                ) : (
                    <ul className={styles.list}>
                        {stats.profitable.map(driver => (
                            <li key={driver.name} className={styles.listItem}>
                                <span className={styles.driverName}>{driver.name}</span>
                                <div className={styles.stats}>
                                    <span className={`${styles.amount} ${styles.positive}`}>
                                        +${driver.net.toFixed(2)}
                                    </span>
                                    <span className={styles.subStat}>
                                        {driver.wins} Wins ({driver.totalBets} Bets)
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default DriverStats;
