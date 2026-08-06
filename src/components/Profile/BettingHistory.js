"use client";

import React, { useState, useEffect } from 'react';
import styles from './BettingHistory.module.css';
import { useUser } from '@/context/UserContext';
import { useBetting } from '@/context/BettingContext';

// Series mapping
const seriesMapping = {
    58: "NASCAR A Open Series",
    62: "NASCAR B Open Series",
    103: "B Fixed Series",
    164: "NASCAR Truck Series",
    165: "NASCAR Xfinity Series",
    166: "NASCAR Cup Series",
    167: "Arca Series Fixed",
    312: "ARCA Menards Series",
    382: "Street Stock",
    // Add more as needed
};

const BettingHistory = () => {
    const { user } = useUser();
    const { placedBets } = useBetting();
    const [raceData, setRaceData] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const fetchedRaceIdsRef = React.useRef(new Set());

    useEffect(() => {
        const fetchRaceData = async () => {
            if (!placedBets || placedBets.length === 0) return;

            // Only fetch race names we haven't already fetched (this used to
            // re-download every race's data each time the bets list changed)
            const raceIds = [...new Set(placedBets.map(bet => bet.race_id).filter(id => id !== 'multi'))]
                .filter(id => !fetchedRaceIdsRef.current.has(id));

            for (const raceId of raceIds) {
                fetchedRaceIdsRef.current.add(raceId);
                try {
                    const res = await fetch(`/api/race-data?raceId=${raceId}`);
                    if (res.ok) {
                        const data = await res.json();
                        const seriesId = data?.WeekendInfo?.SeriesID;
                        const trackName = data?.WeekendInfo?.TrackDisplayName || 'Unknown Track';
                        const seriesName = seriesId ? (seriesMapping[seriesId] || `Series ${seriesId}`) : 'Race';
                        setRaceData(prev => ({
                            ...prev,
                            [raceId]: `${seriesName} at ${trackName}`
                        }));
                    }
                } catch (err) {
                    console.error(`Failed to fetch race ${raceId}:`, err);
                }
            }
        };

        fetchRaceData();
    }, [placedBets]);

    if (!user) return null;

    const history = placedBets || [];
    const totalPages = Math.ceil(history.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentItems = history.slice(startIndex, startIndex + itemsPerPage);

    const handlePrevPage = () => {
        if (currentPage > 1) setCurrentPage(prev => prev - 1);
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Betting History</h2>
            {history.length === 0 ? (
                <div className={styles.empty}>No bets placed yet.</div>
            ) : (
                <>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Race</th>
                                <th>Driver</th>
                                <th>Type</th>
                                <th>Odds</th>
                                <th>Stake</th>
                                <th>Result</th>
                                <th>Payout</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentItems.map((bet, index) => (
                                <tr key={index}>
                                    <td>{new Date(bet.created_at).toLocaleDateString()}</td>
                                    <td>{bet.race_id === 'multi' ? 'Parlay' : (raceData[bet.race_id] || `Race ${bet.race_id}`)}</td>
                                    <td>
                                        {bet.driver_name}
                                        {/* details is an ARRAY for parlays but an OBJECT for specials — guard it */}
                                        {Array.isArray(bet.details) && (
                                            <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                {bet.details.map((leg, i) => (
                                                    <div key={i}>
                                                        {leg.driver} ({leg.type})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td>{bet.bet_type}</td>
                                    <td>{bet.odds}</td>
                                    <td>${parseFloat(bet.stake).toFixed(2)}</td>
                                    <td className={
                                        bet.result === 'won' ? styles.won :
                                            bet.result === 'lost' ? styles.lost : styles.pending
                                    }>
                                        {bet.status === 'pending' ? 'Pending' : bet.result}
                                    </td>
                                    <td>
                                        {bet.result === 'won' ? `$${bet.potential_payout}` : '-'}
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
                                    background: currentPage === 1 ? 'var(--background-input)' : 'var(--primary-blue)',
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
                                    background: currentPage === totalPages ? 'var(--background-input)' : 'var(--primary-blue)',
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

export default BettingHistory;
