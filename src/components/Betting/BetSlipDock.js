"use client";

import React from 'react';
import BetSlip from './BetSlip';
import { useBetting } from '@/context/BettingContext';

// ============================================================
// BetSlipDock — one BetSlip, two presentations:
//  • Desktop (>900px): fixed right column (as before)
//  • Mobile  (≤900px): slide-up drawer + floating button with
//    a badge showing how many picks are in the slip
// All show/hide behavior is CSS-driven via globals.css.
// ============================================================

export default function BetSlipDock() {
    const { bets, isBetSlipOpen, setIsBetSlipOpen } = useBetting();

    return (
        <>
            <aside className={`betslipPane ${isBetSlipOpen ? 'betslipOpen' : ''}`}>
                <BetSlip />
            </aside>

            {/* Mobile-only floating toggle (hidden while the drawer is open) */}
            {!isBetSlipOpen && (
                <button
                    className="betslipFab"
                    onClick={() => setIsBetSlipOpen(true)}
                    aria-label="Open bet slip"
                >
                    🎟️
                    {bets.length > 0 && <span className="betslipFabBadge">{bets.length}</span>}
                </button>
            )}

            {/* Mobile-only backdrop when drawer is open */}
            {isBetSlipOpen && (
                <div className="betslipBackdrop" onClick={() => setIsBetSlipOpen(false)} />
            )}
        </>
    );
}
