'use client';

import React from 'react';
import { useBetting } from '@/context/BettingContext';
import styles from './SpecialsView.module.css';

const SpecialsView = ({ race, isFinished }) => {
    const { addToBetSlip } = useBetting();

    const handleBet = (betType, selection, odds) => {
        if (isFinished) {
            alert("Race has finished – betting is closed.");
            return;
        }
        addToBetSlip({
            driver: `${betType} - ${selection}`,
            type: betType,
            odds,
            raceName: race.name,
            raceId: race.id,
            special: true,
            selection: selection // 'Yes' or 'No'
        });
    };

    const specials = [
        {
            id: 'terrorist',
            title: '🔥 The Terrorist',
            question: 'Will there be a terrorist this race?',
            definition: 'A driver who accumulates 17 or more incidents during the race.',
            yesOdds: '-110',
            noOdds: '-110'
        },
        {
            id: 'alqaeda',
            title: '💥 Al Qaeda Sighting',
            question: 'Will there be an Al Qaeda sighting this race?',
            definition: '3 or more drivers accumulating 17 or more incidents during the race.',
            yesOdds: '+200',
            noOdds: '-300'
        },
        {
            id: 'slurmeister',
            title: '🚫 Slurmeister',
            question: 'Will there be a slurmeister this race?',
            definition: '1 or more drivers drop a slur during the race (text or voice chat). Slurs determined by the National Slur Database (rsdb.org). ⚠️ Manually settled.',
            yesOdds: '+150',
            noOdds: '-200'
        },
        {
            id: 'fatality',
            title: '💀 Fatality',
            question: 'Will a driver have a fatal accident?',
            definition: 'Crash + DNF + Reasonable expectation of fatality in real life. ⚠️ Manually settled.',
            yesOdds: '+500',
            noOdds: '-800'
        },
        {
            id: 'kingkong',
            title: '🦍 High iRating King Kong',
            question: 'Will a driver complain about high iRating/ego?',
            definition: 'Driver complains about high iRating, ego, or top split racing. ⚠️ Manually settled.',
            yesOdds: '+200',
            noOdds: '-250'
        }
    ];

    return (
        <div className={styles.container}>
            <div className={styles.intro}>
                <h3 className={styles.title}>🎲 Race Specials</h3>
                <p className={styles.subtitle}>Bet on incident-based events during the race</p>
            </div>

            <div className={styles.specialsList}>
                {specials.map(special => (
                    <div key={special.id} className={styles.specialCard}>
                        <div className={styles.cardHeader}>
                            <h4 className={styles.specialTitle}>{special.title}</h4>
                            <p className={styles.question}>{special.question}</p>
                        </div>

                        <div className={styles.definition}>
                            <span className={styles.definitionLabel}>Definition:</span>
                            <p className={styles.definitionText}>{special.definition}</p>
                        </div>

                        <div className={styles.betOptions}>
                            <button
                                className={`${styles.betButton} ${styles.yesButton}`}
                                onClick={() => handleBet(special.id, 'Yes', special.yesOdds)}
                                disabled={isFinished}
                            >
                                <span className={styles.selectionLabel}>YES</span>
                                <span className={styles.oddsValue}>{special.yesOdds}</span>
                            </button>

                            <button
                                className={`${styles.betButton} ${styles.noButton}`}
                                onClick={() => handleBet(special.id, 'No', special.noOdds)}
                                disabled={isFinished}
                            >
                                <span className={styles.selectionLabel}>NO</span>
                                <span className={styles.oddsValue}>{special.noOdds}</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.footer}>
                <p className={styles.footerText}>
                    💡 Specials can be parlayed with regular driver bets for bigger payouts!
                </p>
            </div>
        </div>
    );
};

export default SpecialsView;
