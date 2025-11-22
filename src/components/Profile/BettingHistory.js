"use client";

import React from 'react';
import styles from './BettingHistory.module.css';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';

const BettingHistory = () => {
    const { user } = useUser();
    const { placedBets } = useBetting();

    if (!user) return null;

    const history = placedBets || [];

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
                                <td>{new Date(bet.created_at).toLocaleDateString()}</td>
                                <td>{bet.race_id === 'multi' ? 'Parlay' : 'Race ' + bet.race_id}</td>
                                <td>
                                    {bet.driver_name}
                                    {bet.details && (
                                        <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '4px' }}>
                                            {bet.details.map((leg, i) => (
                                                <div key={i}>
                                                    {leg.driver} ({leg.type})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td>{bet.bet_type}</td>
                                <td>{bet.odds}</td>
                                <td>${parseFloat(bet.stake).toFixed(2)}</td>
                                <td className={
                                    bet.result === 'won' ? styles.won :
                                        bet.result === 'lost' ? styles.lost : styles.pending
                                }>
                                    {bet.status === 'pending' ? 'Pending' : bet.result}
                                </td>
                                <td>
                                    {bet.result === 'won' ? `$${bet.potential_payout}` : '-'}
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
