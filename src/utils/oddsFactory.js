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

    // Calculate field statistics
    const iRatings = drivers.map(d => Math.max(d.iRating || 1500, 1000));
    const avgIRating = iRatings.reduce((a, b) => a + b, 0) / iRatings.length;

    // Calculate win probability based ONLY on iRating with a flatter curve
    const driversWithProb = drivers.map(driver => {
        const iRating = Math.max(driver.iRating || 1500, 1000);
        const iRatingDiff = iRating - avgIRating;

        // Base factor: Everyone has a chance
        // Use a logistic-style function to flatten the extremes
        // This prevents super-favorites even with high iRating gaps

        // 1. Calculate raw strength relative to field
        // 1000 iRating gap = ~2x strength (NASCAR style, not F1 style)
        let strength = Math.pow(1.8, iRatingDiff / 1000);

        // 2. Cap the maximum strength advantage to keep field tight
        // No driver should be more than 4x likely to win than average
        strength = Math.min(strength, 4.0);

        // 3. Floor the minimum strength
        // No driver should be less than 0.25x likely to win
        strength = Math.max(strength, 0.25);

        return { ...driver, winProbability: strength };
    });

    // Normalize probabilities
    const totalStrength = driversWithProb.reduce((sum, d) => sum + d.winProbability, 0);

    // HOUSE EDGE: Lower edge for pre-race to encourage betting
    const HOUSE_EDGE = 1.25;

    const normalized = driversWithProb.map(d => ({
        ...d,
        winProbability: (d.winProbability / totalStrength) * HOUSE_EDGE
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
    top10Odds = Math.max(-2000, Math.min(1200, top10Odds)); // Cap at -2000 instead of -3000
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
