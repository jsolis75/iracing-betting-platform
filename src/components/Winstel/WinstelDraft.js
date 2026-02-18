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

    // Sort drivers by salary descending
    const sortedDrivers = [...filteredDrivers].sort((a, b) => b.salary - a.salary);

    // Format name: "Ryan Blaney" -> "R. Blaney"
    const formatName = (fullName) => {
        const parts = fullName.split(' ');
        if (parts.length < 2) return fullName;
        return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
    };

    // Admin Salary Adjustment
    const updateSalary = async (driverId, newSalary) => {
        if (user.username !== 'dumindu') return;
        const roundedSalary = Math.round(parseInt(newSalary) / 500) * 500;
        try {
            const res = await fetch('/api/winstel/admin/salaries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    eventId: event.id,
                    driverId,
                    salary: roundedSalary
                })
            });
            if (res.ok) {
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
                    disabled={saving || event.status !== 'upcoming' || selectedDrivers.length !== MAX_DRIVERS || currentSalary > SALARY_CAP}
                >
                    {saving ? 'Saving...' : event.status !== 'upcoming' ? 'Lineups Locked' : 'Lock In Lineup'}
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

                    <div className={styles.tableWrapper}>
                        <table className={styles.draftTable}>
                            <thead>
                                <tr>
                                    <th>Driver</th>
                                    <th>Team</th>
                                    <th>Avg</th>
                                    <th>Salary</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDrivers.map(driver => (
                                    <tr
                                        key={driver.id}
                                        className={`${styles.draftRow} ${selectedDrivers.includes(driver.id) ? styles.selectedRow : ''}`}
                                    >
                                        <td className={styles.driverCell}>
                                            <div className={styles.driverInfo}>
                                                <div className={styles.miniCar}>{driver.car_number}</div>
                                                <div>
                                                    <div className={styles.driverName}>{formatName(driver.name)}</div>
                                                    {driver.notes === 'ROTY' && <span className={styles.rotyBadge}>ROTY</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className={styles.teamCell}>{driver.team}</td>
                                        <td className={styles.avgCell}>{(driver.irating / 100).toFixed(1)}</td>
                                        <td className={styles.salaryCell}>
                                            {user.username === 'dumindu' ? (
                                                <input
                                                    type="number"
                                                    defaultValue={driver.salary}
                                                    onBlur={(e) => updateSalary(driver.id, e.target.value)}
                                                    className={styles.adminSalaryInput}
                                                />
                                            ) : (
                                                <span>${driver.salary.toLocaleString()}</span>
                                            )}
                                        </td>
                                        <td className={styles.actionCell}>
                                            <button
                                                className={`${styles.addBtn} ${selectedDrivers.includes(driver.id) ? styles.remove : ''}`}
                                                onClick={() => toggleDriver(driver.id)}
                                            >
                                                {selectedDrivers.includes(driver.id) ? '➖' : '➕'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.selectionCol}>
                    <h3 className={styles.selectionTitle}>My Lineup</h3>
                    {selectedDrivers.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No drivers selected.</p>}
                    <div className={styles.selectedList}>
                        {selectedDrivers.map(id => {
                            const driver = drivers.find(d => d.id === id);
                            return (
                                <div key={id} className={styles.selectedDriver}>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <span className={styles.selectedCar}>{driver?.car_number}</span>
                                        <span className={styles.selectedName}>{driver?.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <span className={styles.selectedSalary}>${driver?.salary.toLocaleString()}</span>
                                        <button className={styles.removeIcon} onClick={() => toggleDriver(id)}>✕</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.summaryBox}>
                        <div className={styles.summaryRow}>
                            <span>Total Salary:</span>
                            <span className={currentSalary > SALARY_CAP ? styles.danger : styles.success}>
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
