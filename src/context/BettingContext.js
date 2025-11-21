"use client";

import React, { createContext, useContext, useState } from 'react';
import { useUser } from './UserContext';

// Create context
const BettingContext = createContext();
export const useBetting = () => useContext(BettingContext);

export const BettingProvider = ({ children }) => {
    // User context
    const { user, updateUserBalance, addBetToHistory, users, setUser, setUsers } = useUser();

    // Betting state
    const [bets, setBets] = useState([]);
    const [isBetSlipOpen, setIsBetSlipOpen] = useState(false);
    const [parlayMode, setParlayMode] = useState(false);
    const [parlayStake, setParlayStake] = useState(10);

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
        const totalDecimal = bets.reduce((acc, b) => acc * getDecimalOdds(b.odds), 1);
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

    // Place bets – deduct balance and store pending bets in user history
    const placeBets = () => {
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

        // Create new bets array
        const newBets = [];
        if (parlayMode) {
            const { americanOdds, payout } = calculateParlayInfo();
            newBets.push({
                type: 'Parlay',
                driver: `${bets.length} Legs`,
                odds: americanOdds,
                stake: parlayStake,
                payout,
                raceName: 'Multi-Race / Multi-Bet',
                timestamp: Date.now(),
                legs: bets,
                result: 'Pending',
            });
        } else {
            bets.forEach(bet => {
                newBets.push({
                    ...bet,
                    payout: calculatePotentialPayout(bet.stake, bet.odds),
                    timestamp: Date.now(),
                    result: 'Pending',
                });
            });
        }

        // Atomically update user state: deduct balance AND add bets
        const updatedUser = {
            ...user,
            balance: user.balance - totalStake,
            betHistory: [...user.betHistory, ...newBets]
        };

        setUser(updatedUser);
        const updatedUsers = users.map(u => u.username === user.username ? updatedUser : u);
        setUsers(updatedUsers);
        localStorage.setItem('iracing_betting_users', JSON.stringify(updatedUsers));
        localStorage.setItem('iracing_betting_session', JSON.stringify(updatedUser));

        setBets([]);
        alert(`Bets placed! Total stake: $${totalStake.toFixed(2)}`);
    };

    // Settle bets when a race finishes
    const settleBets = (raceData) => {
        if (!user) return;
        let totalNewWinnings = 0;
        const updatedBetHistory = user.betHistory.map((bet) => {
            if (bet.result !== 'Pending') return bet;
            const driver = raceData.drivers.find((d) => d.name === bet.driver);
            if (!driver) return { ...bet, result: 'Lost', payout: 0 };
            let won = false;
            switch (bet.type) {
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
            const payout = won ? calculatePotentialPayout(bet.stake, bet.odds) : 0;
            if (won) totalNewWinnings += parseFloat(payout);
            return { ...bet, result: won ? 'Won' : 'Lost', payout: parseFloat(payout.toFixed(2)) };
        });
        if (totalNewWinnings > 0) updateUserBalance(totalNewWinnings);
        const updatedUser = { ...user, betHistory: updatedBetHistory };
        setUser(updatedUser);
        const updatedUsers = users.map((u) => (u.username === user.username ? updatedUser : u));
        setUsers(updatedUsers);
        localStorage.setItem('iracing_betting_users', JSON.stringify(updatedUsers));
        localStorage.setItem('iracing_betting_session', JSON.stringify(updatedUser));
        setBets([]);
    };

    // Return the provider with all context values
    return (
        <BettingContext.Provider
            value={{
                balance: user ? user.balance : 0,
                bets,
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
