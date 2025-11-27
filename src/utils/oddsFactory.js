// Odds Factory - Updated P1 Logic and Lap Down Penalties - Production Deploy
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
 * AGGRESSIVE MODEL: Creates strong favorites with steep odds differences
 */
const calculatePreRaceOdds = (drivers) => {
    if (!drivers || drivers.length === 0) return [];

    // Calculate field statistics
    const iRatings = drivers.map(d => Math.max(d.iRating || 1500, 1000));
    const avgIRating = iRatings.reduce((a, b) => a + b, 0) / iRatings.length;

    // Calculate win probability based ONLY on iRating with AGGRESSIVE curve
    const driversWithProb = drivers.map(driver => {
        const iRating = Math.max(driver.iRating || 1500, 1000);
        const iRatingDiff = iRating - avgIRating;

        // AGGRESSIVE SCALING: Create strong favorites
        // Higher iRating = exponentially better odds
        // 1000 iRating gap = ~5x strength (much steeper than before)
        let strength = Math.pow(2.5, iRatingDiff / 1000);

        // OUTLIER BOOST: Drivers significantly above average get massive favoritism
        if (iRatingDiff > 1500) {
            strength *= 3.0; // 3x multiplier for elite drivers
        } else if (iRatingDiff > 1000) {
            strength *= 2.2; // 2.2x multiplier for very strong drivers
        } else if (iRatingDiff > 500) {
            strength *= 1.6; // 1.6x multiplier for strong drivers
        }

        // Remove caps - let the favorites be heavy favorites
        // Only apply a floor to prevent absurdly low odds for backmarkers
        strength = Math.max(strength, 0.15);

        return { ...driver, winProbability: strength };
    });

    // Normalize probabilities
    const totalStrength = driversWithProb.reduce((sum, d) => sum + d.winProbability, 0);

    // INCREASED HOUSE EDGE: Lower payouts = more negative odds for favorites
    const HOUSE_EDGE = 1.50; // Increased from 1.25

    const normalized = driversWithProb.map(d => ({
        ...d,
        winProbability: (d.winProbability / totalStrength) * HOUSE_EDGE
    }));

    // Apply probability floors to cap maximum odds for underdogs
    // This prevents absurdly bad odds for low-rated drivers
    return normalized.map(driver => {
        let { winProbability } = driver;

        // MIN WIN PROBABILITY: 4.5% (caps at +2000 odds)
        // No driver should be worse than +2000 to win, no matter how bad
        winProbability = Math.max(winProbability, 0.045);

        const odds = calculateOdds({ ...driver, winProbability }, normalized, true); // Pass isPreRace flag
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
        let winProbability = 0;
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

        // --- 3. Position Component ---
        let startingPositionFactor = Math.pow((fieldSize - startPos + 1) / fieldSize, 2.0);


        // HIGH IRATING BACKMARKER ADJUSTMENT (Last-to-First Challenge)
        // If a high iRating driver starts in the back, they are likely doing it for fun/content
        // and are still extremely dangerous. Don't let the position penalty crush their odds.
        if (iRating > 5000 && startPos > 10) {
            // Calculate how "back" they are (0.0 to 1.0)
            const backness = (startPos - 10) / (fieldSize - 10);

            // The higher the iRating, the more we ignore the starting position
            const iRatingTrust = Math.min((iRating - 5000) / 4000, 1.0); // 0.0 at 5k, 1.0 at 9k+

            // Boost factor: Recover up to 70% of the lost position value
            const recoveryFactor = 0.3 + (iRatingTrust * 0.5);

            // Apply boost
            startingPositionFactor = Math.max(startingPositionFactor, 0.4 * recoveryFactor);

            // FORCE TOP 5 PROBABILITY RULE
            // If iRating is significantly high (>6000 or >2000 above avg) and starting back,
            // FORCE their starting position factor to be equivalent to a Top 5 starter.
            if (iRating > 6000 || iRatingDiff > 2000) {
                // P5 starting factor is approx (fieldSize - 5 / fieldSize)^2 ~= 0.8
                // We'll give them a factor of 0.75 to 0.90 depending on just HOW good they are
                const superBoost = 0.75 + (Math.min(iRating - 6000, 4000) / 4000) * 0.15;
                startingPositionFactor = Math.max(startingPositionFactor, superBoost);
            }
        }

        // BRANCHING LOGIC: Live race uses current position, Pre-race uses starting position
        if (useLiveOdds && raceProgress > 0) {
            // LIVE ODDS: BALANCED (Driver Quality + Position)
            // Give significant weight to iRating/stats even late in race
            const cappedIRating = Math.min(iRating, 7000);
            const liveIRatingFactor = Math.pow(cappedIRating / 5000, 0.7);

            // REBALANCED WEIGHTS: Driver quality stays relevant throughout race
            // Early race: iR=35%, Hist=20%, Pos=45%
            // Late race: iR=20%, Hist=10%, Pos=70% (still balanced)
            const iRatingWeight = 0.35 * Math.pow(1 - raceProgress, 1.5); // Decays slower
            const historicalWeight = 0.20 * Math.pow(1 - raceProgress, 1.2);
            const positionWeight = 1 - (iRatingWeight + historicalWeight);

            // Position factor with moderate exponent (not as extreme)
            const dynamicExponent = 2.0 + (raceProgress * 8); // Max 10 instead of 17.8
            const dynamicPositionFactor = Math.pow(Math.max(0, (fieldSize - currentPos + 1) / fieldSize), dynamicExponent);

            // SMART GAP ADJUSTMENT: Only penalize backmarkers if they're also low-rated
            // High iRating drivers in the back are still dangerous
            let gapAdjustment = 1.0;
            if (currentPos > 15) {
                const gap = currentPos - 15;
                const iRatingTrust = Math.min((iRating - 4000) / 3000, 1.0); // 0 at 4k, 1 at 7k

                if (iRatingTrust > 0.5) {
                    // High iRating: minimal penalty
                    gapAdjustment = Math.pow(0.95, gap); // 5% per position
                } else if (iRatingTrust > 0) {
                    // Medium iRating: moderate penalty
                    gapAdjustment = Math.pow(0.90, gap); // 10% per position
                } else {
                    // Low iRating: heavy penalty
                    gapAdjustment = Math.pow(0.85, gap); // 15% per position
                }
            }



            // SIMPLE POSITION DIFFERENTIAL BONUS
            // All positions gained are valued equally
            let positionDifferentialBonus = 1.0;
            const positionsGained = startPos - currentPos; // Positive = gained positions

            if (positionsGained > 0) {
                // Simple linear bonus: 8% per position gained
                positionDifferentialBonus = 1.0 + (positionsGained * 0.08);
            } else if (positionsGained < -5) {
                // Falling back significantly - penalty
                positionDifferentialBonus = 1.0 / (1.0 + (Math.abs(positionsGained) * 0.08));
            }


            winProbability =
                (liveIRatingFactor * iRatingWeight) +
                (historicalFactor * historicalWeight) +
                (dynamicPositionFactor * positionWeight * gapAdjustment);

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

        // --- PRO/BLACK LICENSE BOOST ---
        // SIGNIFICANTLY INCREASED for DWC/Pro drivers
        const licString = driver.licenseClass || driver.LicString || '';
        const isPro = licString.includes('P') || licString.includes('Pro') || licString.includes('WC');
        const licLevel = driver.LicSubLevel ? Math.floor(driver.LicSubLevel / 100) : 0;
        const isBlack = licLevel >= 6;

        // Pro drivers get massive boost (2.5x), Black stripe gets large boost (1.5x)
        const proBoost = isPro ? 2.5 : (isBlack ? 1.5 : 1.0);

        winProbability = winProbability * proBoost;

        // --- LAP DOWN PENALTY ---
        // Determine the leader's laps (most laps completed in the field)
        const leaderLaps = Math.max(...drivers.map(d => d.lapsComplete || 0));
        const driverLaps = driver.lapsComplete || 0;
        const lapsDown = leaderLaps - driverLaps;

        if (lapsDown > 0) {
            // Car is lapped - apply severe penalties
            let lapDownPenalty = 1.0;

            if (lapsDown === 1) {
                // 1 lap down: Very hard to finish well, 70% penalty
                lapDownPenalty = 0.30;
            } else if (lapsDown === 2) {
                // 2 laps down: Nearly impossible, 90% penalty
                lapDownPenalty = 0.10;
            } else {
                // 3+ laps down: Extremely rare to recover, 95% penalty
                lapDownPenalty = 0.05;
            }

            winProbability = winProbability * lapDownPenalty;

            if (currentPos <= 10) {
                console.log(`[P${currentPos} ${driver.name}] LAP DOWN PENALTY: ${lapsDown} laps down, penalty: ${(lapDownPenalty * 100).toFixed(0)}%, new prob: ${winProbability.toFixed(4)}`);
            }
        }

        // DEBUG LOGGING FOR TOP 3
        if (currentPos <= 3) {
            console.log(`[P${currentPos} ${driver.name}] After lap-down check: ${winProbability.toFixed(4)}, lapsDown: ${lapsDown}`);
        }

        // WIN ODDS PENALTY FOR P11+: Drivers outside top 10 have lower win probability
        // P4-P10 are exempt because they're still in strong contention for top finishes
        if (currentPos > 10) {
            // Progressive penalty: P11 gets small penalty, P20+ gets massive penalty
            const positionPenalty = Math.pow(0.92, currentPos - 10); // 8% reduction per position after P10
            winProbability = winProbability * positionPenalty;
        }

        // DEBUG: Check if P1-P3 got penalized (they shouldn't)
        if (currentPos <= 3) {
            console.log(`[P${currentPos} ${driver.name}] After P4+ check (should be unchanged): ${winProbability.toFixed(4)}`);
        }

        // LEADER FAVORITISM: Ensure P1 is always a heavy favorite regardless of iRating
        if (currentPos === 1 && useLiveOdds && raceProgress > 0.1) {
            const beforeBoost = winProbability;
            // Give leader a massive boost (they're controlling the race)
            const leaderBoost = 1.5 + (raceProgress * 0.8); // 1.5x early, up to 2.3x late
            winProbability = Math.min(winProbability * leaderBoost, 0.85); // Cap at 85% to avoid -10000 odds
            console.log(`[P1 ${driver.name}] Leader boost: ${leaderBoost.toFixed(2)}x, before: ${beforeBoost.toFixed(4)}, after: ${winProbability.toFixed(4)}`);
        } else if (currentPos === 1) {
            console.log(`[P1 ${driver.name}] NO LEADER BOOST - useLiveOdds=${useLiveOdds}, raceProgress=${raceProgress.toFixed(4)}`);
        }

        return { ...driver, winProbability, iRatingFactor, historicalFactor, raceProgress, qualifyingBonus };
    });

    // HARD-CODE P1 FAVORITISM: Ensure P1 always has the best odds
    // Find P1 and the second-best probability
    const p1Driver = driversWithProb.find(d => d.currentPosition === 1);
    const p2Driver = driversWithProb.find(d => d.currentPosition === 2);
    const otherDrivers = driversWithProb.filter(d => d.currentPosition !== 1);

    console.log('=== P1 BOOST LOGIC DEBUG ===');
    console.log(`P1 found: ${p1Driver ? p1Driver.name : 'NOT FOUND'}, pos: ${p1Driver?.currentPosition}, prob: ${p1Driver?.winProbability.toFixed(4)}`);
    console.log(`P2 found: ${p2Driver ? p2Driver.name : 'NOT FOUND'}, pos: ${p2Driver?.currentPosition}, prob: ${p2Driver?.winProbability.toFixed(4)}`);

    if (p1Driver && useLiveOdds) {
        // Find the highest probability among non-P1 drivers
        const maxOtherProb = Math.max(...otherDrivers.map(d => d.winProbability));
        const maxOtherDriver = otherDrivers.find(d => d.winProbability === maxOtherProb);

        console.log(`Max other prob: ${maxOtherProb.toFixed(4)} from ${maxOtherDriver?.name} (P${maxOtherDriver?.currentPosition})`);

        // Force P1 to be at least 2.0x better than the second-best driver (increased from 1.5x)
        const minP1Prob = maxOtherProb * 2.0;

        console.log(`P1 current prob: ${p1Driver.winProbability.toFixed(4)}, minimum required: ${minP1Prob.toFixed(4)}`);

        if (p1Driver.winProbability < minP1Prob) {
            console.log(`[P1 HARD FIX] Boosting P1 ${p1Driver.name} from ${p1Driver.winProbability.toFixed(4)} to ${minP1Prob.toFixed(4)} (1.5x second best ${maxOtherProb.toFixed(4)})`);
            p1Driver.winProbability = minP1Prob;
        } else {
            console.log(`[P1 OK] P1 already has better probability than required minimum`);
        }
    }
    console.log('=== END P1 BOOST DEBUG ===');

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

export const calculateOdds = (driver, allDrivers = [driver], isPreRace = false) => {
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

    // PRE-RACE FLOOR: Min 16.7% probability (caps at +500 odds)
    if (isPreRace) {
        top3Prob = Math.max(top3Prob, 0.167);
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

    // RACE PROGRESS MULTIPLIER: As race goes on, current position becomes EXPONENTIALLY more important
    // Late race (>70% progress): Drivers in top 10 are almost guaranteed to finish there barring crashes
    let raceProgressMultiplier = 1.0;

    if (currentPos <= 10) {
        // EXPONENTIAL SCALING for top 10 drivers
        // Early race (0%): 1.0x multiplier
        // Mid race (50%): 2.5x multiplier
        // Late race (75%): 6.0x multiplier
        // Final laps (90%+): 12.0x multiplier
        const exponentialFactor = Math.pow(raceProgress, 2); // Square for exponential growth
        raceProgressMultiplier = 1.0 + (exponentialFactor * 11.0); // 1.0x to 12.0x range

        console.log(`[TOP 10 ODDS] P${currentPos} at ${(raceProgress * 100).toFixed(1)}% progress: multiplier ${raceProgressMultiplier.toFixed(2)}x`);
    } else if (currentPos <= 14) {
        // P11-14 gets partial benefit (they might sneak in)
        const exponentialFactor = Math.pow(raceProgress, 2.5); // Steeper curve for bubble positions
        raceProgressMultiplier = 1.0 + (exponentialFactor * 3.0); // 1.0x to 4.0x range
    } else {
        // P15+ gets minimal benefit (unlikely to crack top 10 late)
        raceProgressMultiplier = 1.0 + (raceProgress * 0.5); // 1.0x to 1.5x range
    }

    // PROGRESSIVE FAVORITISM - SMOOTHED DROPOFF
    // Smooth transition from P10 to P11+
    if (currentPos <= 2) {
        top10Prob = Math.min(top10Prob * 4.5 * raceProgressMultiplier, 0.98); // P1-P2 (increased cap from 0.93)
    } else if (currentPos <= 4) {
        top10Prob = Math.min(top10Prob * 3.8 * raceProgressMultiplier, 0.97); // P3-P4 (increased cap)
    } else if (currentPos <= 6) {
        top10Prob = Math.min(top10Prob * 3.2 * raceProgressMultiplier, 0.96); // P5-P6 (increased cap)
    } else if (currentPos <= 8) {
        top10Prob = Math.min(top10Prob * 2.6 * raceProgressMultiplier, 0.95); // P7-P8 (increased cap)
    } else if (currentPos <= 10) {
        top10Prob = Math.min(top10Prob * 2.0 * raceProgressMultiplier, 0.94); // P9-P10 (increased cap)
    } else if (currentPos <= 11) {
        // P11: Just outside top 10, moderate chance with crashes
        top10Prob = Math.min(top10Prob * 2.2 * raceProgressMultiplier, 0.80); // Increased from 1.9
    } else if (currentPos <= 12) {
        // P12: Still reasonable chance with 1-2 crashes
        top10Prob = Math.min(top10Prob * 2.0 * raceProgressMultiplier, 0.75); // Increased from 1.8
    } else if (currentPos <= 13) {
        // P13: Needs a few incidents but possible
        top10Prob = Math.min(top10Prob * 1.8 * raceProgressMultiplier, 0.70); // Increased from 1.7
    } else if (currentPos <= 14) {
        // P14: Long shot but crashes happen
        top10Prob = Math.min(top10Prob * 1.6 * raceProgressMultiplier, 0.65); // Kept same
    } else if (currentPos <= 15) {
        // P15: Very unlikely but not impossible
        top10Prob = Math.min(top10Prob * 1.4 * raceProgressMultiplier, 0.55); // Reduced cap from 0.70
    } else if (currentPos <= 16) {
        top10Prob = Math.min(top10Prob * 1.4 * raceProgressMultiplier, 0.65); // P16
    } else if (currentPos <= 18) {
        top10Prob = Math.min(top10Prob * 1.2 * raceProgressMultiplier, 0.55); // P17-P18
    } else if (currentPos <= 20) {
        top10Prob = Math.min(top10Prob * 1.1 * raceProgressMultiplier, 0.45); // P19-P20
    } else {
        if (thisDriverIRating > highIRThreshold) {
            top10Prob = Math.min(top10Prob * 1.05, 0.40);
        } else {
            top10Prob = Math.min(top10Prob, 0.30);
        }
    }

    // Apply threat impact and laps led bonus
    top10Prob = Math.max(top10Prob - threatImpact, 0.15);
    top10Prob = Math.min(top10Prob * lapsLedBonus, 0.99); // Increased cap from 0.97

    // PRE-RACE FLOOR: Min 33.3% probability (caps at +200 odds)
    if (isPreRace) {
        top10Prob = Math.max(top10Prob, 0.333);
    }

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
