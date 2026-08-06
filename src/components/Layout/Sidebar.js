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

    const seriesMapping = {
        58: 'NASCAR A Open Series',
        62: 'NASCAR B Open Series',
        103: 'B Fixed Series',
        164: 'NASCAR C Fixed',
        167: 'Arca Series Fixed',
        191: 'NASCAR A Fixed',
    };

    useEffect(() => {
        const fetchRaceInfo = async () => {
            try {
                // No cache-buster: identical URLs let the CDN serve this from cache
                // (a unique ?t= param forced a full origin download on every poll)
                const url = selectedRaceId
                    ? `/api/race-data?raceId=${selectedRaceId}`
                    : `/api/race-data`;
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
        // Sidebar info changes rarely (track/series/session name): 30s is plenty,
        // and we skip polls while the tab is hidden
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchRaceInfo();
        }, 30000);
        const racesInterval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchRaces();
        }, 30000);
        return () => {
            clearInterval(interval);
            clearInterval(racesInterval);
        };
    }, [selectedRaceId]);

    return (
        <>
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
                                className={`${styles.raceItem} ${String(selectedRaceId) === String(race.id) ? styles.activeRace : ''}`}
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

                <div className={styles.broadcastHelp}>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Broadcast Your Race:</small>
                    <a
                        href="https://github.com/jsolis75/iracing-betting-platform/releases/download/broadcaster-latest/iRacingBroadcaster.exe"
                        download="iRacingBroadcaster.exe"
                        style={{
                            display: 'block',
                            background: '#2563eb',
                            color: 'white',
                            padding: '8px',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            textAlign: 'center',
                            textDecoration: 'none',
                            fontWeight: 'bold'
                        }}
                    >
                        Download Broadcaster
                    </a>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontSize: '0.7rem' }}>
                        No installation needed!
                    </small>
                </div>
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
                        <div className={styles.userBalance}>${(user.balance ?? 0).toFixed(2)}</div>
                    </div>
                </div>
            )}
        </aside>

        {/* Mobile bottom navigation (hidden on desktop via CSS) */}
        <nav className="mobileNav">
            <Link href="/" className={`mobileNavItem ${pathname === '/' ? 'mobileNavActive' : ''}`}>
                <span className="navIcon">🏁</span>
                Live
            </Link>
            <Link href="/multiplayer" className={`mobileNavItem ${pathname === '/multiplayer' ? 'mobileNavActive' : ''}`}>
                <span className="navIcon">🏆</span>
                Fantasy
            </Link>
            <Link href="/leaderboard" className={`mobileNavItem ${pathname === '/leaderboard' ? 'mobileNavActive' : ''}`}>
                <span className="navIcon">📊</span>
                Ranks
            </Link>
            <Link href="/profile" className={`mobileNavItem ${pathname === '/profile' ? 'mobileNavActive' : ''}`}>
                <span className="navIcon">👤</span>
                Profile
            </Link>
        </nav>
        </>
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
