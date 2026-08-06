'use client';

import React from 'react';
import { useBetting } from '@/context/BettingContext';
import styles from './OverUnderView.module.css';
import { useToast } from '@/components/Toast/ToastContext';

const OverUnderView = ({ race, isFinished }) => {
    const { addToBetSlip } = useBetting();
    const toast = useToast();
    const { drivers, name, id } = race;

    const handleBet = (driver, selection, odds) => {
        if (isFinished) {
            toast.info("Race has finished – betting is closed.");
            return;
        }
        addToBetSlip({
            driver: driver.name,
            type: 'over_under',
            odds,
            raceName: name,
            raceId: id,
            selection: selection // 'Over' or 'Under'
        });
    };

    // Sort drivers by position for the list
    const sortedDrivers = [...(drivers || [])].sort((a, b) => a.currentPosition - b.currentPosition);

    return (
        <div className={styles.container}>
            <div className={styles.intro}>
                <h3 className={styles.title}>📊 Incident Points Over/Under</h3>
                <p className={styles.subtitle}>Bet on whether a driver will exceed 8.5 incident points</p>
            </div>

            <div className={styles.tableHeader}>
                <div className={styles.colDriver}>Driver</div>
                <div className={styles.colLine}>Line</div>
                <div className={styles.colBet}>Over</div>
                <div className={styles.colBet}>Under</div>
            </div>

            <div className={styles.driverList}>
                {sortedDrivers.map(driver => (
                    <div key={driver.id} className={styles.driverRow}>
                        <div className={styles.colDriver}>
                            <span className={styles.number}>#{driver.number}</span>
                            <div className={styles.driverInfo}>
                                <span className={styles.name}>{driver.name}</span>
                                <span className={styles.stats}>
                                    Avg Inc: {driver.Stats?.avgIncidents?.toFixed(2) || 'N/A'} • Current: {driver.currentIncidents || 0}x
                                </span>
                            </div>
                        </div>
                        <div className={styles.colLine}>8.5</div>
                        <div className={styles.colBet}>
                            <button
                                className={styles.betButton}
                                onClick={() => handleBet(driver, 'Over', '-110')}
                                disabled={isFinished || driver.isDNF}
                            >
                                -110
                            </button>
                        </div>
                        <div className={styles.colBet}>
                            <button
                                className={styles.betButton}
                                onClick={() => handleBet(driver, 'Under', '-110')}
                                disabled={isFinished || driver.isDNF}
                            >
                                -110
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.footer}>
                <p className={styles.footerText}>
                    💡 Incident points are settled based on the final race results.
                </p>
            </div>
        </div>
    );
};

export default OverUnderView;
