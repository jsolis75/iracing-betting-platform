"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './Header.module.css';
import { useUser } from '@/context/UserContext';

const Header = () => {
  const { user, resetBalance } = useUser();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleResetClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmReset = () => {
    resetBalance();
    setShowConfirm(false);
  };

  const handleCancelReset = () => {
    setShowConfirm(false);
  };

  return (
    <header className={styles.header}>
      <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link href="/" className={styles.logo}>
            iRacing<span className={styles.logoHighlight}>Bet</span>
          </Link>
          <nav className={styles.nav}>
            <Link href="/" className={styles.navLink}>Live Racing</Link>
            <Link href="/leaderboard" className={styles.navLink}>Leaderboard</Link>
            <Link href="/profile" className={styles.navLink}>History</Link>
            <Link href="/multiplayer" className={styles.navLink}>Fantasy</Link>
          </nav>
        </div>

        {user && (
          <div className={styles.userSection}>
            <div className={styles.balance}>
              <span className={styles.balanceLabel}>Balance</span>
              <span className={styles.balanceValue}>${user.balance.toFixed(2)}</span>
              <button
                className={styles.resetButton}
                onClick={handleResetClick}
                title="Reset balance to $1000"
              >
                Reset
              </button>
            </div>
            <Link href="/profile" className={styles.profile}>
              <div className={styles.avatar}>
                {user.username.charAt(0).toUpperCase()}
              </div>
            </Link>
          </div>
        )}
      </div>

      {showConfirm && (
        <div className={styles.confirmModal}>
          <div className={styles.confirmDialog}>
            <h3>Reset Balance?</h3>
            <p>Are you sure you want to reset your balance to $1000.00?</p>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmYes} onClick={handleConfirmReset}>
                Yes, Reset
              </button>
              <button className={styles.confirmNo} onClick={handleCancelReset}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
