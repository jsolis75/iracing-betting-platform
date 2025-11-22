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
        if (iRating >= 6000) iRatingFactor = Math.pow(iRating / 1000, 4.0); // Was 3.0 -> 4.0 (Super Favorites)
        else if (iRating >= 4000) iRatingFactor = Math.pow(iRating / 1000, 3.0); // Was 2.5 -> 3.0
        else iRatingFactor = Math.pow(iRating / 1000, 2.0); // Was 1.8 -> 2.0

        // --- 2. Historical Performance Component ---
        // Win Percentage (0-100) -> Factor
        const winPctFactor = Math.pow((stats.winPercentage || 0) / 10, 1.3);

        // Avg Points (Higher is better) - Normalize against a "good" score like 100
        const avgPointsFactor = Math.pow((stats.avgPoints || 50) / 50, 1.6);

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
            // LIVE ODDS: Position becomes dominant, but not too extreme for top 10

            const cappedIRating = Math.min(iRating, 7000);
            const liveIRatingFactor = Math.pow(cappedIRating / 5000, 0.5);

            const iRatingWeight = 0.05 * Math.pow(1 - raceProgress, 3.0);
            const historicalWeight = 0.05 * Math.pow(1 - raceProgress, 2.0);
            const positionWeight = 1 - (iRatingWeight + historicalWeight);

            // Balanced position curve - competitive but differentiated
            const dynamicExponent = 3.2 + (raceProgress * 18); // Sweet spot between flat and steep
            const dynamicPositionFactor = Math.pow((fieldSize - currentPos + 1) / fieldSize, dynamicExponent);

            // Gap penalty: Only for positions 13+ (deeper in field)
            let gapPenalty = 1.0;
            if (raceProgress > 0.4 && currentPos > 12) { // After 40% AND outside top 12
                const gap = currentPos - 12; // How far from P12
                gapPenalty = Math.pow(0.80, gap); // 20% per position (was 18%)
            }

            winProbability =
                (liveIRatingFactor * iRatingWeight) +
                (historicalFactor * historicalWeight) +
                (dynamicPositionFactor * positionWeight * gapPenalty);
        } else {
            // PRE-RACE ODDS
            winProbability =
                (iRatingFactor * 0.30) +
                (historicalFactor * 0.40) +
                (startingPositionFactor * 0.30);
        }

        // Apply Pro/Black license boost
        winProbability = winProbability * proBoost;

        return { ...driver, winProbability, iRatingFactor, historicalFactor, raceProgress };
    });

    // Normalize probabilities to sum to 1.0
    const totalProb = driversWithProb.reduce((sum, d) => sum + d.winProbability, 0);

    // HOUSE EDGE (VIGORISH) - 20%
    // We multiply the normalized probability by 1.20.
    // This makes the sum of probabilities > 1.0 (e.g., 1.20), which lowers the odds.
    const HOUSE_EDGE = 1.20;

    const driversWithNormalizedProb = driversWithProb.map(d => ({
        ...d,
        winProbability: (d.winProbability / totalProb) * HOUSE_EDGE
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
        // Cap probability at 0.99 to avoid infinity
        const prob = Math.min(p, 0.99);
        if (prob >= 0.5) return Math.round(-100 / (1 - prob));
        return Math.round(100 * ((1 / prob) - 1));
    };

    // --- Win Odds ---
    let winOdds = probToOdds(winProbability);
    winOdds = Math.max(-10000, Math.min(10000, winOdds)); // Cap
    if (Math.abs(winOdds) < 200) winOdds = Math.round(winOdds / 5) * 5;
    else winOdds = Math.round(winOdds / 10) * 10;
    const winOddsStr = winOdds > 0 ? `+${winOdds}` : `${winOdds}`;

    // --- Top 3 Odds --- TIGHTER MULTIPLIERS
    // Use Top25Percent as a proxy for "Top Finish Ability"
    const topFinishAbility = (stats.top25Percent || 0) / (stats.starts || 1); // 0.0 to 1.0

    // REDUCED MULTIPLIER: Was 2.5x, now 1.8x
    const top3Prob = Math.min(winProbability * 1.8 + (topFinishAbility * 0.15), 0.95);

    let top3Odds = probToOdds(top3Prob);
    top3Odds = Math.max(-2000, Math.min(1500, top3Odds)); // Tighter caps
    top3Odds = Math.round(top3Odds / 10) * 10;
    const top3OddsStr = top3Odds > 0 ? `+${top3Odds}` : `${top3Odds}`;

    // --- Top 10 Odds --- TIGHTER MULTIPLIERS
    // REDUCED MULTIPLIER: Was 6x, now 4.0x
    const top10Prob = Math.min(winProbability * 4.0 + (topFinishAbility * 0.3), 0.98);
    let top10Odds = probToOdds(top10Prob);
    top10Odds = Math.max(-2500, Math.min(600, top10Odds)); // Tighter caps
    top10Odds = Math.round(top10Odds / 10) * 10;
    const top10OddsStr = top10Odds > 0 ? `+${top10Odds}` : `${top10Odds}`;

    // --- Crash Odds --- REDESIGNED: Aggressive House Edge & Variance
    const avgIncidents = stats.avgIncidents || 3.0;

    // Extract license class from LicString (e.g., "A 4.99" -> "A", "Pro/WC 4.5" -> "Pro")
    const licString = driver.LicString || driver.licenseClass || '';
    const licClass = licString.charAt(0).toUpperCase(); // First letter: A, B, C, D, R, P

    // 1. INCIDENT FACTOR (Primary)
    // Range: 0.0 (Clean) to 1.0 (Dirty)
    let incidentScore = 0;
    if (avgIncidents <= 2.0) incidentScore = 0.1; // Super Clean
    else if (avgIncidents <= 3.5) incidentScore = 0.3; // Average
    else if (avgIncidents <= 5.0) incidentScore = 0.6; // Dirty
    else incidentScore = 0.9; // Wrecking Ball

    // 2. LICENSE CLASS FACTOR (Secondary)
    // Range: 0.0 (Pro/A) to 1.0 (Rookie)
    let licenseScore = 0;
    if (licClass === 'P') licenseScore = 0.0;
    else if (licClass === 'A') licenseScore = 0.2;
    else if (licClass === 'B') licenseScore = 0.4;
    else if (licClass === 'C') licenseScore = 0.7;
    else licenseScore = 1.0; // D, R

    // Combined Risk Score (0.0 to 1.0)
    // Weighted: 70% Incidents, 30% License
    const riskScore = (incidentScore * 0.7) + (licenseScore * 0.3);

    // Calculate Crash Probability
    // Low Risk (~0.1) -> +900 odds
    // High Risk (~0.65) -> -185 odds
    const baseCrashProb = 0.08; // Baseline chance for anyone
    const variableCrashProb = riskScore * 0.60; // Up to 60% added risk
    let crashProbability = baseCrashProb + variableCrashProb;

    // Apply HOUSE EDGE to Crash Odds (Inflate probability)
    crashProbability = Math.min(crashProbability * 1.25, 0.85);

    let crashOdds = probToOdds(crashProbability);

    // Clamp odds to requested range: -200 to +1000
    crashOdds = Math.max(-200, Math.min(1000, crashOdds));

    // Rounding
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
