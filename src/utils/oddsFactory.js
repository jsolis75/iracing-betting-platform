/**
 * Odds Factory
 * TWO MODELS:
 * 1. PRE-RACE MODEL: Simple iRating-only odds for qualifying and before race starts
 * 2. SOPHISTICATED MODEL: Advanced odds using position, stats, and live race data
 * 
 * Switches from pre-race to sophisticated after leader completes lap 1
 */

/**
 * PRE-RACE MODEL: Simple iRating-based odds for qualifying and pre-race
 * Uses ONLY iRating to calculate odds - no position, no stats
 */
const calculatePreRaceOdds = (drivers) => {
    if (!drivers || drivers.length === 0) return [];

    // Calculate field average iRating to detect outliers
    const avgIRating = drivers.reduce((sum, d) => sum + (d.iRating || 1500), 0) / drivers.length;

    // Calculate win probability based ONLY on iRating
    const driversWithProb = drivers.map(driver => {
        const iRating = Math.max(driver.iRating || 1500, 1000);

        // Simple exponential scaling based on iRating
        let iRatingFactor;
        if (iRating >= 6000) iRatingFactor = Math.pow(iRating / 1000, 4.5); // Very steep for top drivers
        else if (iRating >= 4000) iRatingFactor = Math.pow(iRating / 1000, 3.5);
        else iRatingFactor = Math.pow(iRating / 1000, 2.5);

        // OUTLIER BONUS: If driver is significantly better than field, boost them
        const iRatingDiff = iRating - avgIRating;
        let outlierBonus = 1.0;
        if (iRatingDiff > 1500) {
            // 1500+ above average: MASSIVE boost (e.g., 7k iR in 4.5k iR field)
            outlierBonus = 4.0; // Was 2.5, increased for more favoritism
        } else if (iRatingDiff > 1000) {
            // 1000-1500 above average: Large boost
            outlierBonus = 3.0; // Was 2.0
        } else if (iRatingDiff > 500) {
            // 500-1000 above average: Medium boost
            outlierBonus = 2.0; // Was 1.5
        }

        return { ...driver, winProbability: iRatingFactor * outlierBonus };
    });

    // Normalize probabilities
    const totalProb = driversWithProb.reduce((sum, d) => sum + d.winProbability, 0);
    const HOUSE_EDGE = 1.40; // Slightly less aggressive for pre-race

    const normalized = driversWithProb.map(d => ({
        ...d,
        winProbability: (d.winProbability / totalProb) * HOUSE_EDGE
    }));

    return normalized.map(driver => {
        const odds = calculateOdds(driver, normalized);
        return { ...driver, odds };
    });
};

/**
 * SOPHISTICATED MODEL: Advanced odds calculation
 * Calculate odds for all drivers in a race field
 * @param {Array} drivers - Array of driver objects with iRating, startingPosition, currentPosition, etc.
 * @param {Object} raceState - Optional race state (lapsRemaining, totalLaps, etc.)
 * @returns {Array} - Array of drivers with calculated odds
 */
