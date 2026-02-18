'use client';

import React, { useState, useEffect } from 'react';
import styles from './WinstelDraft.module.css';

const WinstelDraft = ({ user, event, drivers, initialLineup, onSave }) => {
    const [selectedDrivers, setSelectedDrivers] = useState(initialLineup || []);
    const [searchQuery, setSearchQuery] = useState('');
    const [saving, setSaving] = useState(false);

    const SALARY_CAP = 50000;
    const MAX_DRIVERS = 6;

    const currentSalary = selectedDrivers.reduce((sum, id) => {
        const driver = drivers.find(d => d.id === id);
        return sum + (driver?.salary || 0);
    }, 0);

    const toggleDriver = (driverId) => {
        if (selectedDrivers.includes(driverId)) {
            setSelectedDrivers(selectedDrivers.filter(id => id !== driverId));
        } else {
            if (selectedDrivers.length >= MAX_DRIVERS) {
                alert(`You can only select up to ${MAX_DRIVERS} drivers.`);
                return;
            }
            setSelectedDrivers([...selectedDrivers, driverId]);
        }
    };

    const handleSave = async () => {
        if (selectedDrivers.length !== MAX_DRIVERS) {
            alert(`Please select exactly ${MAX_DRIVERS} drivers.`);
            return;
        }
        if (currentSalary > SALARY_CAP) {
            alert("Your lineup exceeds the $50,000 salary cap!");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/winstel/lineup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: event.id,
                    userId: user.id,
                    driverIds: selectedDrivers
                })
            });
            const data = await res.json();
            if (data.success) {
                alert("Lineup saved successfully!");
                onSave && onSave();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Failed to save lineup");
        } finally {
            setSaving(false);
        }
    };

    // Filter drivers by search and group by team
    const filteredDrivers = drivers.filter(d =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.car_number.includes(searchQuery)
    );

    const teams = [...new Set(drivers.map(d => d.team))];

    // Admin Salary Adjustment
    const updateSalary = async (driverId, newSalary) => {
        if (user.username !== 'dumindu') return;
        try {
            const res = await fetch('/api/winstel/admin/salaries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    eventId: event.id,
                    driverId,
                    salary: parseInt(newSalary)
                })
            });
            if (res.ok) {
                // Refresh local drivers list or trigger refresh in parent
                onSave && onSave();
            }
        } catch (err) {
            console.error("Admin update failed", err);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.statsBar}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Salary Remaining</span>
                        <span className={`${styles.statValue} ${currentSalary > SALARY_CAP ? styles.danger : ''}`}>
                            ${(SALARY_CAP - currentSalary).toLocaleString()}
                        </span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Drivers Selected</span>
                        <span className={styles.statValue}>{selectedDrivers.length} / {MAX_DRIVERS}</span>
                    </div>
                </div>
                <button
                    className={styles.submitBtn}
                    style={{ maxWidth: '200px', marginTop: 0 }}
                    onClick={handleSave}
                    disabled={saving || selectedDrivers.length !== MAX_DRIVERS || currentSalary > SALARY_CAP}
                >
                    {saving ? 'Saving...' : 'Lock In Lineup'}
                </button>
            </div>

            <div className={styles.mainLayout}>
                <div className={styles.selectionArea}>
                    <div className={styles.searchBar}>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Find drivers by name, team, or car #..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className={styles.driverList}>
                        {teams.map(team => {
                            const teamDrivers = filteredDrivers.filter(d => d.team === team);
                            if (teamDrivers.length === 0) return null;
                            return (
                                <div key={team} className={styles.teamSection}>
                                    <h3 className={styles.teamName}>{team}</h3>
                                    {teamDrivers.map(driver => (
                                        <div
                                            key={driver.id}
                                            className={`${styles.driverCard} ${selectedDrivers.includes(driver.id) ? styles.selected : ''}`}
                                            onClick={() => toggleDriver(driver.id)}
                                        >
                                            <div className={styles.driverInfo}>
                                                <div className={styles.carNumber}>{driver.car_number}</div>
                                                <div>
                                                    <span className={styles.driverName}>{driver.name}</span>
                                                    {driver.notes === 'ROTY' && <span className={styles.rotyTag}>ROTY</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                {user.username === 'dumindu' ? (
                                                    <input
                                                        type="number"
                                                        defaultValue={driver.salary}
                                                        onBlur={(e) => updateSalary(driver.id, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={styles.adminInput}
                                                        style={{ width: '80px', background: '#000', border: '1px solid #eab308', color: '#eab308', padding: '2px 5px' }}
                                                    />
                                                ) : (
                                                    <span className={styles.salary}>${driver.salary.toLocaleString()}</span>
                                                )}
                                                <div className={styles.addIcon}>
                                                    {selectedDrivers.includes(driver.id) ? '➖' : '➕'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.selectionCol}>
                    <h3 className={styles.selectionTitle}>My Lineup</h3>
                    {selectedDrivers.length === 0 && <p style={{ color: '#666' }}>No drivers selected.</p>}
                    {selectedDrivers.map(id => {
                        const driver = drivers.find(d => d.id === id);
                        return (
                            <div key={id} className={styles.selectedDriver}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 900, color: '#eab308', width: '25px' }}>{driver?.car_number}</span>
                                    <span>{driver?.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem' }}>${driver?.salary.toLocaleString()}</span>
                                    <button className={styles.removeBtn} onClick={() => toggleDriver(id)}>✕</button>
                                </div>
                            </div>
                        );
                    })}

                    <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #333' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Total Salary:</span>
                            <span style={{ color: currentSalary > SALARY_CAP ? '#ef4444' : '#22c55e' }}>
                                ${currentSalary.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WinstelDraft;
