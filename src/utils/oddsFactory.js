/**
 * Odds Factory
 * TWO MODELS:
 * 1. PRE-RACE MODEL: Simple iRating-only odds for qualifying and before race starts
 * 2. SOPHISTICATED MODEL: Advanced odds using position, stats, and live race data
 * 
 * Switches from pre-race to sophisticated after leader completes lap 1
 */

/**
 * LIABILITY ADJUSTMENT:
 * Adjust win probability based on betting volume to manage risk.
 * If a driver has high liability (lots of bets), we increase their win probability
 * which effectively SHORTENS their odds (e.g., +500 -> +300).
 * 
 * Sensitivity: $5000 in bets = 2x probability (significant odds drop)
 */
const applyLiabilityAdjustment = (driver, betStats) => {
    if (!betStats || !betStats[driver.name]) return driver.winProbability;

    const stake = betStats[driver.name];
    const SENSITIVITY_THRESHOLD = 5000; // $5000 volume doubles the probability weight

    // Multiplier = 1.0 + (Stake / 5000)
    // $1000 stake -> 1.2x prob
    // $5000 stake -> 2.0x prob
    const liabilityMultiplier = 1.0 + (stake / SENSITIVITY_THRESHOLD);

    return driver.winProbability * liabilityMultiplier;
};

/**
 * PRE-RACE MODEL: Simple iRating-based odds for qualifying and pre-race
 * Uses ONLY iRating to calculate odds - no position, no stats
 * AGGRESSIVE MODEL: Creates strong favorites with steep odds differences
 */
