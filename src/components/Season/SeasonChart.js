"use client";

import React, { useState, useMemo, useRef } from 'react';
import styles from './SeasonChart.module.css';

// ============================================================
// SeasonChart — cumulative profit over time, one line per user.
// Hand-rolled SVG (no chart lib): 2px lines, dashed $0 baseline,
// crosshair + tooltip on hover, legend + direct end labels,
// toggleable table view. Palette validated for both themes.
// ============================================================

const W = 860;
const H = 320;
const PAD = { top: 16, right: 110, bottom: 28, left: 56 };

const fmtMoney = (v) =>
    `${v < 0 ? '-' : '+'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtDate = (t) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function SeasonChart({ series }) {
    const [showTable, setShowTable] = useState(false);
    const [hover, setHover] = useState(null); // { x, t, values: [{username, v, colorIdx}] }
    const svgRef = useRef(null);

    // Step-after lines: profit is flat between bets, jumps at each settlement
    const model = useMemo(() => {
        const withData = (series || []).filter(s => s.points.length > 0);
        if (withData.length === 0) return null;

        const allTs = withData.flatMap(s => s.points.map(p => p[0]));
        const allVs = withData.flatMap(s => s.points.map(p => p[1]));
        const tMin = Math.min(...allTs);
        const tMax = Math.max(...allTs, Date.now());
        const vMin = Math.min(0, ...allVs);
        const vMax = Math.max(0, ...allVs);
        const vPad = Math.max((vMax - vMin) * 0.08, 10);

        const x = (t) => PAD.left + ((t - tMin) / Math.max(tMax - tMin, 1)) * (W - PAD.left - PAD.right);
        const y = (v) => PAD.top + (1 - (v - (vMin - vPad)) / ((vMax + vPad) - (vMin - vPad))) * (H - PAD.top - PAD.bottom);

        const lines = withData.map((s, i) => {
            // extend each line to "now" at its final value
            const pts = [...s.points, [tMax, s.points[s.points.length - 1][1]]];
            let d = `M ${x(pts[0][0])} ${y(0)} L ${x(pts[0][0])} ${y(pts[0][1])}`;
            for (let k = 1; k < pts.length; k++) {
                // step-after: horizontal to the new time, then vertical to the new value
                d += ` L ${x(pts[k][0])} ${y(pts[k - 1][1])} L ${x(pts[k][0])} ${y(pts[k][1])}`;
            }
            return { ...s, d, colorIdx: i, final: s.points[s.points.length - 1][1] };
        });

        // y gridlines: 4 nice steps
        const gridVals = [];
        const span = (vMax + vPad) - (vMin - vPad);
        const rawStep = span / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const step = Math.ceil(rawStep / mag) * mag;
        for (let v = Math.ceil((vMin - vPad) / step) * step; v <= vMax + vPad; v += step) {
            gridVals.push(v);
        }

        // x ticks: ~5 dates
        const xTicks = [];
        for (let i = 0; i <= 4; i++) xTicks.push(tMin + ((tMax - tMin) * i) / 4);

        return { lines, x, y, tMin, tMax, gridVals, xTicks };
    }, [series]);

    if (!model) {
        return <p className={styles.empty}>No settled bets yet — the graph starts with the first settled race.</p>;
    }

    const valueAt = (s, t) => {
        let v = 0;
        for (const [pt, pv] of s.points) {
            if (pt <= t) v = pv; else break;
        }
        return v;
    };

    const onMove = (e) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        if (px < PAD.left || px > W - PAD.right) { setHover(null); return; }
        const t = model.tMin + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (model.tMax - model.tMin);
        setHover({
            x: px,
            t,
            values: model.lines
                .map(s => ({ username: s.username, v: valueAt(s, t), colorIdx: s.colorIdx }))
                .sort((a, b) => b.v - a.v)
        });
    };

    return (
        <div className={styles.wrap}>
            <div className={styles.chartHeader}>
                {/* Legend (identity never color-alone: marker + name in text ink) */}
                <div className={styles.legend}>
                    {model.lines.map(s => (
                        <span key={s.username} className={styles.legendItem}>
                            <span className={`${styles.swatch} ${styles['c' + s.colorIdx]}`} />
                            {s.username}
                        </span>
                    ))}
                </div>
                <button className={styles.tableToggle} onClick={() => setShowTable(!showTable)}>
                    {showTable ? 'View chart' : 'View as table'}
                </button>
            </div>

            {showTable ? (
                <table className={styles.dataTable}>
                    <thead>
                        <tr><th>User</th><th>Season profit</th><th>Settled bets</th></tr>
                    </thead>
                    <tbody>
                        {model.lines.map(s => (
                            <tr key={s.username}>
                                <td>{s.username}</td>
                                <td className={s.final >= 0 ? styles.pos : styles.neg}>{fmtMoney(s.final)}</td>
                                <td>{s.points.length}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    className={styles.svg}
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                    role="img"
                    aria-label="Cumulative profit over the season, one line per user"
                >
                    {/* recessive grid + y labels */}
                    {model.gridVals.map(v => (
                        <g key={v}>
                            <line
                                x1={PAD.left} x2={W - PAD.right}
                                y1={model.y(v)} y2={model.y(v)}
                                className={v === 0 ? styles.zeroLine : styles.gridLine}
                            />
                            <text x={PAD.left - 8} y={model.y(v) + 4} className={styles.axisLabel} textAnchor="end">
                                {fmtMoney(v).replace('+$0', '$0')}
                            </text>
                        </g>
                    ))}
                    {/* x labels */}
                    {model.xTicks.map(t => (
                        <text key={t} x={model.x(t)} y={H - 8} className={styles.axisLabel} textAnchor="middle">
                            {fmtDate(t)}
                        </text>
                    ))}

                    {/* series lines */}
                    {model.lines.map(s => (
                        <path key={s.username} d={s.d} className={`${styles.line} ${styles['c' + s.colorIdx]}`} />
                    ))}

                    {/* direct end labels for the top 4 series */}
                    {model.lines.slice(0, 4).map(s => (
                        <text
                            key={s.username + '-label'}
                            x={W - PAD.right + 6}
                            y={model.y(s.final) + 4}
                            className={styles.endLabel}
                        >
                            {s.username} {fmtMoney(s.final)}
                        </text>
                    ))}

                    {/* crosshair + hover markers */}
                    {hover && (
                        <g>
                            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={H - PAD.bottom} className={styles.crosshair} />
                            {hover.values.map(hv => (
                                <circle
                                    key={hv.username}
                                    cx={hover.x}
                                    cy={model.y(hv.v)}
                                    r="4.5"
                                    className={`${styles.dot} ${styles['c' + hv.colorIdx]}`}
                                />
                            ))}
                        </g>
                    )}
                </svg>
            )}

            {/* HTML tooltip (follows crosshair) */}
            {hover && !showTable && (
                <div
                    className={styles.tooltip}
                    style={{ left: `${Math.min((hover.x / W) * 100, 78)}%` }}
                >
                    <div className={styles.tooltipDate}>{fmtDate(hover.t)}</div>
                    {hover.values.map(hv => (
                        <div key={hv.username} className={styles.tooltipRow}>
                            <span className={`${styles.swatch} ${styles['c' + hv.colorIdx]}`} />
                            <span className={styles.tooltipName}>{hv.username}</span>
                            <span className={hv.v >= 0 ? styles.pos : styles.neg}>{fmtMoney(hv.v)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
