import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import styles from './DraftTeam.module.css';
import { useToast } from '@/components/Toast/ToastContext';

const DraftTeam = ({ drivers, entry, lobbyId, onDraftUpdate }) => {
    const toast = useToast();
    const { user } = useUser();
    const [selectedDrivers, setSelectedDrivers] = useState(
        [entry.driver_1, entry.driver_2, entry.driver_3].filter(Boolean)
    );
    const [captain, setCaptain] = useState(entry.captain_driver || null);
    const [saving, setSaving] = useState(false);

    const handleSelect = (driverId) => {
        if (selectedDrivers.includes(driverId)) {
            setSelectedDrivers(prev => prev.filter(d => d !== driverId));
            if (captain === driverId) setCaptain(null);
        } else {
            if (selectedDrivers.length < 3) {
                setSelectedDrivers(prev => [...prev, driverId]);
            }
        }
    };

    const handleSetCaptain = (driverId, e) => {
        e.stopPropagation();
        if (selectedDrivers.includes(driverId)) {
            setCaptain(driverId);
        }
    };

    const handleSave = async () => {
        if (selectedDrivers.length !== 3 || !captain) {
            return toast.error("Please select 3 drivers and assign a Captain.");
        }

        // Check if lineup is already locked
        const lineupLocked = entry.driver_1 && entry.driver_2 && entry.driver_3;
        if (lineupLocked) {
            return toast.info("Your lineup is locked! You cannot change it once saved.");
        }

        // Warn user before first save
        const confirmed = confirm(
            "⚠️ WARNING: Once you save your lineup, you CANNOT edit it!\n\n" +
            "Make sure you've selected the right drivers and captain before proceeding.\n\n" +
            "Continue?"
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            const res = await fetch('/api/multiplayer/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lobbyId,
                    userId: user.id,
                    drivers: selectedDrivers,
                    captain
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Lineup Saved! Your lineup is now LOCKED.");
                onDraftUpdate();
            } else {
                toast.error(data.error);
            }
        } catch (err) {
            toast.error("Save failed");
        } finally {
            setSaving(false);
        }
    };

    const lineupLocked = entry.driver_1 && entry.driver_2 && entry.driver_3;

    return (
        <div className={styles.container}>
            <h2>Draft Your Team</h2>
            {lineupLocked ? (
                <p className={styles.lockedWarning}>
                    🔒 Your lineup is LOCKED. You cannot make changes.
                </p>
            ) : (
                <p className={styles.instructions}>
                    Select 3 Drivers. Pick 1 Captain (1.5x Points). <strong>Lineup locks after saving!</strong>
                </p>
            )}

            <div className={styles.driverList}>
                {drivers.length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No drivers loaded. <br />
                        <small>Waiting for race data...</small>
                    </div>
                )}
                {drivers.map(driver => {
                    if (!driver || !driver.UserID) return null;
                    const isSelected = selectedDrivers.includes(String(driver.UserID));
                    const isCaptain = captain === String(driver.UserID);

                    return (
                        <div
                            key={driver.UserID}
                            className={`${styles.driverCard} ${isSelected ? styles.selected : ''} ${lineupLocked ? styles.locked : ''}`}
                            onClick={() => !lineupLocked && handleSelect(String(driver.UserID))}
                        >
                            <div className={styles.driverInfo}>
                                <div className={styles.driverMain}>
                                    <span className={styles.number}>#{driver.CarNumber || 'N/A'}</span>
                                    <span className={styles.name}>{driver.UserName || 'Unknown Driver'}</span>
                                </div>
                                <div className={styles.driverStats}>
                                    <span className={styles.stat}>
                                        <small>Start: P{driver.CarIdxPosition ?? '?'}</small>
                                    </span>
                                    <span className={styles.stat}>
                                        <small>iR: {driver.IRating || '?'}</small>
                                    </span>
                                </div>
                            </div>

                            {isSelected && !lineupLocked && (
                                <button
                                    className={`${styles.captainBtn} ${isCaptain ? styles.captainActive : ''}`}
                                    onClick={(e) => handleSetCaptain(String(driver.UserID), e)}
                                >
                                    {isCaptain ? '👑 CPT' : 'Make CPT'}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className={styles.footer}>
                <div className={styles.summary}>
                    Selected: {selectedDrivers.length}/3
                    {captain && <span className={styles.captainBadge}>Captain Set</span>}
                </div>
                <button
                    className={styles.saveBtn}
                    onClick={handleSave}
                    disabled={lineupLocked || saving || selectedDrivers.length !== 3 || !captain}
                >
                    {lineupLocked ? '🔒 Lineup Locked' : (saving ? 'Saving...' : 'Save Lineup (Final!)')}
                </button>
            </div>
        </div>
    );
};

export default DraftTeam;
