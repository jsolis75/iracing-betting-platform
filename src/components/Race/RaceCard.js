"use client";

import React, { useState } from "react";
import styles from "./RaceCard.module.css";
import { calculateFieldOdds } from "@/utils/oddsFactory";
import { useBetting } from "@/context/BettingContext";
import ResultsModal from "./ResultsModal";

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
    const { addToBetSlip } = useBetting();
    const [sortMethod, setSortMethod] = useState("position");
    const [showResults, setShowResults] = useState(false);

    // Determine if the race is finished
    const isFinished =
        flagStatus === "Checkered" ||
        (lapsRemaining !== undefined && lapsRemaining <= 0);

    // Build race state for live odds calculation
    const raceState =
        lapsRemaining !== undefined && totalLaps !== undefined
            ? { lapsRemaining, totalLaps }
            : null;

    // Calculate odds for all drivers (live updates while race is in progress)
    const driversWithOdds = calculateFieldOdds(drivers, raceState);

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
            alert("Race has finished – betting is closed.");
            return;
        }
        addToBetSlip({
            driver: driver.name,
            type,
            odds,
            raceName: name,
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
            </div>

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
                    return (
                        <div key={driver.id} className={`${styles.driverRow} ${driver.isDNF ? styles.crashed : ''}`}>
                            <div className={styles.colDriver}>
                                <span className={styles.number}>#{driver.number}</span>
                                <div className={styles.driverDetails}>
                                    <span className={styles.driverName}>
                                        {driver.name}
                                        {driver.isDNF && <span className={styles.retiredBadge}>RETIRED</span>}
                                    </span>
                                    <span className={styles.driverStats}>
                                        iR: {driver.iRating} • {driver.licenseClass} • Started P{driver.startingPosition}
                                        {driver.stats && (
                                            <>
                                                <br />
                                                <span style={{ fontSize: '0.85em', color: '#aaa' }}>
                                                    Win: {driver.stats.winPercentage?.toFixed(1)}% • Avg Inc: {driver.stats.avgIncidents?.toFixed(2)}
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
                                                            : "#94a3b8",
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

                            {/* Bet buttons – disabled when race is finished OR driver has crashed */}
                            <button
                                className={styles.betButton}
                                onClick={() => handleBet(driver, "Win", odds.win)}
                                disabled={isFinished || driver.isDNF}
                            >
                                <span className={styles.oddsValue}>{odds.win}</span>
                            </button>

                            <button
                                className={styles.betButton}
                                onClick={() => handleBet(driver, "Top 3", odds.top3)}
                                disabled={isFinished || driver.isDNF}
                            >
                                <span className={styles.oddsValue}>{odds.top3}</span>
                            </button>

                            <button
                                className={styles.betButton}
                                onClick={() => handleBet(driver, "Top 10", odds.top10)}
                                disabled={isFinished || driver.isDNF}
                            >
                                <span className={styles.oddsValue}>{odds.top10}</span>
                            </button>

                            <button
                                className={`${styles.betButton} ${styles.crashButton}`}
                                onClick={() => handleBet(driver, "Crash", odds.crash)}
                                disabled={isFinished || driver.isDNF}
                            >
                                <span className={styles.oddsValue}>{odds.crash}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Post-Race Banner */}
            {isFinished && (
                <div className={styles.postRaceBanner}>
                    <div className={styles.bannerContent}>
                        <div className={styles.bannerText}>
                            <h3>🏁 Race Finished</h3>
                            <p>Waiting for next race...</p>
                        </div>
                        <button
                            className={styles.resultsButton}
                            onClick={() => setShowResults(true)}
                        >
                            View Results
                        </button>
                    </div>
                </div>
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
