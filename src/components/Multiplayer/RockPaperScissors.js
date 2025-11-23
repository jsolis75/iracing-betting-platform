import React, { useState } from 'react';
import styles from './RockPaperScissors.module.css';

const RockPaperScissors = ({ lobbyId, userId, onPlayed }) => {
    const [choice, setChoice] = useState(null);
    const [submitted, setSubmitted] = useState(false);

    const handlePlay = async (c) => {
        setChoice(c);
        setSubmitted(true);
        try {
            const res = await fetch('/api/multiplayer/rps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lobbyId, userId, choice: c })
            });
            const data = await res.json();
            if (onPlayed) onPlayed(data);
        } catch (err) {
            console.error("RPS Failed", err);
            setSubmitted(false);
        }
    };

    if (submitted) {
        return (
            <div className={styles.container}>
                <h2>You threw {choice.toUpperCase()}</h2>
                <p>Waiting for opponents...</p>
                <div className={styles.loader}>⏳</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2>Tiebreaker!</h2>
            <p>Choose your weapon to decide the winner.</p>
            <div className={styles.buttons}>
                <button onClick={() => handlePlay('rock')} className={styles.btn}>🪨 Rock</button>
                <button onClick={() => handlePlay('paper')} className={styles.btn}>📄 Paper</button>
                <button onClick={() => handlePlay('scissors')} className={styles.btn}>✂️ Scissors</button>
            </div>
        </div>
    );
};

export default RockPaperScissors;
