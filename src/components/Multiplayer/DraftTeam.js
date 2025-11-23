import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import styles from './DraftTeam.module.css';

const DraftTeam = ({ drivers, entry, lobbyId, onDraftUpdate }) => {
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
            return alert("Please select 3 drivers and assign a Captain.");
        }

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
                alert("Lineup Saved!");
                onDraftUpdate();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.container}>
            <h2>Draft Your Team</h2>
            <p className={styles.instructions}>
                Select 3 Drivers. Pick 1 Captain (1.5x Points).
            </p>

            <div className={styles.driverList}>
                {drivers.length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', color: '#888' }}>
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
                            className={`${styles.driverCard} ${isSelected ? styles.selected : ''}`}
                            onClick={() => handleSelect(String(driver.UserID))}
                        >
                            <div className={styles.driverInfo}>
                                <span className={styles.number}>#{driver.CarNumber || 'N/A'}</span>
                                <span className={styles.name}>{driver.UserName || 'Unknown Driver'}</span>
                            </div>

                            {isSelected && (
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
                    disabled={saving || selectedDrivers.length !== 3 || !captain}
                >
                    {saving ? 'Saving...' : 'Save Lineup'}
                </button>
            </div>
        </div>
    );
};

export default DraftTeam;
