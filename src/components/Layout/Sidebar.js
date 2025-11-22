'use client';

import React, { useState, useEffect, Suspense } from 'react';
import styles from './Sidebar.module.css';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { useUser } from '@/context/UserContext';

function SidebarContent() {
    const [raceInfo, setRaceInfo] = useState(null);
    const { user } = useUser();
    const [races, setRaces] = useState([]);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const selectedRaceId = searchParams.get('raceId');
    const [telemetryStatus, setTelemetryStatus] = useState('stopped');

    const seriesMapping = {
        58: 'NASCAR A Open',
        103: 'B Fixed Series',
        164: 'NASCAR C Fixed',
        191: 'NASCAR A Fixed',
    };

    useEffect(() => {
        const fetchRaceInfo = async () => {
            try {
                const url = selectedRaceId
                    ? `/api/race-data?raceId=${selectedRaceId}&t=${Date.now()}`
                    : `/api/race-data?t=${Date.now()}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch sidebar data: ${response.status}`);
                const data = await response.json();
                if (data && data.WeekendInfo) {
                    setRaceInfo({
                        track: data.WeekendInfo.TrackDisplayName,
                        seriesId: data.WeekendInfo.SeriesID,
                        session: data.SessionInfo?.Sessions?.find(s => s.SessionType === 'Race')?.SessionName || 'Practice'
                    });
                }
            } catch (error) {
                console.error('Error fetching sidebar info:', error);
            }
        };

        const fetchRaces = async () => {
            try {
                const response = await fetch('/api/races');
                if (response.ok) {
                    const data = await response.json();
                    setRaces(data.races || []);
                }
            } catch (error) {
                console.error('Error fetching races:', error);
            }
        };

        fetchRaceInfo();
        fetchRaces();
        const interval = setInterval(fetchRaceInfo, 5000);
        const racesInterval = setInterval(fetchRaces, 3000);
        return () => {
            clearInterval(interval);
            clearInterval(racesInterval);
        };
    }, [selectedRaceId]);

    const handleBroadcast = async () => {
        if (telemetryStatus === 'running') return;

        setTelemetryStatus('starting');
        try {
            const res = await fetch('/api/start-telemetry', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setTelemetryStatus('running');
                alert("Telemetry started! Your race data is now being broadcast.");
            } else {
                setTelemetryStatus('stopped');
                alert("Failed to start telemetry: " + data.details);
            }
        } catch (err) {
            console.error(err);
            setTelemetryStatus('stopped');
            alert("Error connecting to server.");
        }
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <span className={styles.logoIcon}>🏎️</span>
                <h1>iRacingBet</h1>
            </div>

            {/* Active Races List */}
            {races.length > 0 && (
                <div className={styles.racesSection}>
                    <h3 className={styles.racesTitle}>Active Races</h3>
                    <div className={styles.racesList}>
                        {races.map((race) => (
                            <Link
                                key={race.id}
                                href={`/?raceId=${race.id}`}
                                className={`${styles.raceItem} ${selectedRaceId === race.id ? styles.activeRace : ''}`}
                            >
                                <span className={styles.raceSource}>
                                    {race.source === 'broadcast' ? '📡' : '🏁'}
                                </span>
                                <div className={styles.raceDetails}>
                                    <div className={styles.raceName}>{race.name}</div>
                                    <div className={styles.raceTrack}>{race.track}</div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <nav className={styles.nav}>
                <Link href="/" className={`${styles.navItem} ${pathname === '/' ? styles.active : ''}`}>
                    Live Races
                </Link>
                <Link href="/profile" className={`${styles.navItem} ${pathname === '/profile' ? styles.active : ''}`}>
                    My Profile
                </Link>
                <Link href="/leaderboard" className={`${styles.navItem} ${pathname === '/leaderboard' ? styles.active : ''}`}>
                    Leaderboard
                </Link>

                <div className={styles.divider}></div>

                <button
                    className={`${styles.navItem} ${styles.broadcastBtn} ${telemetryStatus === 'running' ? styles.broadcastBtnActive : ''}`}
                    onClick={handleBroadcast}
                >
                    {telemetryStatus === 'running' ? '📡 Broadcasting' : '📡 Broadcast Race'}
                </button>
            </nav>

            {raceInfo && (
                <div className={styles.raceInfo}>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Track:</span>
                        <span className={styles.infoValue}>{raceInfo.track}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Series:</span>
                        <span className={styles.infoValue}>{seriesMapping[raceInfo.seriesId] || `Series ${raceInfo.seriesId}`}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Session:</span>
                        <span className={styles.infoValue}>{raceInfo.session}</span>
                    </div>
                </div>
            )}

            {user && (
                <div className={styles.userInfo}>
                    <div className={styles.userAvatar}>
                        {user.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className={styles.userDetails}>
                        <div className={styles.userName}>{user.username || 'Guest'}</div>
                        <div className={styles.userBalance}>${Number(user.balance).toFixed(2) || '0.00'}</div>
                    </div>
                </div>
            )}
        </aside>
    );
}

const Sidebar = () => {
    return (
        <Suspense fallback={<div style={{ padding: '1rem' }}>Loading...</div>}>
            <SidebarContent />
        </Suspense>
    );
};

export default Sidebar;
