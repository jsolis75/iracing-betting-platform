'use client';

import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';
import styles from './ManualSettlement.module.css';

const ManualSettlement = () => {
    const { user, refreshUser } = useUser();
    const [settling, setSettling] = useState(false);
    const [manualBets, setManualBets] = useState([]);
    const [loading, setLoading] = useState(true);

    // Only show for user "dumindu"
    if (!user || user.username !== 'dumindu') return null;

    // Fetch ALL pending manual settlement bets (not just current user's)
    React.useEffect(() => {
        const fetchManualBets = async () => {
            try {
                const response = await fetch('/api/bets?status=pending&manual=true');
                if (response.ok) {
                    const data = await response.json();
                    const pending = data.filter(bet =>
                        bet.status === 'pending' &&
                        ['slurmeister', 'fatality', 'kingkong'].includes(bet.bet_type)
                    );
                    setManualBets(pending);
                }
            } catch (error) {
                console.error('Error fetching manual bets:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchManualBets();
        const interval = setInterval(fetchManualBets, 5000); // Refresh every 5s
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div style={{ padding: '1rem', color: '#666' }}>Loading manual bets...</div>;
    if (manualBets.length === 0) return null;

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
                <p className={styles.subtitle}>Bets requiring manual review</p>
            </div>

            <div className={styles.betsList}>
                {manualBets.map(bet => (
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
