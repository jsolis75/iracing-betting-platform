/**
 * Odds Factory
 * Generates realistic-looking odds based on driver statistics, starting position, and LIVE race position.
 * Now includes dynamic odds that adjust as the race progresses.
 */

/**
 * Calculate odds for all drivers in a race field
 * @param {Array} drivers - Array of driver objects with iRating, startingPosition, currentPosition, etc.
 * @param {Object} raceState - Optional race state (lapsRemaining, totalLaps, etc.)
 * @returns {Array} - Array of drivers with calculated odds
 */
export const calculateFieldOdds = (drivers, raceState = null) => {
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

    // Top 10 Odds - EXTREMELY AGGRESSIVE considering small field sizes
    const fieldSize = allDrivers.length;
    let top10Prob = Math.min(winProbability * 3.0 + (topFinishAbility * 0.25), 0.95);

    // HIGH IRATING THREAT FACTOR: Account for fast drivers in back who will likely finish Top 10
    // In 24-30 car fields, Top 10 = top 33-42% of field (VERY achievable)
    // Count how many high-iRating drivers are behind this driver
    const thisDriverIRating = driver.iRating || 1500;
    const highIRThreshold = 5000; // Consider 5000+ iR drivers as threats
    const raceProgress = driver.raceProgress || 0;

    let threatsFromBehind = 0;
    if (currentPos <= 15) { // Only relevant if you're in contention
        threatsFromBehind = allDrivers.filter(d => {
            const theirPos = d.currentPosition || d.startingPosition || 99;
            const theirIR = d.iRating || 1500;
            // Count drivers behind this one with much higher iRating
            return theirPos > currentPos && theirIR > highIRThreshold;
        }).length;
    }

    // Threat impact decreases as race progresses (less time to make up ground)
    const threatImpact = threatsFromBehind * (0.15 * (1 - raceProgress)); // 15% per threat early, 0% late

    // MASSIVE POSITION-BASED BOOST + THREAT REDUCTION
    if (currentPos <= 3) {
        top10Prob = Math.min(top10Prob * (1.7 - threatImpact), 0.99); // Was 1.6x, now 1.7x
    } else if (currentPos <= 5) {
        top10Prob = Math.min(top10Prob * (1.65 - threatImpact), 0.98); // Was 1.55x, now 1.65x  
    } else if (currentPos <= 7) {
        top10Prob = Math.min(top10Prob * (1.55 - threatImpact), 0.97); // Was 1.45x, now 1.55x
    } else if (currentPos <= 10) {
        top10Prob = Math.min(top10Prob * (1.45 - threatImpact), 0.96); // Was 1.35x, now 1.45x (YOU'RE IN TOP 10!)
    } else if (currentPos <= 15) {
        // P11-P15: In smaller fields, still very likely to finish Top 10
        const fieldSizeMultiplier = fieldSize <= 25 ? 1.3 : 1.2; // Smaller fields = easier to finish Top 10
        top10Prob = Math.min(top10Prob * (fieldSizeMultiplier - threatImpact * 0.5), 0.93);
    } else {
        // P16+: Harder but still possible, especially for high iRating drivers
        if (thisDriverIRating > highIRThreshold) {
            top10Prob = Math.min(top10Prob * 1.1, 0.88); // Small boost for fast drivers in back
        }
    }

    let top10Odds = probToOdds(top10Prob);
    top10Odds = Math.max(-2500, Math.min(600, top10Odds));
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