const calculatePreRaceOdds = (drivers, betStats = null) => {
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

    // APPLY LIABILITY ADJUSTMENT (Line Movement)
    const driversWithLiability = driversWithProb.map(d => ({
        ...d,
        winProbability: applyLiabilityAdjustment(d, betStats)
    }));

    // Normalize probabilities
    const totalStrength = driversWithLiability.reduce((sum, d) => sum + d.winProbability, 0);

    // INCREASED HOUSE EDGE: Lower payouts = more negative odds for favorites
    const HOUSE_EDGE = 1.50; // Increased from 1.25

    const normalized = driversWithLiability.map(d => ({
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
 */
export const calculateSophisticatedOdds = (drivers, raceState = null, betStats = null) => {
    if (!drivers || drivers.length === 0) return [];

    const useLiveOdds = raceState && raceState.lapsRemaining !== undefined && raceState.totalLaps !== undefined;
    let raceProgress = 0;
    if (useLiveOdds && raceState.totalLaps !== "∞") {
        const lapsCompleted = parseInt(raceState.totalLaps) - raceState.lapsRemaining;
        raceProgress = Math.max(0, Math.min(1, lapsCompleted / parseInt(raceState.totalLaps)));
    }
    const fieldSize = drivers.length;
    const avgFieldIRating = drivers.reduce((sum, d) => sum + (d.iRating || 1500), 0) / fieldSize;

    // Sort drivers by iRating to determine expected position
    const sortedByIRating = [...drivers].sort((a, b) => (b.iRating || 1500) - (a.iRating || 1500));

    const driversWithProb = drivers.map(driver => {
        const iRating = Math.max(driver.iRating || 1500, 1000);
        const startPos = driver.startingPosition || 99;
        const currentPos = driver.currentPosition || startPos;
        const iRatingDiff = iRating - avgFieldIRating;

        // Expected position (1-based)
        const expectedPosition = sortedByIRating.findIndex(d => d.name === driver.name) + 1;
        const actualPosition = startPos;

        // Factors
        const iRatingFactor = Math.pow(iRating / 5000, 0.7); // Base skill
        let historicalFactor = 1.0;
        if (driver.Stats) {
            const winPct = driver.Stats.winPercentage || 0;
            const top5Pct = (driver.Stats.top5 || 0) / (driver.Stats.starts || 1);
            historicalFactor = 1.0 + (winPct * 2.0) + (top5Pct * 1.0);
        }

        let qualifyingBonus = 1.0;
        let qualifyingAdditiveBoost = 0.0;

        const qualDelta = actualPosition - expectedPosition;

        if (qualDelta < 0) {
            const spotsAhead = Math.abs(qualDelta);
            qualifyingBonus = 1.0 + (spotsAhead * 0.50);
        } else if (qualDelta > 5) {
            const spotsBehind = qualDelta - 5;
            qualifyingBonus = 1.0 / (1.0 + (spotsBehind * 0.20));
        }

        qualifyingBonus = Math.max(0.2, Math.min(5.0, qualifyingBonus));


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

            // FIX: Ensure currentPos is valid (1-based, not 0)
            const safeCurrentPos = Math.max(1, Math.min(currentPos || startPos, fieldSize));

            // Position factor with moderate exponent (not as extreme)
            const dynamicExponent = 2.0 + (raceProgress * 8); // Max 10 instead of 17.8
            const dynamicPositionFactor = Math.pow(Math.max(0.01, (fieldSize - safeCurrentPos + 1) / fieldSize), dynamicExponent);

            // SMART GAP ADJUSTMENT: Only penalize backmarkers if they're also low-rated
            // High iRating drivers in the back are still dangerous
            let gapAdjustment = 1.0;
            if (safeCurrentPos > 15) {
                const gap = safeCurrentPos - 15;
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


            // POSITION-WEIGHTED DIFFERENTIAL BONUS
            // Passing at the front is worth more than passing at the back
            let positionDifferentialBonus = 1.0;
            const positionsGained = startPos - safeCurrentPos; // Positive = gained positions

            if (positionsGained > 0) {
                // Calculate the "quality" of positions overtaken
                // Average position where the passing happened
                const avgPassingPosition = (startPos + safeCurrentPos) / 2;

                // Position value multiplier: Front = high value, Back = lower value
                // P1-P5: 1.8x to 2.0x (elite passing)
                // P6-P10: 1.3x to 1.7x (strong passing)
                // P11-P15: 1.0x to 1.2x (average passing)
                // P16+: 0.6x to 0.9x (backmarker passing)
                let positionValueMultiplier;
                if (avgPassingPosition <= 5) {
                    positionValueMultiplier = 1.8 + ((5 - avgPassingPosition) / 5) * 0.2; // 1.8 to 2.0
                } else if (avgPassingPosition <= 10) {
                    positionValueMultiplier = 1.3 + ((10 - avgPassingPosition) / 5) * 0.5; // 1.3 to 1.8
                } else if (avgPassingPosition <= 15) {
                    positionValueMultiplier = 1.0 + ((15 - avgPassingPosition) / 5) * 0.3; // 1.0 to 1.3
                } else {
                    positionValueMultiplier = 0.6 + Math.min((25 - avgPassingPosition) / 10, 0.3); // 0.6 to 0.9
                }

                // Base bonus rate depends on magnitude of gain
                let baseBonusRate;
                if (positionsGained > 5) {
                    baseBonusRate = 0.12; // Major charge through field
                } else if (positionsGained > 2) {
                    baseBonusRate = 0.10; // Moderate progress
                } else {
                    baseBonusRate = 0.08; // Small gains
                }

                // Apply position-weighted bonus
                const effectiveBonusRate = baseBonusRate * positionValueMultiplier;
                positionDifferentialBonus = 1.0 + (positionsGained * effectiveBonusRate);

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

            // P1 LATE RACE LOCK: If you're P1 with >70% race complete, MASSIVE boost
            if (safeCurrentPos === 1 && raceProgress > 0.7) {
                const p1LateBonus = 1.0 + (raceProgress - 0.7) * 5.0; // Up to 2.5x at 100%
                winProbability = winProbability * p1LateBonus;
            }
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

    // APPLY LIABILITY ADJUSTMENT (Line Movement)
    const driversWithLiability = driversWithProb.map(d => ({
        ...d,
        winProbability: applyLiabilityAdjustment(d, betStats)
    }));

    // Normalize probabilities to sum to 1.0
    const totalProb = driversWithLiability.reduce((sum, d) => sum + d.winProbability, 0);

    const HOUSE_EDGE = 1.45; // Increased from 1.30 to drastically lower payouts

    const driversWithNormalizedProb = driversWithLiability.map(d => ({
        ...d,
        winProbability: (d.winProbability / totalProb) * HOUSE_EDGE
    }));

    return driversWithNormalizedProb.map(driver => {
        const odds = calculateOdds(driver, driversWithNormalizedProb);
        return { ...driver, odds };
    });
};

export const calculateFieldOdds = (drivers, raceState = null, betStats = null) => {
    if (!drivers || drivers.length === 0) return [];

    // Check if race has started and leader has completed at least 1 lap
    const raceStarted = raceState && raceState.lapsRemaining !== undefined;
    const leaderCompletedLap1 = raceStarted && raceState.totalLaps !== "∞" &&
        (parseInt(raceState.totalLaps) - raceState.lapsRemaining) >= 1;

    // Use PRE-RACE model if race hasn't started or leader hasn't completed lap 1
    if (!leaderCompletedLap1) {
        console.log('Using PRE-RACE MODEL (iRating-only)');
        return calculatePreRaceOdds(drivers, betStats);
    }

    // Use SOPHISTICATED model after lap 1
    console.log('Using SOPHISTICATED MODEL (position + stats + iRating)');
    return calculateSophisticatedOdds(drivers, raceState, betStats);
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

    // RACE PROGRESS MULTIPLIER: As race goes on, current position becomes MORE important
    // Top 10 gets full benefit, P11-15 gets graduated benefit
    let raceProgressMultiplier = 1.0;
    if (currentPos <= 10) {
        raceProgressMultiplier = 1.0 + (raceProgress * 0.6); // 1.0x early, up to 1.6x late
    } else if (currentPos <= 15) {
        // Smooth falloff for P11-P15
        const factor = 0.6 - ((currentPos - 10) * 0.1); // 0.5, 0.4, 0.3, 0.2, 0.1
        raceProgressMultiplier = 1.0 + (raceProgress * Math.max(0.1, factor));
    }

    // PROGRESSIVE FAVORITISM - AGGRESSIVE FOR TOP 10
    // If you're in the top 10, especially late race, you should be heavily favored
    if (currentPos <= 2) {
        top10Prob = Math.min(top10Prob * 5.5 * raceProgressMultiplier, 0.98); // P1-P2: Near lock
    } else if (currentPos <= 4) {
        top10Prob = Math.min(top10Prob * 4.8 * raceProgressMultiplier, 0.96); // P3-P4: Very strong
    } else if (currentPos <= 6) {
        top10Prob = Math.min(top10Prob * 4.2 * raceProgressMultiplier, 0.94); // P5-P6: Strong
    } else if (currentPos <= 8) {
        top10Prob = Math.min(top10Prob * 3.6 * raceProgressMultiplier, 0.92); // P7-P8: Good
    } else if (currentPos <= 10) {
        top10Prob = Math.min(top10Prob * 3.0 * raceProgressMultiplier, 0.90); // P9-P10: Solid
    } else if (currentPos <= 11) {
        top10Prob = Math.min(top10Prob * 2.6 * raceProgressMultiplier, 0.82); // P11 (Smoothed from 1.9)
    } else if (currentPos <= 12) {
        top10Prob = Math.min(top10Prob * 2.3 * raceProgressMultiplier, 0.79); // P12 (Smoothed from 1.8)
    } else if (currentPos <= 13) {
        top10Prob = Math.min(top10Prob * 2.0 * raceProgressMultiplier, 0.76); // P13 (Smoothed from 1.7)
    } else if (currentPos <= 14) {
        top10Prob = Math.min(top10Prob * 1.7 * raceProgressMultiplier, 0.73); // P14 (Smoothed from 1.6)
    } else if (currentPos <= 15) {
        top10Prob = Math.min(top10Prob * 1.5 * raceProgressMultiplier, 0.70); // P15 (Smoothed)
    } else if (currentPos <= 16) {
        top10Prob = Math.min(top10Prob * 1.3 * raceProgressMultiplier, 0.65); // P16
    } else if (currentPos <= 18) {
        top10Prob = Math.min(top10Prob * 1.1 * raceProgressMultiplier, 0.55); // P17-P18
    } else if (currentPos <= 20) {
        top10Prob = Math.min(top10Prob * 1.0 * raceProgressMultiplier, 0.45); // P19-P20
    } else {
        if (thisDriverIRating > highIRThreshold) {
            top10Prob = Math.min(top10Prob * 1.05, 0.40);
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
