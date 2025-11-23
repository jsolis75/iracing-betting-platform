'use client';

import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';
import styles from './ManualSettlement.module.css';

const ManualSettlement = () => {
    const { user, refreshUser } = useUser();
    const { placedBets } = useBetting();
    const [settling, setSettling] = useState(false);

    // Only show for user "dumindu"
    if (!user || user.username !== 'dumindu') return null;

    // Filter for pending slurmeister bets
    const slurmeisterBets = placedBets.filter(bet =>
        bet.status === 'pending' && bet.bet_type === 'slurmeister'
    );

    if (slurmeisterBets.length === 0) return null;

    const handleSettle = async (betId, result) => {
        if (!confirm(`Are you sure you want to settle this bet as ${result.toUpperCase()}?`)) return;

        setSettling(true);
        try {
            const response = await fetch('/api/manual-settle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ betId, result })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to settle bet');
            }

            alert(`Bet settled as ${result}!`);
            refreshUser();
            window.location.reload();
        } catch (error) {
            console.error('Error settling bet:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setSettling(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>🔐 Manual Settlement (Admin)</h3>
                <p className={styles.subtitle}>Slurmeister bets requiring manual review</p>
            </div>

            <div className={styles.betsList}>
                {slurmeisterBets.map(bet => (
                    <div key={bet.id} className={styles.betCard}>
                        <div className={styles.betInfo}>
                            <div className={styles.betDetails}>
                                <span className={styles.betTitle}>
                                    {bet.driver_name}
                                </span>
                                <span className={styles.betMeta}>
                                    Race ID: {bet.race_id} • Stake: ${bet.stake} • Odds: {bet.odds}
                                </span>
                                <span className={styles.payout}>
                                    Potential Payout: ${bet.potential_payout}
                                </span>
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.settleBtn} ${styles.winBtn}`}
                                    onClick={() => handleSettle(bet.id, 'won')}
                                    disabled={settling}
                                >
                                    ✓ WIN
                                </button>
                                <button
                                    className={`${styles.settleBtn} ${styles.loseBtn}`}
                                    onClick={() => handleSettle(bet.id, 'lost')}
                                    disabled={settling}
                                >
                                    ✗ LOSE
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ManualSettlement;
