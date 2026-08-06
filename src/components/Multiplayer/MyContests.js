import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import styles from './MyContests.module.css';

const MyContests = () => {
    const { user } = useUser();
    const [contests, setContests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        fetch(`/api/multiplayer/my-contests?userId=${user.id}`)
            .then(res => res.json())
            .then(data => {
                setContests(data.contests || []);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch contests", err);
                setLoading(false);
            });
    }, [user]);

    if (loading) return <div className={styles.loading}>Loading your contests...</div>;

    return (
        <div className={styles.container}>
            <h2>My Active Contests</h2>
            {contests.length === 0 ? (
                <p className={styles.empty}>You haven't joined any contests yet.</p>
            ) : (
                <div className={styles.grid}>
                    {contests.map(contest => (
                        <div key={contest.id} className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3>{contest.raceName}</h3>
                                <span className={`${styles.status} ${styles[contest.status]}`}>
                                    {(contest.status || 'unknown').toUpperCase()}
                                </span>
                            </div>
                            <p className={styles.track}>{contest.trackName}</p>
                            <div className={styles.details}>
                                <span>Prize Pool: ${contest.prizePool}</span>
                                <span>Score: {contest.score}</span>
                            </div>
                            <a href={`/multiplayer?raceId=${contest.raceId}`} className={styles.enterBtn}>
                                Enter Lobby
                            </a>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyContests;
