"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from './UserContext';

// Create context
const BettingContext = createContext();
export const useBetting = () => useContext(BettingContext);

export const BettingProvider = ({ children }) => {
    const { user, updateUserBalance, refreshUser } = useUser();

    // Betting state
    const [bets, setBets] = useState([]); // Active bets in the slip (not placed yet)
    const [placedBets, setPlacedBets] = useState([]); // Bets stored in database
    const [isBetSlipOpen, setIsBetSlipOpen] = useState(false);
    const [parlayMode, setParlayMode] = useState(false);
    const [parlayStake, setParlayStake] = useState(10);

    // Load placed bets from database when user changes
    useEffect(() => {
        if (user?.id) {
            fetchPlacedBets(user.id);
        } else {
            setPlacedBets([]);
        }
    }, [user?.id]);

    const fetchPlacedBets = async (userId) => {
        try {
            const response = await fetch(`/api/bets?userId=${userId}`);
            if (response.ok) {
                const data = await response.json();
                setPlacedBets(data.bets || []);
            }
        } catch (error) {
            console.error('Error fetching bets:', error);
        }
    };

    // Helper: Convert American odds to decimal
    const getDecimalOdds = (americanOdds) => {
        const odds = parseInt(americanOdds);
        if (odds > 0) return odds / 100 + 1;
        return 100 / Math.abs(odds) + 1;
    };

    // Helper: Calculate potential payout for a single bet (excluding stake)
    const calculatePotentialPayout = (stake, americanOdds) => {
        if (!stake || isNaN(stake)) return 0;
        const decimalOdds = getDecimalOdds(americanOdds);
        return stake * decimalOdds - stake;
    };

    // Helper: Validate parlay bets
    const validateParlay = () => {
        if (bets.length < 2) return { isValid: false, error: 'Parlays require at least 2 bets.' };
        const winBets = bets.filter(b => b.type === 'Win');
        if (winBets.length > 1) return { isValid: false, error: "Cannot parlay multiple 'Win' bets." };
        const drivers = bets.map(b => b.driver);
        if (new Set(drivers).size !== drivers.length) return { isValid: false, error: 'Cannot parlay multiple bets for the same driver.' };
        return { isValid: true, error: null };
    };

    // Helper: Calculate parlay odds and payout
    const calculateParlayInfo = () => {
        const validation = validateParlay();
        if (!validation.isValid) return { decimalOdds: 0, americanOdds: '+0', payout: 0, error: validation.error };

        let totalDecimal = bets.reduce((acc, b) => acc * getDecimalOdds(b.odds), 1);

        // PARLAY REDUCTION (20% House Edge on Parlays)
        // We reduce the total payout multiplier by 20%
        totalDecimal = totalDecimal * 0.8;

        // Ensure odds don't go below 1.01 (loss)
        totalDecimal = Math.max(totalDecimal, 1.01);

        const american = totalDecimal >= 2 ? Math.round((totalDecimal - 1) * 100) : Math.round(-100 / (totalDecimal - 1));
        const payout = parlayStake ? parlayStake * totalDecimal - parlayStake : 0;
        return { decimalOdds: totalDecimal, americanOdds: american > 0 ? `+${american}` : `${american}`, payout, error: null };
    };

    // Add a bet to the slip
    const addToBetSlip = (bet) => {
        if (bets.some(b => b.driver === bet.driver && b.type === bet.type)) return;
        setBets(prev => [...prev, { ...bet, id: Date.now(), stake: 10 }]);
        setIsBetSlipOpen(true);
    };

    // Remove a bet (by array index)
    const removeFromBetSlip = (index) => {
        const newBets = [...bets];
        newBets.splice(index, 1);
        setBets(newBets);
    };

    // Update stake for a bet (by index)
    const updateStake = (index, stake) => {
        const newBets = [...bets];
        newBets[index].stake = parseFloat(stake);
        setBets(newBets);
    };

    // Place bets – call API
    const placeBets = async () => {
        if (!user) { alert('Please login to place bets.'); return; }

        let totalStake = 0;
        if (parlayMode) {
            const validation = validateParlay();
            if (!validation.isValid) { alert(validation.error); return; }
            totalStake = parseFloat(parlayStake) || 0;
        } else {
            totalStake = bets.reduce((s, b) => s + (parseFloat(b.stake) || 0), 0);
        }

        if (totalStake <= 0) { alert('Please enter a stake.'); return; }
        if (totalStake > user.balance) { alert('Insufficient funds!'); return; }

        try {
            const betsToPlace = [];

            if (parlayMode) {
                const { americanOdds, payout } = calculateParlayInfo();
                betsToPlace.push({
                    userId: user.id,
                    raceId: bets[0].raceId || 'multi', // Use first race ID or generic
                    driverName: `${bets.length} Legs`,
                    betType: 'Parlay',
                    stake: parlayStake,
                    odds: parseFloat(americanOdds), // Store as number if possible, or string
                    potentialPayout: payout,
                    details: bets // Save the individual legs
                });
            } else {
                bets.forEach(bet => {
                    betsToPlace.push({
                        userId: user.id,
                        raceId: bet.raceId,
                        driverName: bet.driver,
                        betType: bet.type,
                        stake: parseFloat(bet.stake),
                        odds: parseFloat(bet.odds),
                        potentialPayout: calculatePotentialPayout(bet.stake, bet.odds),
                        details: bet.selection ? { selection: bet.selection } : null
                    });
                });
            }

            // Send requests sequentially
            for (const bet of betsToPlace) {
                const response = await fetch('/api/bets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bet)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to place bet');
                }
            }

            // Success!
            setBets([]);
            alert(`Bets placed! Total stake: $${totalStake.toFixed(2)}`);

            // Refresh user balance and bets
            refreshUser();
            fetchPlacedBets(user.id);

        } catch (error) {
            console.error('Error placing bets:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Settle bets when a race finishes
    const settleBets = async (raceData) => {
        if (!user || !placedBets.length) return;

        const pendingBets = placedBets.filter(b => b.status === 'pending' && b.race_id === raceData.id);

        if (pendingBets.length === 0) return;

        let settledCount = 0;

        for (const bet of pendingBets) {
            const driver = raceData.drivers.find((d) => d.name === bet.driver_name);

            // If driver not found (and not a special bet type), skip or mark void? 
            // For now, assume lost if not found, or skip.
            if (!driver) continue;

            let won = false;
            switch (bet.bet_type) {
                case 'Win':
                    won = driver.currentPosition === 1; break;
                case 'Top 3':
                    won = driver.currentPosition <= 3; break;
                case 'Top 10':
                    won = driver.currentPosition <= 10; break;
                case 'Crash':
                    won = driver.isDNF; break;
                default:
                    won = false;
            }

            try {
                await fetch('/api/bets', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        betId: bet.id,
                        status: 'settled',
                        result: won ? 'won' : 'lost'
                    })
                });
                settledCount++;
            } catch (error) {
                console.error('Error settling bet:', bet.id, error);
            }
        }

        if (settledCount > 0) {
            refreshUser();
            fetchPlacedBets(user.id);
        }
    };

    return (
        <BettingContext.Provider
            value={{
                balance: user ? user.balance : 0,
                bets, // Active slip bets
                placedBets, // Database history
                addToBetSlip,
                removeFromBetSlip,
                updateStake,
                placeBets,
                settleBets,
                isBetSlipOpen,
                setIsBetSlipOpen,
                parlayMode,
                setParlayMode,
                parlayStake,
                setParlayStake,
                calculatePotentialPayout,
                calculateParlayInfo,
            }}
        >
            {children}
        </BettingContext.Provider>
    );
};
