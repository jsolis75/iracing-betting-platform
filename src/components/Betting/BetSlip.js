"use client";

import React from 'react';
import styles from './BetSlip.module.css';
import { useBetting } from '@/context/BettingContext';

const BetSlip = () => {
    const {
        bets,
        removeFromBetSlip,
        updateStake,
        placeBets,
        parlayMode,
        setParlayMode,
        parlayStake,
        setParlayStake,
        calculatePotentialPayout,
        calculateParlayInfo
    } = useBetting();

    const parlayInfo = calculateParlayInfo();

    // Calculate totals for Single Bets mode
    const totalStake = bets.reduce((sum, bet) => sum + (parseFloat(bet.stake) || 0), 0);
    const totalPotentialPayout = bets.reduce((sum, bet) => {
        return sum + calculatePotentialPayout(bet.stake, bet.odds);
    }, 0);

    return (
        <div className={styles.betSlip}>
            <div className={styles.header}>
                <h3 className={styles.title}>Bet Slip</h3>
                <div className={styles.headerControls}>
                    <span className={styles.count}>{bets.length}</span>
                </div>
            </div>

            {bets.length > 1 && (
                <div className={styles.modeToggle}>
                    <button
                        className={`${styles.toggleBtn} ${!parlayMode ? styles.active : ''}`}
                        onClick={() => setParlayMode(false)}
                    >
                        Singles
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${parlayMode ? styles.active : ''}`}
                        onClick={() => setParlayMode(true)}
                    >
                        Parlay
                    </button>
                </div>
            )}

            <div className={styles.content}>
                {bets.map((bet, index) => (
                    <div key={bet.id} className={styles.betItem}>
                        <div className={styles.betHeader}>
                            <span className={styles.betType}>{bet.type}</span>
                            <span className={styles.betOdds}>{bet.odds}</span>
                            <button onClick={() => removeFromBetSlip(index)} className={styles.removeBtn}>✕</button>
                        </div>
                        <div className={styles.betDetails}>
                            {bet.driver}
                            <span className={styles.raceName}>{bet.raceName}</span>
                        </div>

                        {!parlayMode && (
                            <>
                                <div className={styles.stakeInputRow}>
                                    <span className={styles.currency}>$</span>
                                    <input
                                        type="number"
                                        className={styles.stakeInput}
                                        placeholder="Wager"
                                        value={bet.stake}
                                        onChange={(e) => updateStake(index, e.target.value)}
                                    />
                                </div>
                                <div className={styles.payoutRow}>
                                    <span>Est. Payout</span>
                                    <span>${(calculatePotentialPayout(bet.stake, bet.odds) + (parseFloat(bet.stake) || 0)).toFixed(2)}</span>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {bets.length === 0 && (
                    <div className={styles.emptyState}>
                        Your bet slip is empty.
                    </div>
                )}
            </div>

            <div className={styles.footer}>
                {parlayMode && bets.length >= 2 ? (
                    <>
                        <div className={styles.parlayInfo}>
                            {parlayInfo.error ? (
                                <div className={styles.errorMessage}>{parlayInfo.error}</div>
                            ) : (
                                <>
                                    <div className={styles.summaryRow}>
                                        <span>Parlay Odds</span>
                                        <span className={styles.highlightOdds}>{parlayInfo.americanOdds}</span>
                                    </div>
                                    <div className={styles.stakeInputRow}>
                                        <span className={styles.currency}>$</span>
                                        <input
                                            type="number"
                                            className={styles.stakeInput}
                                            placeholder="Parlay Wager"
                                            value={parlayStake}
                                            onChange={(e) => setParlayStake(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        {!parlayInfo.error && (
                            <div className={styles.summaryRow}>
                                <span>Est. Payout</span>
                                <span className={styles.totalPayout}>
                                    ${(parlayInfo.payout + (parseFloat(parlayStake) || 0)).toFixed(2)}
                                </span>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className={styles.summaryRow}>
                            <span>Total Stake</span>
                            <span>${totalStake.toFixed(2)}</span>
                        </div>
                        <div className={styles.summaryRow}>
                            <span>Est. Payout</span>
                            <span className={styles.totalPayout}>
                                ${(totalPotentialPayout + totalStake).toFixed(2)}
                            </span>
                        </div>
                    </>
                )}

                <button
                    className={styles.placeBetBtn}
                    onClick={placeBets}
                    disabled={bets.length === 0 || (parlayMode && (bets.length < 2 || parlayInfo.error))}
                    style={{ opacity: (bets.length === 0 || (parlayMode && (bets.length < 2 || parlayInfo.error))) ? 0.5 : 1 }}
                >
                    Place Bet
                </button>
            </div>
        </div>
    );
};

export default BetSlip;
