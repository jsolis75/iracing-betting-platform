"use client";

import React, { useState, useEffect, useCallback } from 'react';
import styles from './Tierlist.module.css';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/components/Toast/ToastContext';

// ============================================================
// Community Tier Lists — vote drivers into the top 10s.
// Pool = everyone who has appeared in a broadcast race.
// ============================================================

const CATEGORY_META = {
    terrorists: {
        title: '💣 Top 10 Biggest Terrorists',
        blurb: 'The menaces. The torpedoes. The reason your insurance is up.',
        voteLabel: '💣',
    },
    cleanest: {
        title: '😇 Top 10 Cleanest Racers',
        blurb: 'Surgeons. You could lend them your car.',
        voteLabel: '😇',
    },
};

const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`);

export default function TierListPage() {
    const { user } = useUser();
    const toast = useToast();
    const [pool, setPool] = useState([]);
    const [categories, setCategories] = useState({});
    const [myVotes, setMyVotes] = useState({});
    const [setupRequired, setSetupRequired] = useState(false);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const url = user ? `/api/tierlist?userId=${user.id}` : '/api/tierlist';
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            setPool(data.pool || []);
            setCategories(data.categories || {});
            setMyVotes(data.myVotes || {});
            setSetupRequired(!!data.setupRequired);
        } catch { /* fail soft */ } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const hasVoted = (category, key) => (myVotes[category] || []).includes(key);

    const vote = async (category, driver) => {
        if (!user) {
            toast.error('Log in to vote!');
            return;
        }
        setBusyKey(`${category}:${driver.key}`);
        try {
            const res = await fetch('/api/tierlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    category,
                    driverKey: driver.key,
                    driverName: driver.name
                })
            });
            const data = await res.json();
            if (res.ok) {
                await fetchData();
            } else {
                toast.error(data.error || 'Vote failed');
            }
        } catch {
            toast.error('Vote failed');
        } finally {
            setBusyKey(null);
        }
    };

    const statChips = (d) => (
        <span className={styles.chips}>
            {d.iRating != null && <span className={styles.chip}>iR {d.iRating}</span>}
            {d.license && <span className={styles.chip}>{d.license}</span>}
            {d.avgIncidents != null && (
                <span className={`${styles.chip} ${d.avgIncidents >= 5 ? styles.chipDanger : d.avgIncidents <= 2.5 ? styles.chipClean : ''}`}>
                    {Number(d.avgIncidents).toFixed(2)} inc/race
                </span>
            )}
        </span>
    );

    const filtered = search.trim().length >= 2
        ? pool.filter(d => d.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12)
        : [];

    return (
        <main className="container">
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>🏆 Community Tier Lists</h1>
                <p className={styles.pageSub}>
                    Vote drivers into the rankings. One vote per driver per list — click again to take it back.
                </p>
            </div>

            {setupRequired && (
                <div className={styles.setupNote}>
                    ⚠️ Almost there: run <code>TIER_LIST_SETUP.sql</code> in the Supabase SQL editor to enable voting.
                </div>
            )}

            {loading ? (
                <p className={styles.loading}>Loading rankings…</p>
            ) : (
                <div className={styles.listsGrid}>
                    {Object.keys(CATEGORY_META).map(cat => {
                        const meta = CATEGORY_META[cat];
                        const entries = categories[cat] || [];
                        return (
                            <section key={cat} className={styles.listCard}>
                                <h2 className={styles.listTitle}>{meta.title}</h2>
                                <p className={styles.listBlurb}>{meta.blurb}</p>

                                {entries.length === 0 ? (
                                    <div className={styles.emptyList}>
                                        No votes yet — search a driver below and cast the first one!
                                    </div>
                                ) : (
                                    <ol className={styles.rankList}>
                                        {entries.map((d, i) => (
                                            <li key={d.key} className={`${styles.rankRow} ${i === 0 ? styles.rankFirst : ''}`}>
                                                <span className={styles.rankBadge}>{medal(i)}</span>
                                                <span className={styles.rankInfo}>
                                                    <span className={styles.rankName}>{d.name}</span>
                                                    {statChips(d)}
                                                </span>
                                                <button
                                                    className={`${styles.voteBtn} ${hasVoted(cat, d.key) ? styles.voted : ''}`}
                                                    disabled={busyKey === `${cat}:${d.key}`}
                                                    onClick={() => vote(cat, d)}
                                                    title={hasVoted(cat, d.key) ? 'Remove your vote' : 'Vote'}
                                                >
                                                    {meta.voteLabel} {d.votes}
                                                </button>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            {/* Voting booth */}
            <section className={styles.booth}>
                <h2 className={styles.boothTitle}>Cast your votes</h2>
                <p className={styles.boothSub}>
                    Search any driver who has appeared in a broadcast race ({pool.length} in the pool).
                </p>
                <input
                    className={styles.search}
                    placeholder="Search driver name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search.trim().length >= 2 && filtered.length === 0 && (
                    <p className={styles.noResults}>No drivers match — they need to appear in a broadcast race first.</p>
                )}
                <div className={styles.results}>
                    {filtered.map(d => (
                        <div key={d.key} className={styles.resultRow}>
                            <span className={styles.rankInfo}>
                                <span className={styles.rankName}>{d.name}</span>
                                {statChips(d)}
                            </span>
                            <span className={styles.resultActions}>
                                <button
                                    className={`${styles.voteBtn} ${hasVoted('terrorists', d.key) ? styles.voted : ''}`}
                                    disabled={busyKey === `terrorists:${d.key}`}
                                    onClick={() => vote('terrorists', d)}
                                    title="Vote: Biggest Terrorist"
                                >
                                    💣 Terrorist
                                </button>
                                <button
                                    className={`${styles.voteBtn} ${hasVoted('cleanest', d.key) ? styles.voted : ''}`}
                                    disabled={busyKey === `cleanest:${d.key}`}
                                    onClick={() => vote('cleanest', d)}
                                    title="Vote: Cleanest Racer"
                                >
                                    😇 Clean
                                </button>
                            </span>
                        </div>
                    ))}
                </div>
                {!user && <p className={styles.loginNote}>Log in to cast votes.</p>}
            </section>
        </main>
    );
}
