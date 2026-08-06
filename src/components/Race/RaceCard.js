"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./RaceCard.module.css";
import { calculateFieldOdds } from "@/utils/oddsFactory";
import { useBetting } from "@/context/BettingContext";
import { useToast } from "@/components/Toast/ToastContext";
import ResultsModal from "./ResultsModal";
import SpecialsView from "./SpecialsView";
import OverUnderView from "./OverUnderView";
import RaceRecap from "./RaceRecap";

const RaceCard = ({ race }) => {
    const {
        name,
        track,
        time,
        drivers,
        flagStatus,
        lapsRemaining,
        totalLaps,
    } = race;
    const { addToBetSlip, placedBets } = useBetting();
    const toast = useToast();
    const [sortMethod, setSortMethod] = useState("position");
    const [viewMode, setViewMode] = useState("drivers"); // 'drivers', 'specials', or 'overunder'
    const [showResults, setShowResults] = useState(false);

    // ---- LIVE FEEL: track position changes between polls (▲ / ▼ badges) ----
    const prevPositionsRef = useRef({});
    const [recentMoves, setRecentMoves] = useState({}); // { driverId: +2 | -1 }

    useEffect(() => {
        if (!drivers || drivers.length === 0) return;
        const prev = prevPositionsRef.current;
        const moves = {};
        const next = {};
        drivers.forEach(d => {
            next[d.id] = d.currentPosition;
            if (prev[d.id] !== undefined && d.currentPosition && prev[d.id] !== d.currentPosition) {
                moves[d.id] = prev[d.id] - d.currentPosition; // + = gained places
            }
        });
        prevPositionsRef.current = next;
        if (Object.keys(moves).length > 0) {
            setRecentMoves(m => ({ ...m, ...moves }));
            const ids = Object.keys(moves);
            const timer = setTimeout(() => {
                setRecentMoves(m => {
                    const copy = { ...m };
                    ids.forEach(id => delete copy[id]);
                    return copy;
                });
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, [drivers]);

    // Determine if the race is finished
    const isFinished =
        flagStatus === "Checkered" ||
        (lapsRemaining !== undefined && lapsRemaining <= 0);

    // Build race state for live odds calculation
    const raceState =
        lapsRemaining !== undefined && totalLaps !== undefined
            ? { lapsRemaining, totalLaps, track }
            : null;

    // Calculate odds for all drivers (live updates while race is in progress)
    const driversWithOdds = calculateFieldOdds(drivers, raceState);

    // ---- LIVE FEEL: flash odds that moved since the last update ----
    const prevOddsRef = useRef({});
    const [oddsFlash, setOddsFlash] = useState({}); // { driverId: { win:'up'|'down', ... } }

    useEffect(() => {
        const parseOdds = (o) => Number(String(o ?? '').replace('+', '')) || 0;
        const prev = prevOddsRef.current;
        const flashes = {};
        const next = {};
        driversWithOdds.forEach(d => {
            const markets = { win: d.odds?.win, top3: d.odds?.top3, top10: d.odds?.top10, crash: d.odds?.crash };
            next[d.id] = markets;
            if (prev[d.id]) {
                const changed = {};
                Object.keys(markets).forEach(k => {
                    const a = parseOdds(prev[d.id][k]);
                    const b = parseOdds(markets[k]);
                    if (a !== b) changed[k] = b > a ? 'up' : 'down';
                });
                if (Object.keys(changed).length) flashes[d.id] = changed;
            }
        });
        prevOddsRef.current = next;
        if (Object.keys(flashes).length > 0) {
            setOddsFlash(f => ({ ...f, ...flashes }));
            const ids = Object.keys(flashes);
            const timer = setTimeout(() => {
                setOddsFlash(f => {
                    const copy = { ...f };
                    ids.forEach(id => delete copy[id]);
                    return copy;
                });
            }, 2500);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drivers]);

    // ---- COMMUNITY TIER BADGES: 💣/😇 next to drivers in the top 10s ----
    const [tierRanks, setTierRanks] = useState({ terrorists: {}, cleanest: {} });
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/tierlist?include=rankings');
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const toMap = (list) => Object.fromEntries((list || []).map((d, i) => [String(d.key), i + 1]));
                setTierRanks({
                    terrorists: toMap(data.categories?.terrorists),
                    cleanest: toMap(data.categories?.cleanest),
                });
            } catch { /* fail soft */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // ---- LIVE FEEL: highlight drivers the user has pending bets on ----
    // Covers single bets AND parlay legs (a parlay's driver_name is just
    // "3 Legs" — the real drivers are inside bet.details).
    const myBetDrivers = new Set();
    (placedBets || []).forEach(b => {
        if (b.status !== 'pending') return;
        const betMatchesRace = String(b.race_id) === String(race.id);

        if (Array.isArray(b.details)) {
            // Parlay: check each leg (legs carry their own raceId)
            b.details.forEach(leg => {
                const legMatchesRace = leg.raceId
                    ? String(leg.raceId) === String(race.id)
                    : (betMatchesRace || b.race_id === 'multi');
                if (legMatchesRace && leg.driver) {
                    myBetDrivers.add(String(leg.driver).toLowerCase().trim());
                }
            });
        } else if (betMatchesRace && b.driver_name) {
            // Single bet
            myBetDrivers.add(b.driver_name.toLowerCase().trim());
        }
    });

    // Lap progress (hidden for unlimited/practice sessions)
    const showProgress = totalLaps > 0 && totalLaps < 999 && lapsRemaining !== undefined;
    const lapsDone = showProgress ? Math.max(0, Math.min(totalLaps, totalLaps - lapsRemaining)) : 0;
    const progressPct = showProgress ? Math.round((lapsDone / totalLaps) * 100) : 0;

    // Flag banner style variant
    const flagVariant =
        flagStatus === "Yellow" ? styles.bannerYellow :
            flagStatus === "Red Flag" ? styles.bannerRed :
                flagStatus === "Checkered" ? styles.bannerCheckered :
                    flagStatus === "White Flag" ? styles.bannerWhite :
                        styles.bannerGreen;

    const flagText =
        flagStatus === "Yellow" ? "🟡 CAUTION" :
            flagStatus === "Red Flag" ? "🔴 RED FLAG" :
                flagStatus === "Checkered" ? "🏁 CHECKERED FLAG" :
                    flagStatus === "White Flag" ? "⚪ WHITE FLAG — FINAL LAP" :
                        "🟢 GREEN FLAG";

    // Sort drivers based on selected method
    const sortedDrivers = [...driversWithOdds].sort((a, b) => {
        if (sortMethod === "position") return a.currentPosition - b.currentPosition;
        if (sortMethod === "start") return a.startingPosition - b.startingPosition;
        if (sortMethod === "irating") return b.iRating - a.iRating;
        return 0;
    });

    // Add a bet to the slip – blocked if race is finished
    const handleBet = (driver, type, odds) => {
        if (isFinished) {
            toast.info("Race has finished – betting is closed.");
            return;
        }
        addToBetSlip({
            driver: driver.name,
            type,
            odds,
            raceName: name,
            raceId: race.id,
        });
    };

    // Determine flag colour for the badge
    const getFlagColor = (flag) => {
        switch (flag) {
            case "Green":
                return "#00ff00";
            case "Yellow":
                return "#ffff00";
            case "White Flag":
                return "#ffffff";
            case "Checkered":
                return "#888888";
            case "Red Flag":
                return "#ff0000";
            default:
                return "#00ff00";
        }
    };

    return (
        <div className={styles.card}>
            {/* Full-width live flag banner */}
            <div className={`${styles.flagBanner} ${flagVariant}`}>
                <span className={styles.flagBannerText}>{flagText}</span>
                {showProgress && !isFinished && (
                    <span className={styles.flagBannerLaps}>
                        Lap {lapsDone}/{totalLaps} • {lapsRemaining} to go
                    </span>
                )}
            </div>

            {/* Lap progress bar */}
            {showProgress && (
                <div className={styles.progressTrack} title={`${progressPct}% complete`}>
                    <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.raceInfo}>
                    <h2 className={styles.raceName}>{name}</h2>
                    <p className={styles.trackInfo}>
                        {track} • {time}
                    </p>
                </div>
                <div className={styles.badges}>
                    {flagStatus && (
                        <div
                            className={styles.flagBadge}
                            style={{
                                backgroundColor: getFlagColor(flagStatus),
                                color:
                                    flagStatus === "Yellow" || flagStatus === "White Flag"
                                        ? "#000"
                                        : "#fff",
                            }}
                        >
                            {flagStatus}
                        </div>
                    )}
                    <div className={styles.liveBadge}>LIVE</div>
                </div>
            </div>

            <div className={styles.sortControls}>
                {viewMode === 'drivers' && (
                    <>
                        <span className={styles.sortLabel}>Sort by:</span>
                        <button
                            className={`${styles.sortBtn} ${sortMethod === "position" ? styles.activeSort : ""
                                }`}
                            onClick={() => setSortMethod("position")}
                        >
                            Live Pos
                        </button>
                        <button
                            className={`${styles.sortBtn} ${sortMethod === "start" ? styles.activeSort : ""
                                }`}
                            onClick={() => setSortMethod("start")}
                        >
                            Start
                        </button>
                        <button
                            className={`${styles.sortBtn} ${sortMethod === "irating" ? styles.activeSort : ""
                                }`}
                            onClick={() => setSortMethod("irating")}
                        >
                            iRating
                        </button>
                    </>
                )}

                <button
                    className={`${styles.specialsBtn} ${viewMode === 'specials' ? styles.specialsActive : ''}`}
                    onClick={() => setViewMode(viewMode === 'specials' ? 'drivers' : 'specials')}
                    style={{ marginLeft: viewMode === 'drivers' ? '1rem' : '0' }}
                >
                    🎲 {viewMode === 'specials' ? '← Back' : 'Specials'}
                </button>

                <button
                    className={`${styles.specialsBtn} ${viewMode === 'overunder' ? styles.specialsActive : ''}`}
                    onClick={() => setViewMode(viewMode === 'overunder' ? 'drivers' : 'overunder')}
                    style={{ marginLeft: '0.5rem' }}
                >
                    📊 {viewMode === 'overunder' ? '← Back' : 'Over/Under'}
                </button>

                <a
                    href={`/multiplayer?raceId=${race.id}`}
                    className={styles.fantasyBtn}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: '0.5rem' }}
                >
                    🏆 Fantasy
                </a>
            </div>

            {viewMode === 'drivers' ? (
                <>
                    <div className={styles.tableHeader}>
                        <div className={styles.colDriver}>Driver</div>
                        <div className={styles.colOdds}>Win</div>
                        <div className={styles.colOdds}>Top 3</div>
                        <div className={styles.colOdds}>Top 10</div>
                        <div className={styles.colOdds}>Crash</div>
                    </div>

                    <div className={styles.driverList}>
                        {sortedDrivers.map((driver) => {
                            const odds = driver.odds;
                            const isMyBet = myBetDrivers.has((driver.name || '').toLowerCase().trim());
                            const move = recentMoves[driver.id];
                            const flash = oddsFlash[driver.id] || {};
                            const terroristRank = tierRanks.terrorists[String(driver.userID)];
                            const cleanRank = tierRanks.cleanest[String(driver.userID)];
                            return (
                                <div key={driver.id} className={`${styles.driverRow} ${driver.isDNF ? styles.crashed : ''} ${isMyBet ? styles.myBet : ''}`}>
                                    <div className={styles.colDriver}>
                                        <span className={styles.number}>#{driver.number}</span>
                                        <div className={styles.driverDetails}>
                                            {(() => {
                                                const starts = driver.stats?.starts || 0;
                                                const winPct = driver.stats?.winPercentage || 0;
                                                const top25 = driver.stats?.top25Percent || 0;

                                                let tooltipText = "❓ No Data Available";
                                                if (starts > 0) {
                                                    const isProfitable = winPct > 5 || top25 > 50;
                                                    tooltipText = isProfitable
                                                        ? "💰 Usually Profitable for Users"
                                                        : "📉 Usually Sells User's Parlays";
                                                }

                                                return (
                                                    <span
                                                        className={styles.driverName}
                                                        title={tooltipText}
                                                        style={{ cursor: 'help', textDecoration: 'underline dotted var(--text-muted)' }}
                                                    >
                                                        {driver.name}
                                                        {isMyBet && <span className={styles.myBetChip} title="You have a pending bet on this driver">💰 Your bet</span>}
                                                        {terroristRank && (
                                                            <span className={styles.tierBadgeDirty} title={`Community Top 10 Biggest Terrorists — ranked #${terroristRank}`}>
                                                                💣 #{terroristRank}
                                                            </span>
                                                        )}
                                                        {cleanRank && (
                                                            <span className={styles.tierBadgeClean} title={`Community Top 10 Cleanest Racers — ranked #${cleanRank}`}>
                                                                😇 #{cleanRank}
                                                            </span>
                                                        )}
                                                        {driver.isDNF && <span className={styles.retiredBadge}>RETIRED</span>}
                                                        {move !== undefined && !driver.isDNF && (
                                                            <span className={`${styles.moveBadge} ${move > 0 ? styles.moveUp : styles.moveDown}`}>
                                                                {move > 0 ? `▲${move}` : `▼${Math.abs(move)}`}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })()}
                                            <span className={styles.driverStats}>
                                                iR: {driver.iRating} • {driver.licenseClass} • Started P{driver.startingPosition}
                                                {driver.stats && (
                                                    <>
                                                        <br />
                                                        <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                                            Win: {driver.stats.winPercentage?.toFixed(1)}% • Avg Inc: {driver.stats.avgIncidents?.toFixed(2)}
                                                            {driver.lapsLed > 0 && ` • Laps Led: ${driver.lapsLed}`}
                                                        </span>
                                                    </>
                                                )}
                                                {driver.currentIncidents > 0 && ` • ${driver.currentIncidents}x`}
                                                {totalLaps > 0 && ` • Lap ${driver.lapsComplete}/${totalLaps}`}
                                            </span>
                                            {driver.currentPosition > 0 && !driver.isDNF && (
                                                <span
                                                    className={styles.currentPosition}
                                                    style={{
                                                        color:
                                                            driver.currentPosition < driver.startingPosition
                                                                ? "#4ade80"
                                                                : driver.currentPosition > driver.startingPosition
                                                                    ? "#f87171"
                                                                    : "var(--text-muted)",
                                                    }}
                                                >
                                                    Currently Running P{driver.currentPosition}
                                                    {driver.currentPosition < driver.startingPosition &&
                                                        ` ↑${driver.startingPosition - driver.currentPosition}`}
                                                    {driver.currentPosition > driver.startingPosition &&
                                                        ` ↓${driver.currentPosition - driver.startingPosition}`}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bet buttons – disabled when race is finished OR driver has crashed.
                                        flashUp/flashDown animate when the odds moved since last update. */}
                                    <button
                                        className={`${styles.betButton} ${flash.win === 'up' ? styles.flashUp : flash.win === 'down' ? styles.flashDown : ''}`}
                                        data-market="WIN"
                                        onClick={() => handleBet(driver, "Win", odds.win)}
                                        disabled={isFinished || driver.isDNF}
                                    >
                                        <span className={styles.oddsValue}>{odds.win}</span>
                                    </button>

                                    <button
                                        className={`${styles.betButton} ${flash.top3 === 'up' ? styles.flashUp : flash.top3 === 'down' ? styles.flashDown : ''}`}
                                        data-market="TOP 3"
                                        onClick={() => handleBet(driver, "Top 3", odds.top3)}
                                        disabled={isFinished || driver.isDNF}
                                    >
                                        <span className={styles.oddsValue}>{odds.top3}</span>
                                    </button>

                                    <button
                                        className={`${styles.betButton} ${flash.top10 === 'up' ? styles.flashUp : flash.top10 === 'down' ? styles.flashDown : ''}`}
                                        data-market="TOP 10"
                                        onClick={() => handleBet(driver, "Top 10", odds.top10)}
                                        disabled={isFinished || driver.isDNF}
                                    >
                                        <span className={styles.oddsValue}>{odds.top10}</span>
                                    </button>

                                    <button
                                        className={`${styles.betButton} ${styles.crashButton} ${flash.crash === 'up' ? styles.flashUp : flash.crash === 'down' ? styles.flashDown : ''}`}
                                        data-market="CRASH"
                                        onClick={() => handleBet(driver, "Crash", odds.crash)}
                                        disabled={isFinished || driver.isDNF}
                                    >
                                        <span className={styles.oddsValue}>{odds.crash}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : viewMode === 'specials' ? (
                <SpecialsView race={race} isFinished={isFinished} />
            ) : (
                <OverUnderView race={race} isFinished={isFinished} />
            )}

            {/* Post-Race Recap (podium + your bet results) */}
            {isFinished && (
                <RaceRecap race={race} onViewResults={() => setShowResults(true)} />
            )}

            {/* Results Modal */}
            {showResults && (
                <ResultsModal
                    race={race}
                    onClose={() => setShowResults(false)}
                />
            )}
        </div>
    );
};

export default RaceCard;
