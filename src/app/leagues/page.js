"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import WinstelDraft from '@/components/Winstel/WinstelDraft';
import WinstelStandings from '@/components/Winstel/WinstelStandings';
import styles from '../multiplayer/Multiplayer.module.css';

const LeaguesContent = () => {
    const { user } = useUser();

    // UI State
    const [activeTab, setActiveTab] = useState('draft'); // 'draft' or 'standings'

    // Data State
    const [event, setEvent] = useState(null);
    const [drivers, setDrivers] = useState([]);
    const [myEntry, setMyEntry] = useState(null);
    const [standings, setStandings] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            // 1. Fetch Drivers and Event
            const driverRes = await fetch('/api/winstel/drivers');
            if (driverRes.ok) {
                const data = await driverRes.json();
                setEvent(data.event);
                setDrivers(data.drivers);

                // 2. Fetch User Entry if event exists
                if (user && data.event) {
                    const entryRes = await fetch(`/api/winstel/lineup?eventId=${data.event.id}&userId=${user.id}`);
                    if (entryRes.ok) {
                        const entryData = await entryRes.json();
                        setMyEntry(entryData.entry);
                    }
                }
            }

            // 3. Fetch Standings
            const standingsRes = await fetch('/api/winstel/standings');
            if (standingsRes.ok) {
                const standingsData = await standingsRes.json();
                setStandings(standingsData.standings);
            }
        } catch (err) {
            console.error("Failed to fetch Winstel data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user]);

    if (loading) return <div className={styles.container}>Loading Winstel Cup Series...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <h1 style={{ color: '#eab308', textTransform: 'uppercase', fontStyle: 'italic', fontSize: '2.5rem' }}>
                        Winstel Cup Series
                    </h1>
                    <div className={styles.tabs} style={{ marginTop: '1rem' }}>
                        <button
                            className={`${styles.tab} ${activeTab === 'draft' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('draft')}
                            style={{ background: activeTab === 'draft' ? '#eab308' : 'transparent', color: activeTab === 'draft' ? 'black' : 'white' }}
                        >
                            Draft Lineup
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'standings' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('standings')}
                            style={{ background: activeTab === 'standings' ? '#eab308' : 'transparent', color: activeTab === 'standings' ? 'black' : 'white' }}
                        >
                            Season Standings
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
                {activeTab === 'draft' ? (
                    event ? (
                        <WinstelDraft
                            user={user}
                            event={event}
                            drivers={drivers}
                            initialLineup={myEntry?.driver_ids || []}
                            onSave={fetchData}
                        />
                    ) : (
                        <p>No active event found. Stay tuned for the next race!</p>
                    )
                ) : (
                    <WinstelStandings standings={standings} />
                )}
            </div>
        </div>
    );
};

const LeaguesPage = () => {
    return (
        <Suspense fallback={<div className={styles.container}>Loading...</div>}>
            <LeaguesContent />
        </Suspense>
    );
};

export default LeaguesPage;
