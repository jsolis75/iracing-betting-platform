import React from 'react';
import styles from './ResultsModal.module.css';

const ResultsModal = ({ race, onClose }) => {
    if (!race) return null;

    const sortedDrivers = [...race.drivers].sort((a, b) => a.currentPosition - b.currentPosition);

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Race Results</h2>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                <div className={styles.raceInfo}>
                    <h3>{race.name}</h3>
                    <p>{race.track} • {race.totalLaps} Laps</p>
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.resultsTable}>
                        <thead>
                            <tr>
                                <th>Pos</th>
                                <th>Driver</th>
                                <th>Car #</th>
                                <th>Laps</th>
                                <th>Inc</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDrivers.map((driver) => (
                                <tr
                                    key={driver.id}
                                    className={driver.isDNF ? styles.dnfRow : ''}
                                >
                                    <td className={styles.position}>
                                        {driver.currentPosition <= 3 && !driver.isDNF ? (
                                            <span className={styles[`p${driver.currentPosition}`]}>
                                                {driver.currentPosition}
                                            </span>
                                        ) : (
                                            driver.currentPosition
                                        )}
                                    </td>
                                    <td className={styles.driverName}>
                                        {driver.name}
                                        <span className={styles.license}>{driver.licenseClass}</span>
                                    </td>
                                    <td>#{driver.number}</td>
                                    <td>{driver.lapsComplete}</td>
                                    <td>{driver.currentIncidents}x</td>
                                    <td>
                                        {driver.isDNF ? (
                                            <span className={styles.dnfBadge}>DNF</span>
                                        ) : (
                                            <span className={styles.finishedBadge}>Finished</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ResultsModal;
