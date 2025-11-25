"use client";

import React, { useState, useEffect } from 'react';
import styles from './BettingHistory.module.css';
import { useUser } from '@/context/UserContext';

const FantasyHistory = () => {
    const { user } = useUser();
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        if (!user) return;

        const fetchHistory = async () => {
            try {
                const res = await fetch(`/api/multiplayer/my-contests?userId=${user.id}&history=true`);
                if (res.ok) {
                    const data = await res.json();
                    // Only show completed contests
                    const completed = data.contests.filter(c => c.status === 'completed');
                    setContests(completed);
                }
            } catch (err) {
                console.error('Failed to fetch fantasy history:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [user]);

    if (!user) return null;

    if (loading) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>Fantasy History</h2>
                <div className={styles.empty}>Loading...</div>
            </div>
        );
    }

    const totalPages = Math.ceil(contests.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentItems = contests.slice(startIndex, startIndex + itemsPerPage);

    const handlePrevPage = () => {
        if (currentPage > 1) setCurrentPage(prev => prev - 1);
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Fantasy History</h2>
            {contests.length === 0 ? (
                <div className={styles.empty}>No completed fantasy contests yet.</div>
            ) : (
                <>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Race</th>
                                <th>Entry Fee</th>
                                <th>Prize Pool</th>
                                <th>Final Score</th>
                                <th>Rank</th>
                                <th>Winnings</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentItems.map((contest, index) => (
                                <tr key={index}>
                                    <td>{contest.raceName || 'Unknown Race'}</td>
                                    <td>${contest.entry_fee || 0}</td>
                                    <td>${contest.prizePool || 0}</td>
                                    <td>{contest.score?.toFixed(1) || '0.0'} pts</td>
                                    <td>{contest.position > 0 ? `#${contest.position}` : 'TBD'}</td>
                                    <td style={{ color: contest.winnings > 0 ? 'var(--primary-green)' : 'inherit' }}>
                                        {contest.winnings > 0 ? `$${contest.winnings}` : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
                            <button
                                onClick={handlePrevPage}
                                disabled={currentPage === 1}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentPage === 1 ? '#333' : 'var(--primary-blue)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                ← Previous
                            </button>
                            <span>Page {currentPage} of {totalPages}</span>
                            <button
                                onClick={handleNextPage}
                                disabled={currentPage === totalPages}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentPage === totalPages ? '#333' : 'var(--primary-blue)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default FantasyHistory;