const calculateSophisticatedOdds = (drivers, raceState = null) => {
    if (!drivers || drivers.length === 0) return [];

    // Determine if we should use live odds (race in progress)
    const useLiveOdds = raceState && raceState.lapsRemaining !== undefined && raceState.totalLaps !== undefined;

    // Calculate race progress (0 = start, 1 = finish)
    let raceProgress = 0;
    if (useLiveOdds && raceState.totalLaps !== "∞") {
        const lapsCompleted = parseInt(raceState.totalLaps) - raceState.lapsRemaining;
        raceProgress = Math.max(0, Math.min(1, lapsCompleted / parseInt(raceState.totalLaps)));
    }

    // Calculate win probability for each driver
    const driversWithProb = drivers.map(driver => {
        const iRating = Math.max(driver.iRating || 1500, 1000);
        const startPos = driver.startingPosition || 99;
        const currentPos = driver.currentPosition || startPos;
        const fieldSize = drivers.length;
        const stats = driver.Stats || { starts: 0, wins: 0, avgPoints: 0, avgIncidents: 0, avgFinish: 0, top25Percent: 0, winPercentage: 0 };

        // --- 1. iRating Component (Skill) --- STEEPENED FOR AGGRESSIVE FAVORITES
        let iRatingFactor;
        if (iRating >= 6000) iRatingFactor = Math.pow(iRating / 1000, 4.0);
        else if (iRating >= 4000) iRatingFactor = Math.pow(iRating / 1000, 3.0);
        else iRatingFactor = Math.pow(iRating / 1000, 2.0);

        // OUTLIER BONUS: Detect and boost drivers significantly better than field
        const avgIRating = drivers.reduce((sum, d) => sum + (d.iRating || 1500), 0) / drivers.length;
        const iRatingDiff = iRating - avgIRating;
        let outlierBonus = 1.0;
        if (iRatingDiff > 1500) {
            // 1500+ above average: MASSIVE boost (e.g., 7k iR in 4.5k iR field)
            outlierBonus = 3.5; // Was 2.2, increased significantly
        } else if (iRatingDiff > 1000) {
            // 1000-1500 above average: Large boost
            outlierBonus = 2.5; // Was 1.8
        } else if (iRatingDiff > 500) {
            // 500-1000 above average: Medium boost
            outlierBonus = 1.8; // Was 1.4
        }

        iRatingFactor = iRatingFactor * outlierBonus;

        // --- 2. Historical Performance Component ---
        const winPctFactor = Math.pow((stats.winPercentage || 0) / 10, 1.3);
        const avgPointsFactor = Math.pow((stats.avgPoints || 50) / 50, 1.6);
        const historicalFactor = (winPctFactor * 0.6) + (avgPointsFactor * 0.4);

        // --- QUALIFYING PERFORMANCE FACTOR (for lower-rated drivers) ---
        let qualifyingBonus = 1.0;
        let qualifyingAdditiveBoost = 0;

        if (iRating < 4000) {
            const avgIRating = drivers.reduce((sum, d) => sum + (d.iRating || 1500), 0) / drivers.length;
            const iRatingPercentile = (iRating - 1000) / (avgIRating - 1000);
            const expectedPosition = fieldSize * (1 - Math.pow(iRatingPercentile, 1.5));
            const actualPosition = startPos;

            // SPECIAL HANDLING FOR POLE/FRONT ROW (P1-P3)
            if (actualPosition <= 3) {
                if (actualPosition === 1) qualifyingAdditiveBoost = 0.25;
                else if (actualPosition === 2) qualifyingAdditiveBoost = 0.18;
                else if (actualPosition === 3) qualifyingAdditiveBoost = 0.12;
            }

            const qualDelta = actualPosition - expectedPosition;

            if (qualDelta < 0) {
                const spotsAhead = Math.abs(qualDelta);
                qualifyingBonus = 1.0 + (spotsAhead * 0.50);
            } else if (qualDelta > 5) {
                const spotsBehind = qualDelta - 5;
                qualifyingBonus = 1.0 / (1.0 + (spotsBehind * 0.20));
            }

            qualifyingBonus = Math.max(0.2, Math.min(5.0, qualifyingBonus));
        }

        // --- PRO/BLACK LICENSE BOOST ---
        const licString = driver.licenseClass || driver.LicString || '';
        const isPro = licString.includes('P') || licString.includes('Pro');
        const licLevel = driver.LicSubLevel ? Math.floor(driver.LicSubLevel / 100) : 0;
        const isBlack = licLevel >= 6;
        const proBoost = (isPro || isBlack) ? 1.35 : 1.0;

        // --- 3. Position Component ---
        const startingPositionFactor = Math.pow((fieldSize - startPos + 1) / fieldSize, 2.0);

        // --- 4. Final Probability Calculation ---
        let winProbability;
        if (useLiveOdds && raceProgress > 0) {
            // LIVE ODDS: NASCAR-STYLE
            const cappedIRating = Math.min(iRating, 7000);
            const liveIRatingFactor = Math.pow(cappedIRating / 5000, 0.7);

            const iRatingWeight = 0.15 * Math.pow(1 - raceProgress, 2.5);
            const historicalWeight = 0.10 * Math.pow(1 - raceProgress, 2.0);
            const positionWeight = 1 - (iRatingWeight + historicalWeight);

            const dynamicExponent = 2.8 + (raceProgress * 15);
            const dynamicPositionFactor = Math.pow((fieldSize - currentPos + 1) / fieldSize, dynamicExponent);

            let gapPenalty = 1.0;
            if (raceProgress > 0.5 && currentPos > 15) {
                const gap = currentPos - 15;
                gapPenalty = Math.pow(0.85, gap);
            }

            // POSITION DIFFERENTIAL BONUS: Drivers who've passed many cars are clearly fast
            let positionDifferentialBonus = 1.0;
            const positionsGained = startPos - currentPos; // Positive = gained positions
            if (positionsGained > 3) {
                // Give bonus for making up positions (shows current race speed)
                positionDifferentialBonus = 1.0 + (positionsGained * 0.08); // 8% per position gained
            }

            winProbability =
                (liveIRatingFactor * iRatingWeight) +
                (historicalFactor * historicalWeight) +
                (dynamicPositionFactor * positionWeight * gapPenalty);

            // Apply position differential bonus
            winProbability = winProbability * positionDifferentialBonus;
        } else {
            // PRE-RACE ODDS
            // Base calculation with INCREASED iRating weight (helps good drivers starting deep)
            winProbability =
                (iRatingFactor * 0.40) +  // Was 0.30 - higher weight helps talented drivers in back
                (historicalFactor * 0.40) +
                (startingPositionFactor * 0.20); // Was 0.30 - reduced generic position impact

            // FRONT RUNNER BONUS: Top 1/3 of field gets massive boost (makes them favorites)
            const frontRunnerThreshold = Math.ceil(fieldSize / 3); // Top third
            if (startPos <= frontRunnerThreshold) {
                // Graduated bonus: P1 gets biggest boost, decreases as you go back
                const frontRunnerBonus = 1.0 + ((frontRunnerThreshold - startPos + 1) / frontRunnerThreshold) * 0.8;
                winProbability = winProbability * frontRunnerBonus;
            }

            // Apply qualifying bonus (for lower-rated drivers who qualified well)
            winProbability = winProbability * qualifyingBonus;
            winProbability = winProbability + qualifyingAdditiveBoost;
        }

        // Apply Pro/Black license boost
        winProbability = winProbability * proBoost;

        // WIN ODDS PENALTY FOR P4+: Anything can happen in racing, reduce win odds for non-podium runners
        if (currentPos > 3) {
            // Progressive penalty: P4 gets small penalty, P15+ gets massive penalty
            const positionPenalty = Math.pow(0.92, currentPos - 3); // 8% reduction per position after P3
            winProbability = winProbability * positionPenalty;
        }

        // LEADER FAVORITISM: Ensure P1 is always a heavy favorite regardless of iRating
        if (currentPos === 1 && useLiveOdds && raceProgress > 0.1) {
            // Give leader a massive boost (they're controlling the race)
            const leaderBoost = 1.5 + (raceProgress * 0.8); // 1.5x early, up to 2.3x late
            winProbability = Math.min(winProbability * leaderBoost, 0.85); // Cap at 85% to avoid -10000 odds
        }

        return { ...driver, winProbability, iRatingFactor, historicalFactor, raceProgress, qualifyingBonus };
    });

    // Normalize probabilities to sum to 1.0
    const totalProb = driversWithProb.reduce((sum, d) => sum + d.winProbability, 0);

    const HOUSE_EDGE = 1.45; // Increased from 1.30 to drastically lower payouts

    const driversWithNormalizedProb = driversWithProb.map(d => ({
        ...d,
        winProbability: (d.winProbability / totalProb) * HOUSE_EDGE
    }));

    return driversWithNormalizedProb.map(driver => {
        const odds = calculateOdds(driver, driversWithNormalizedProb);
        return { ...driver, odds };
    });
};

