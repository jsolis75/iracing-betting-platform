'use client';

import React from 'react';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';
import styles from './LiveBets.module.css';

const LiveBets = ({ raceData }) => {
    const { user } = useUser();
    const { placedBets } = useBetting();

    if (!user) return null;

    // Filter for pending bets
    const liveBets = placedBets.filter(bet => bet.status === 'pending');

    if (liveBets.length === 0) return null;

    // Helper to determine if a bet is currently "winning" based on live race data
    const getBetStatus = (bet) => {
        if (!raceData || !raceData.drivers) return { status: 'Waiting for data...', isWinning: false };

        if (bet.type === 'Parlay') {
            // Simple check for parlay - if any leg is failing, it's failing
            // This is complex to track live perfectly without iterating all legs, 
            // so we'll just show "In Progress" for now or check first leg if simple.
            return { status: 'In Progress', isWinning: true };
        }

        const driver = raceData.drivers.find(d => d.name === bet.driver);
        if (!driver) return { status: 'Driver not found', isWinning: false };

        const pos = driver.currentPosition;

        switch (bet.type) {
            case 'Win':
                return {
                    status: `Running P${pos}`,
                    isWinning: pos === 1
                };
            case 'Top 3':
                return {
                    status: `Running P${pos}`,
                    isWinning: pos <= 3
                };
            case 'Top 10':
                return {
                    status: `Running P${pos}`,
                    isWinning: pos <= 10
                };
            case 'Crash':
                const isCrashed = driver.currentIncidents > 0 || driver.status === 'Disconnected';
                return {
                    status: isCrashed ? 'Crashed (Winning)' : 'Running (Clean)',
                    isWinning: isCrashed
                };
            default:
                return { status: 'In Progress', isWinning: true };
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    <span className={styles.liveIndicator}></span>
                    Live Bets
                </h3>
            </div>
            <div className={styles.betList}>
                {liveBets.map((bet, index) => {
                    const { status, isWinning } = getBetStatus(bet);
                    return (
                        <div
                            key={index}
                            className={`${styles.betItem} ${isWinning ? styles.winning : styles.losing}`}
                        >
                            <div className={styles.betInfo}>
                                <span className={styles.driverName}>{bet.driver_name}</span>
                                <span className={styles.betType}>
                                    {bet.bet_type} @ {bet.odds}
                                </span>
                            </div>
                            <div className={styles.betStatus}>
                                <span className={styles.potentialPayout}>
                                    To Win: ${bet.potential_payout}
                                </span>
                                <span className={styles.currentStatus}>
                                    {status}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LiveBets;
