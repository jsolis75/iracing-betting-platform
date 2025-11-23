'use client';

import React from 'react';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';
import styles from './LiveBets.module.css';

const LiveBets = ({ raceData }) => {
    const { user } = useUser();
    const { placedBets, settleBets } = useBetting();

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

        // Handle special bets
        if (bet.bet_type === 'terrorist' || bet.bet_type === 'alqaeda') {
            const drivers = raceData.drivers || [];
            const terroristCount = drivers.filter(d => (d.currentIncidents || 0) >= 17).length;
            const maxIncidents = Math.max(...drivers.map(d => d.currentIncidents || 0));
            const selection = bet.driver_name?.includes('Yes') ? 'Yes' : 'No';

            if (bet.bet_type === 'terrorist') {
                const hasTerrorist = terroristCount >= 1;
                const isWinning = (selection === 'Yes' && hasTerrorist) || (selection === 'No' && !hasTerrorist);
                return {
                    status: `Max Incidents: ${maxIncidents} (${terroristCount} @ 17+)`,
                    isWinning: isWinning
                };
            } else if (bet.bet_type === 'alqaeda') {
                const hasAlQaeda = terroristCount >= 3;
                const isWinning = (selection === 'Yes' && hasAlQaeda) || (selection === 'No' && !hasAlQaeda);
                return {
                    status: `Terrorists: ${terroristCount}/3 needed`,
                    isWinning: isWinning
                };
            }
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

    // Manual settlement handler
    const handleSettle = () => {
        if (confirm("Are you sure you want to settle these bets based on the current standings?")) {
            // We need to import settleBets from context, but it's not destructured above.
            // Let's fix the destructuring first.
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    <span className={styles.liveIndicator}></span>
                    Live Bets
                </h3>
                {/* Manual Settle Button - Only show if there are pending bets */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => {
                            if (confirm("Force settle all pending bets based on current results?")) {
                                fetch('/api/settle-race', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        raceId: raceData.id,
                                        drivers: raceData.drivers
                                    })
                                })
                                    .then(res => res.json())
                                    .then(data => {
                                        alert(data.message || "Settlement triggered");
                                        window.location.reload();
                                    })
                                    .catch(err => alert("Error: " + err.message));
                            }
                        }}
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.8em',
                            background: '#e53e3e',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Force Settle
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.8em',
                            background: '#4a5568',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Refresh
                    </button>
                </div>
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
                                <span className={styles.driverName}>
                                    {bet.driver_name}
                                    {bet.details && (
                                        <div style={{ fontSize: '0.8em', color: '#ccc', marginTop: '4px' }}>
                                            {bet.details.map((leg, i) => (
                                                <span key={i} style={{ display: 'block' }}>
                                                    • {leg.driver} ({leg.type})
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </span>
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
