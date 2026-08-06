"use client";

import React, { useState, useEffect, useRef } from 'react';
import styles from './StreamView.module.css';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/components/Toast/ToastContext';

// ============================================================
// StreamView — live Twitch POVs for race night.
// Video is served entirely by Twitch embeds (zero Vercel/Supabase
// bandwidth); this component just decides WHAT to embed.
//  • POV picker chips for everyone who's live
//  • Multi-view grid (up to 4 streams side by side)
//  • Inline "link your Twitch" setup for logged-in users
// ============================================================

export default function StreamView() {
    const { user, refreshUser } = useUser();
    const toast = useToast();
    const [streams, setStreams] = useState([]);
    const [configured, setConfigured] = useState(true);
    const [selected, setSelected] = useState(null);   // channel name
    const [multiView, setMultiView] = useState(false);
    const [showLink, setShowLink] = useState(false);
    const [handleInput, setHandleInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [parent, setParent] = useState(null);
    const selectedRef = useRef(null);
    selectedRef.current = selected;

    // Twitch embeds require the hosting domain as ?parent=
    useEffect(() => {
        setParent(window.location.hostname);
    }, []);

    useEffect(() => {
        const fetchStreams = async () => {
            try {
                const res = await fetch('/api/streams');
                if (!res.ok) return;
                const data = await res.json();
                setConfigured(data.configured !== false);
                const list = data.streams || [];
                setStreams(list);
                // keep selection valid; default to most-viewed stream
                if (list.length > 0 && !list.some(s => s.channel === selectedRef.current)) {
                    setSelected(list[0].channel);
                }
            } catch { /* fail soft */ }
        };

        fetchStreams();
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') fetchStreams();
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const saveHandle = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const res = await fetch('/api/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, twitchHandle: handleInput })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(handleInput.trim() ? 'Twitch linked! Go live in OBS and you\'ll show up here.' : 'Twitch unlinked.');
                setShowLink(false);
                refreshUser && refreshUser();
            } else {
                toast.error(data.error || 'Could not save Twitch handle');
            }
        } catch {
            toast.error('Could not save Twitch handle');
        } finally {
            setSaving(false);
        }
    };

    const embedUrl = (channel) =>
        `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&muted=true&autoplay=true`;

    const gridStreams = multiView ? streams.slice(0, 4) : [];
    const single = streams.find(s => s.channel === selected) || streams[0];

    // Nothing configured and nothing to show: still offer linking so the
    // feature bootstraps itself once the env vars are set.
    const linkForm = user && (
        <div className={styles.linkRow}>
            {showLink ? (
                <>
                    <input
                        className={styles.linkInput}
                        placeholder="your twitch username"
                        value={handleInput}
                        onChange={(e) => setHandleInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveHandle()}
                    />
                    <button className={styles.linkBtn} onClick={saveHandle} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className={styles.linkCancel} onClick={() => setShowLink(false)}>Cancel</button>
                </>
            ) : (
                <button
                    className={styles.linkBtn}
                    onClick={() => { setHandleInput(user.twitch_handle || ''); setShowLink(true); }}
                >
                    {user.twitch_handle ? `🔗 Twitch: ${user.twitch_handle}` : '🔗 Link your Twitch to stream'}
                </button>
            )}
        </div>
    );

    if (!parent) return null;

    if (streams.length === 0) {
        // Slim bar: invite people to stream (hidden entirely if feature unconfigured and no user)
        if (!configured && !user) return null;
        return (
            <div className={styles.emptyBar}>
                <span className={styles.emptyText}>
                    📺 {configured ? 'No one is streaming this race yet.' : 'Streaming setup pending.'}
                    {' '}In the race or spectating? Stream your POV with OBS → Twitch and it shows up here.
                </span>
                {linkForm}
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    <span className={styles.liveDot} />
                    Live Race Streams
                    <span className={styles.count}>{streams.length} POV{streams.length > 1 ? 's' : ''}</span>
                </h3>
                <div className={styles.headerActions}>
                    {streams.length > 1 && (
                        <button
                            className={`${styles.multiBtn} ${multiView ? styles.multiActive : ''}`}
                            onClick={() => setMultiView(!multiView)}
                        >
                            {multiView ? 'Single view' : `Multi-view (${Math.min(streams.length, 4)})`}
                        </button>
                    )}
                    {linkForm}
                </div>
            </div>

            {/* POV picker */}
            {!multiView && streams.length > 1 && (
                <div className={styles.povRow}>
                    {streams.map(s => (
                        <button
                            key={s.channel}
                            className={`${styles.povChip} ${single?.channel === s.channel ? styles.povActive : ''}`}
                            onClick={() => setSelected(s.channel)}
                        >
                            <span className={styles.povLive}>LIVE</span>
                            {s.username}
                            {s.isRacing && <span className={styles.povTag}>🏎️</span>}
                            <span className={styles.povViewers}>👁 {s.viewers}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Player(s) */}
            {multiView ? (
                <div className={styles.grid} data-count={gridStreams.length}>
                    {gridStreams.map(s => (
                        <div key={s.channel} className={styles.gridCell}>
                            <div className={styles.gridLabel}>{s.username}</div>
                            <div className={styles.playerWrap}>
                                <iframe
                                    src={embedUrl(s.channel)}
                                    allowFullScreen
                                    title={`${s.username}'s stream`}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                single && (
                    <div className={styles.playerWrap}>
                        <iframe
                            src={embedUrl(single.channel)}
                            allowFullScreen
                            title={`${single.username}'s stream`}
                        />
                    </div>
                )
            )}
        </div>
    );
}
