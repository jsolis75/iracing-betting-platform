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
            // LIVE ODDS: Position becomes dominant, but not too extreme for top 10

            const cappedIRating = Math.min(iRating, 7000);
            const liveIRatingFactor = Math.pow(cappedIRating / 5000, 0.5);

            const iRatingWeight = 0.05 * Math.pow(1 - raceProgress, 3.0);
            const historicalWeight = 0.05 * Math.pow(1 - raceProgress, 2.0);
            const positionWeight = 1 - (iRatingWeight + historicalWeight);

            // MUCH flatter position curve - highly competitive top 10
            const dynamicExponent = 3 + (raceProgress * 15); // Was 3.5 + (progress * 22)
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

    // --- Crash Odds --- REDESIGNED: Incidents + License Class Focus (NO iRating)
    const avgIncidents = stats.avgIncidents || 3.0;

    // Extract license class from LicString (e.g., "A 4.99" -> "A", "Pro/WC 4.5" -> "Pro")
    const licString = driver.LicString || driver.licenseClass || '';
    const licClass = licString.charAt(0).toUpperCase(); // First letter: A, B, C, D, R, P

    // 1. INCIDENT FACTOR (Primary - 50% weight) - WIDENED FOR MORE VARIATION
    // Below 2.5: Extremely clean -> Low crash prob
    // 2.5-3.0: Clean -> Low crash prob
    // 3.0-3.99: Average -> Medium crash prob
    // 4.0-4.99: Dirty -> High crash prob
    // 5.0+: Extremely dirty -> Very high crash prob
    let incidentMultiplier;
    if (avgIncidents <= 2.5) incidentMultiplier = 0.3; // Extremely clean (was 0.4)
    else if (avgIncidents <= 3.0) incidentMultiplier = 0.7; // Clean (was 0.6)
    else if (avgIncidents <= 3.99) incidentMultiplier = 1.2; // Average (was 1.0)
    else if (avgIncidents <= 4.99) incidentMultiplier = 2.0; // Dirty (was 1.6)
    else incidentMultiplier = 3.5; // Extremely dirty (was 2.5)

    // 2. LICENSE CLASS FACTOR (Secondary - 50% weight, INCREASED from 30%)
    // NOTE: ~90% of drivers are A-class, so A is the baseline
    // A/Pro: Baseline (cleanest drivers) -> 1.0x multiplier
    // B: Noticeably worse -> 1.4x multiplier (was 1.15)
    // C: Much dirtier -> 2.0x multiplier (was 1.4)
    // D and below: Extremely dirty -> 3.0x multiplier (was 1.8)
    let licenseMultiplier;
    if (licClass === 'A' || licClass === 'P') licenseMultiplier = 1.0; // A or Pro = baseline
    else if (licClass === 'B') licenseMultiplier = 1.4; // B is noticeably worse
    else if (licClass === 'C') licenseMultiplier = 2.0; // C is much dirtier
    else licenseMultiplier = 3.0; // D, R, or unknown = extremely dirty

    // Combined crash probability (Base 10%, scaled by factors)
    const baseCrashRate = 0.10; // Increased from 0.08 for wider odds range
    const crashProbability = Math.min(
        baseCrashRate * (incidentMultiplier * 0.5 + licenseMultiplier * 0.5), // 50/50 split
        0.70 // Cap at 70% max crash probability (was 60%)
    );

    let crashOdds = probToOdds(crashProbability);
    crashOdds = Math.max(50, Math.min(2500, crashOdds)); // Wider range: +50 to +2500
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
