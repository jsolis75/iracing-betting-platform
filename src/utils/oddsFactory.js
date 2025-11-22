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

        // --- 1. iRating Component (Skill) --- REDUCED EXPONENTS FOR TIGHTER ODDS
        let iRatingFactor;
        if (iRating >= 6000) iRatingFactor = Math.pow(iRating / 1000, 3.0); // Was 4.0
        else if (iRating >= 4000) iRatingFactor = Math.pow(iRating / 1000, 2.5); // Was 3.2
        else iRatingFactor = Math.pow(iRating / 1000, 1.8); // Was 2.2

        // --- 2. Historical Performance Component ---
        // Win Percentage (0-100) -> Factor
        const winPctFactor = Math.pow((stats.winPercentage || 0) / 10, 1.3); // Was 1.5, reduced for tighter odds

        // Avg Points (Higher is better) - Normalize against a "good" score like 100
        const avgPointsFactor = Math.pow((stats.avgPoints || 50) / 50, 1.6); // Was 2.0, reduced

        // Combined Historical Factor (Increased overall weight)
        const historicalFactor = (winPctFactor * 0.6) + (avgPointsFactor * 0.4);

        // --- PRO/BLACK LICENSE BOOST ---
        // Check if driver has Pro (P) or Black (level 6+) license
        const licString = driver.licenseClass || driver.LicString || '';
        const isPro = licString.includes('P') || licString.includes('Pro');
        const licLevel = driver.LicSubLevel ? Math.floor(driver.LicSubLevel / 100) : 0;
        const isBlack = licLevel >= 6;
        const proBoost = (isPro || isBlack) ? 1.35 : 1.0; // 35% boost for pros

        // --- 3. Position Component ---
        const startingPositionFactor = Math.pow((fieldSize - startPos + 1) / fieldSize, 2.0);
        const currentPositionFactor = Math.pow((fieldSize - currentPos + 1) / fieldSize, 2.0);

        // --- 4. Final Probability Calculation ---
        let winProbability;
        if (useLiveOdds && raceProgress > 0) {
            // LIVE ODDS: Position dominates FASTER as race progresses
            const iRatingWeight = 0.25 * (1 - Math.pow(raceProgress, 0.3)); // Was 0.30 and 0.5 exponent, now faster
            const historicalWeight = 0.15 * (1 - Math.pow(raceProgress, 0.6)); // Was 0.10, increased influence
            const positionWeight = 1 - (iRatingWeight + historicalWeight);

            const dynamicExponent = 2 + (raceProgress * 18); // Was 25, reduced for tighter odds
            const dynamicPositionFactor = Math.pow((fieldSize - currentPos + 1) / fieldSize, dynamicExponent);

            winProbability =
                (iRatingFactor * iRatingWeight) +
                (historicalFactor * historicalWeight) +
                (dynamicPositionFactor * positionWeight);
        } else {
            // PRE-RACE ODDS: Reduced iRating (30%), Increased History (40%), Start Pos (30%)
            winProbability =
                (iRatingFactor * 0.30) + // Was 0.40
                (historicalFactor * 0.40) + // Was 0.30
                (startingPositionFactor * 0.30);
        }

        // Apply Pro/Black license boost
        winProbability = winProbability * proBoost;

        return { ...driver, winProbability, iRatingFactor, historicalFactor, raceProgress };
    });

    // Normalize probabilities to sum to 1.0
    const totalProb = driversWithProb.reduce((sum, d) => sum + d.winProbability, 0);
    const driversWithNormalizedProb = driversWithProb.map(d => ({
        ...d,
        winProbability: d.winProbability / totalProb
    }));

    // Calculate odds for each driver
    return driversWithNormalizedProb.map(driver => {
        const odds = calculateOdds(driver, driversWithNormalizedProb);
        return { ...driver, odds };
    });
};

/**
 * Calculate odds for a single driver
 */
export const calculateOdds = (driver, allDrivers = [driver]) => {
    const { winProbability, startingPosition } = driver;
    const stats = driver.Stats || { starts: 0, wins: 0, avgPoints: 0, avgIncidents: 0, avgFinish: 0, top25Percent: 0, winPercentage: 0 };
    const fieldSize = allDrivers.length;

    // Helper to convert probability to American Odds
    const probToOdds = (p) => {
        if (p >= 0.5) return Math.round(-100 / (1 - p));
        return Math.round(100 * ((1 / p) - 1));
    };

    // --- Win Odds ---
    let winOdds = probToOdds(winProbability);
    winOdds = Math.max(-5000, Math.min(5000, winOdds)); // Cap
    if (Math.abs(winOdds) < 200) winOdds = Math.round(winOdds / 5) * 5;
    else winOdds = Math.round(winOdds / 10) * 10;
    const winOddsStr = winOdds > 0 ? `+${winOdds}` : `${winOdds}`;

    // --- Top 3 Odds --- TIGHTER MULTIPLIERS
    // Use Top25Percent as a proxy for "Top Finish Ability"
    const topFinishAbility = (stats.top25Percent || 0) / (stats.starts || 1); // 0.0 to 1.0
    const top3Prob = Math.min(winProbability * 2.5 + (topFinishAbility * 0.15), 0.92); // Was 3x, now 2.5x for tighter odds

    let top3Odds = probToOdds(top3Prob);
    top3Odds = Math.max(-1500, Math.min(1500, top3Odds)); // Tighter caps
    top3Odds = Math.round(top3Odds / 10) * 10;
    const top3OddsStr = top3Odds > 0 ? `+${top3Odds}` : `${top3Odds}`;

    // --- Top 10 Odds --- TIGHTER MULTIPLIERS
    const top10Prob = Math.min(winProbability * 6 + (topFinishAbility * 0.3), 0.95); // Was 8x, now 6x
    let top10Odds = probToOdds(top10Prob);
    top10Odds = Math.max(-2000, Math.min(600, top10Odds)); // Tighter caps
    top10Odds = Math.round(top10Odds / 10) * 10;
    const top10OddsStr = top10Odds > 0 ? `+${top10Odds}` : `${top10Odds}`;

    // --- Crash Odds ---
    // Base crash rate from Avg Incidents (Historical)
    // Avg Incidents usually ranges 1.5 (Safe) to 4.0+ (Unsafe)
    const avgIncidents = stats.avgIncidents || 2.5;
    const incidentFactor = Math.pow(avgIncidents / 2.0, 1.5); // Higher incidents = Higher crash prob

    const driverRating = Math.max(driver.iRating || 1500, 1000);
    const fieldAvgRating = allDrivers.reduce((sum, d) => sum + (d.iRating || 1500), 0) / allDrivers.length;
    const ratingRatio = fieldAvgRating / driverRating; // Lower rating = Higher crash prob

    const baseCrashRate = 0.10; // 10% base chance
    const crashProbability = Math.min(baseCrashRate * incidentFactor * ratingRatio, 0.75);

    let crashOdds = probToOdds(crashProbability);
    crashOdds = Math.max(50, Math.min(1500, crashOdds));
    crashOdds = Math.round(crashOdds / 10) * 10;
    const crashOddsStr = `+${crashOdds}`;

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
