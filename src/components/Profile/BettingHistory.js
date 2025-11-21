"use client";

import React from 'react';
import styles from './BettingHistory.module.css';
import { useUser } from '@/context/UserContext';

const BettingHistory = () => {
    const { user } = useUser();

    if (!user) return null;

    const history = user.betHistory || [];

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Betting History</h2>
            {history.length === 0 ? (
                <div className={styles.empty}>No bets placed yet.</div>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Race</th>
                            <th>Driver</th>
                            <th>Type</th>
                            <th>Odds</th>
                            <th>Stake</th>
                            <th>Result</th>
                            <th>Payout</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((bet, index) => (
                            <tr key={index}>
                                <td>{new Date(bet.timestamp || Date.now()).toLocaleDateString()}</td>
                                <td>{bet.raceName || 'Unknown Race'}</td>
                                <td>{bet.driver}</td>
                                <td>{bet.type}</td>
                                <td>{bet.odds}</td>
                                <td>${parseFloat(bet.stake).toFixed(2)}</td>
                                <td className={
                                    bet.result === 'Won' ? styles.won :
                                        bet.result === 'Lost' ? styles.lost : styles.pending
                                }>
                                    {bet.result || 'Pending'}
                                </td>
                                <td>
                                    {bet.result === 'Won' ? `$${bet.payout.toFixed(2)}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default BettingHistory;
