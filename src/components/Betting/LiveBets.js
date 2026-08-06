'use client';

import React from 'react';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';
import styles from './LiveBets.module.css';
import { useToast } from '@/components/Toast/ToastContext';

const LiveBets = ({ raceData }) => {
    const { user } = useUser();
    const { placedBets, settleBets } = useBetting();
    const toast = useToast();

    if (!user) return null;

    // Filter for pending bets
    const liveBets = placedBets.filter(bet => bet.status === 'pending');

    if (liveBets.length === 0) return null;

    // Helper to determine if a bet is currently "winning" based on live race data
    const getBetStatus = (bet) => {
        if (!raceData || !raceData.drivers) return { status: 'Waiting for data...', isWinning: false };

        // NOTE: DB rows use snake_case: bet_type / driver_name (bet.type & bet.driver don't exist)
        if (bet.bet_type === 'Parlay') {
            // Simple check for parlay - if any leg is failing, it's failing
            // This is complex to track live perfectly without iterating all legs, 
            // so we'll just show "In Progress" for now or check first leg if simple.
            return { status: 'In Progress', isWinning: true };
        }

        // Handle manual settlement bets
        if (['slurmeister', 'fatality', 'kingkong'].includes(bet.bet_type)) {
            return {
                status: '⚠️ Awaiting Manual Review',
                isWinning: true
            };
        }

        // Handle special bets
        if (bet.bet_type === 'terrorist' || bet.bet_type === 'alqaeda') {
            const drivers = raceData.drivers || [];
            const terroristCount = drivers.filter(d => (d.currentIncidents || 0) >= 17).length;
            const maxIncidents = drivers.length > 0 ? Math.max(...drivers.map(d => d.currentIncidents || 0)) : 0;
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

        // Normalize names for matching
        const normalize = (name) => name?.toLowerCase().trim();
        const driver = raceData.drivers.find(d => normalize(d.name) === normalize(bet.driver_name));

        if (!driver) {
            // Even if not found, show the bet but mark as unknown status
            return { status: 'Waiting for driver...', isWinning: false };
        }

        const pos = driver.currentPosition;

        switch (bet.bet_type) {
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
                                        toast.success(data.message || "Settlement triggered");
                                        setTimeout(() => window.location.reload(), 1200);
                                    })
                                    .catch(err => toast.error("Error: " + err.message));
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
                            key={bet.id ?? index}
                            className={`${styles.betItem} ${isWinning ? styles.winning : ''}`}
                            style={isWinning ? {
                                borderLeft: '4px solid #4ade80',
                                background: 'rgba(74, 222, 128, 0.1)'
                            } : {}}
                        >
                            <div className={styles.betInfo}>
                                <span className={styles.driverName}>
                                    {bet.driver_name}
                                    {/* details is an ARRAY for parlays but an OBJECT for specials — guard it */}
                                    {Array.isArray(bet.details) && (
                                        <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)', marginTop: '4px' }}>
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
                                <span className={styles.currentStatus} style={{
                                    color: isWinning ? 'var(--status-success)' : 'var(--text-muted)',
                                    fontWeight: isWinning ? 'bold' : 'normal'
                                }}>
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
