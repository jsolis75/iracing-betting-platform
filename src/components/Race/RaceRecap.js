"use client";

import React from 'react';
import styles from './RaceRecap.module.css';
import { useBetting } from '@/context/BettingContext';
import { useUser } from '@/context/UserContext';

// ============================================================
// RaceRecap — shown when the race finishes.
//  • Podium: final top 3
//  • Your bets: each bet's result + payout
//  • Net result for the race
// Bets settle ~60s after the checkered flag, so pending bets
// show as "settling…" until the server grades them.
// ============================================================

const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉');

export default function RaceRecap({ race, onViewResults }) {
    const { placedBets } = useBetting();
    const { user } = useUser();

    const drivers = race.drivers || [];

    // Final podium: top 3 by current (final) position
    const podium = [...drivers]
        .filter(d => d.currentPosition > 0)
        .sort((a, b) => a.currentPosition - b.currentPosition)
        .slice(0, 3);

    // The user's bets on this race
    const myBets = (placedBets || []).filter(
        b => String(b.race_id) === String(race.id)
    );

    let net = 0;
    let anyPending = false;
    myBets.forEach(b => {
        if (b.status === 'won') net += Number(b.potential_payout) || 0;
        else if (b.status === 'lost') net -= Number(b.stake) || 0;
        else anyPending = true;
    });

    const settled = myBets.length > 0 && !anyPending;

    return (
        <div className={styles.recap}>
            <div className={styles.recapHeader}>
                <h3 className={styles.recapTitle}>🏁 Race Recap</h3>
                <button className={styles.resultsBtn} onClick={onViewResults}>
                    Full Results
                </button>
            </div>

            {/* Podium */}
            {podium.length > 0 && (
                <div className={styles.podium}>
                    {podium.map((d, i) => (
                        <div key={d.id} className={`${styles.podiumSpot} ${i === 0 ? styles.winner : ''}`}>
                            <div className={styles.podiumMedal}>{medal(i)}</div>
                            <div className={styles.podiumName}>{d.name}</div>
                            <div className={styles.podiumMeta}>#{d.number} • {d.iRating} iR</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Your bets */}
            {user && myBets.length > 0 && (
                <div className={styles.betResults}>
                    <div className={styles.betResultsTitle}>Your bets</div>
                    {myBets.map(b => (
                        <div key={b.id} className={styles.betRow}>
                            <span className={styles.betDesc}>
                                {b.driver_name} <span className={styles.betType}>{b.bet_type} @ {b.odds}</span>
                            </span>
                            <span className={
                                b.status === 'won' ? styles.betWon :
                                    b.status === 'lost' ? styles.betLost :
                                        styles.betPending
                            }>
                                {b.status === 'won' && `+$${(Number(b.potential_payout) || 0).toFixed(2)}`}
                                {b.status === 'lost' && `-$${(Number(b.stake) || 0).toFixed(2)}`}
                                {b.status !== 'won' && b.status !== 'lost' && '⏳ settling…'}
                            </span>
                        </div>
                    ))}

                    <div className={styles.netRow}>
                        {settled ? (
                            <span className={net >= 0 ? styles.netWin : styles.netLoss}>
                                {net >= 0 ? `🎉 You won $${net.toFixed(2)} on this race!` : `You lost $${Math.abs(net).toFixed(2)} on this race`}
                            </span>
                        ) : (
                            <span className={styles.betPending}>
                                Bets settle about a minute after the checkered flag…
                            </span>
                        )}
                    </div>
                </div>
            )}

            {user && myBets.length === 0 && (
                <div className={styles.noBets}>You didn&apos;t bet on this race. Next one!</div>
            )}
        </div>
    );
}