/**
 * MAIN EXPORT: Determines which model to use
 * Uses PRE-RACE model during qualifying and before lap 1 completion
 * Switches to SOPHISTICATED model after leader completes lap 1
 */
export const calculateFieldOdds = (drivers, raceState = null) => {
    if (!drivers || drivers.length === 0) return [];

    // Check if race has started and leader has completed at least 1 lap
    const raceStarted = raceState && raceState.lapsRemaining !== undefined;
    const leaderCompletedLap1 = raceStarted && raceState.totalLaps !== "∞" &&
        (parseInt(raceState.totalLaps) - raceState.lapsRemaining) >= 1;

    // Use PRE-RACE model if race hasn't started or leader hasn't completed lap 1
    if (!leaderCompletedLap1) {
        console.log('Using PRE-RACE MODEL (iRating-only)');
        return calculatePreRaceOdds(drivers);
    }

    // Use SOPHISTICATED model after lap 1
    console.log('Using SOPHISTICATED MODEL (position + stats + iRating)');
    return calculateSophisticatedOdds(drivers, raceState);
};

export const calculateOdds = (driver, allDrivers = [driver]) => {
    const { winProbability } = driver;
    const stats = driver.Stats || { starts: 0, wins: 0, avgPoints: 0, avgIncidents: 0, avgFinish: 0, top25Percent: 0, winPercentage: 0 };

    const probToOdds = (p) => {
        const prob = Math.min(p, 0.99);
        if (prob >= 0.5) return Math.round(-100 / (1 - prob));
        return Math.round(100 * ((1 / prob) - 1));
    };

    // Win Odds
    let winOdds = probToOdds(winProbability);
    winOdds = Math.max(-10000, Math.min(10000, winOdds));
    if (Math.abs(winOdds) < 200) winOdds = Math.round(winOdds / 5) * 5;
    else winOdds = Math.round(winOdds / 10) * 10;
    const winOddsStr = winOdds > 0 ? `+${winOdds}` : `${winOdds}`;

    // Top 3 Odds - LESS GENEROUS + POSITION PENALTY
    const topFinishAbility = (stats.top25Percent || 0) / (stats.starts || 1);
    let top3Prob = Math.min(winProbability * 1.5 + (topFinishAbility * 0.12), 0.92);

    if (driver.qualifyingBonus && driver.qualifyingBonus > 1.0) {
        top3Prob = top3Prob * Math.min(driver.qualifyingBonus, 1.8);
    }

    // POSITION PENALTY for Top 3: If already running P3-P10, reduce odds (they're in position!)
    const currentPos = driver.currentPosition || driver.startingPosition || 99;
    if (currentPos >= 3 && currentPos <= 10) {
        // Running P3-P10 means very likely to finish Top 3 - give them HUGE probability boost (terrible odds)
        const positionPenalty = 1.35 + ((10 - currentPos) * 0.08); // P3 gets 1.91x, P10 gets 1.35x
        top3Prob = Math.min(top3Prob * positionPenalty, 0.97);
    }

    let top3Odds = probToOdds(top3Prob);
    top3Odds = Math.max(-2000, Math.min(1500, top3Odds));
    top3Odds = Math.round(top3Odds / 10) * 10;
    const top3OddsStr = top3Odds > 0 ? `+${top3Odds}` : `${top3Odds}`;

    // Top 10 Odds - PROGRESSIVE: P1-P3 biggest favorites, P10 = bubble (-100 to -200)
    const fieldSize = allDrivers.length;
    let top10Prob = Math.min(winProbability * 3.5 + (topFinishAbility * 0.3), 0.90);

    // LAPS LED FACTOR
    const lapsLed = driver.lapsLed || 0;
    let lapsLedBonus = 1.0;
    if (lapsLed > 0) {
        lapsLedBonus = Math.min(1.0 + (lapsLed * 0.03), 2.0);
    }

    // HIGH IRATING THREAT FACTOR
    const thisDriverIRating = driver.iRating || 1500;
    const highIRThreshold = 5000;
    const raceProgress = driver.raceProgress || 0;

    let threatsFromBehind = 0;
    if (currentPos <= 15) {
        threatsFromBehind = allDrivers.filter(d => {
            const theirPos = d.currentPosition || d.startingPosition || 99;
            const theirIR = d.iRating || 1500;
            return theirPos > currentPos && theirIR > highIRThreshold;
        }).length;
    }

    const threatImpact = threatsFromBehind * (0.08 * (1 - raceProgress));

    // PROGRESSIVE FAVORITISM (adjusted for slightly higher odds on top 10, lower on P11-14)
    if (currentPos <= 3) {
        top10Prob = Math.min(top10Prob * 5.0, 0.92); // Was 0.95, now -1150 to -2000 (slightly higher odds)
    } else if (currentPos <= 6) {
        top10Prob = Math.min(top10Prob * 3.5, 0.87); // Was 0.90, now -650 to -1200
    } else if (currentPos <= 9) {
        top10Prob = Math.min(top10Prob * 2.5, 0.78); // Was 0.82, now -250 to -450
    } else if (currentPos === 10) {
        top10Prob = Math.min(top10Prob * 1.8, 0.64); // Was 0.67, now -80 to -180 (BUBBLE)
    } else if (currentPos <= 12) {
        top10Prob = Math.min(top10Prob * 1.4, 0.60); // Was 1.3/0.55, now -150 to -100 (more favorable)
    } else if (currentPos <= 14) {
        top10Prob = Math.min(top10Prob * 1.3, 0.57); // New tier, now -75 to -130 (more favorable)
    } else if (currentPos <= 15) {
        const fieldSizeMultiplier = fieldSize <= 25 ? 1.2 : 1.1;
        top10Prob = Math.min(top10Prob * fieldSizeMultiplier, 0.48); // +200 to +400
    } else if (currentPos <= 20) {
        top10Prob = Math.min(top10Prob * 1.05, 0.40); // +500 to +700
    } else {
        if (thisDriverIRating > highIRThreshold) {
            top10Prob = Math.min(top10Prob * 1.02, 0.35);
        } else {
            top10Prob = Math.min(top10Prob, 0.30);
        }
    }

    // Apply threat impact and laps led bonus
    top10Prob = Math.max(top10Prob - threatImpact, 0.15);
    top10Prob = Math.min(top10Prob * lapsLedBonus, 0.97);

    let top10Odds = probToOdds(top10Prob);
    top10Odds = Math.max(-3000, Math.min(1200, top10Odds));
    top10Odds = Math.round(top10Odds / 10) * 10;
    const top10OddsStr = top10Odds > 0 ? `+${top10Odds}` : `${top10Odds}`;

    // Crash Odds
    const avgIncidents = stats.avgIncidents || 3.0;
    const licString = driver.LicString || driver.licenseClass || '';
    const licClass = licString.charAt(0).toUpperCase();

    let incidentScore = 0;
    if (avgIncidents <= 2.0) incidentScore = 0.1;
    else if (avgIncidents <= 3.5) incidentScore = 0.3;
    else if (avgIncidents <= 5.0) incidentScore = 0.6;
    else incidentScore = 0.9;

    let licenseScore = 0;
    if (licClass === 'P') licenseScore = 0.0;
    else if (licClass === 'A') licenseScore = 0.2;
    else if (licClass === 'B') licenseScore = 0.4;
    else if (licClass === 'C') licenseScore = 0.7;
    else licenseScore = 1.0;

    const riskScore = (incidentScore * 0.7) + (licenseScore * 0.3);
    const baseCrashProb = 0.08;
    const variableCrashProb = riskScore * 0.60;
    let crashProbability = baseCrashProb + variableCrashProb;
    crashProbability = Math.min(crashProbability * 1.25, 0.85);

    let crashOdds = probToOdds(crashProbability);
    crashOdds = Math.max(-200, Math.min(800, crashOdds));

    if (Math.abs(crashOdds) < 200) crashOdds = Math.round(crashOdds / 5) * 5;
    else crashOdds = Math.round(crashOdds / 10) * 10;

    const crashOddsStr = crashOdds > 0 ? `+${crashOdds}` : `${crashOdds}`;

    return {
        win: winOddsStr,
        top3: top3OddsStr,
        top10: top10OddsStr,
        crash: crashOddsStr
    };
};

export const mockDrivers = [
    { id: 1, name: "Max Verstappen", iRating: 9200, wins: 150, starts: 400, avgIncidents: 2.5, number: "1", startingPosition: 1 },
    { id: 2, name: "Lando Norris", iRating: 8500, wins: 90, starts: 350, avgIncidents: 3.1, number: "4", startingPosition: 2 },
    { id: 3, name: "Fernando Alonso", iRating: 7800, wins: 80, starts: 500, avgIncidents: 2.8, number: "14", startingPosition: 5 },
    { id: 4, name: "Rookie Driver", iRating: 1500, wins: 2, starts: 50, avgIncidents: 8.5, number: "99", startingPosition: 18 },
    { id: 5, name: "Mid Pack Mike", iRating: 3500, wins: 10, starts: 200, avgIncidents: 5.0, number: "42", startingPosition: 12 },
];
