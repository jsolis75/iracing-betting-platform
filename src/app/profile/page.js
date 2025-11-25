"use client";

import React, { useState } from 'react';
import DriverStats from '@/components/Profile/DriverStats';
import BettingHistory from '@/components/Profile/BettingHistory';
import FantasyHistory from '@/components/Profile/FantasyHistory';
import { useUser } from '@/context/UserContext';
import Login from '@/components/Auth/Login';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const ProfilePage = () => {
    const { user, logout, loading } = useUser();
    const [activeTab, setActiveTab] = useState('betting');
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Loading profile...</div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800' }}>My Profile</h1>
                <button
                    onClick={logout}
                    style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: 'var(--status-error)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '700'
                    }}
                >
                    Logout
                </button>
            </div>

            <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--background-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Account Summary</h2>
                <div style={{ display: 'flex', gap: '2rem' }}>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '700' }}>Username</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>{user.username}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '700' }}>Balance</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--primary-blue)' }}>${user.balance.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <DriverStats />

            {/* History Tabs */}
            <div style={{ marginTop: '2rem', marginBottom: '1rem', borderBottom: '2px solid var(--border-color)' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setActiveTab('betting')}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: activeTab === 'betting' ? 'var(--primary-blue)' : 'transparent',
                            color: activeTab === 'betting' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderBottom: activeTab === 'betting' ? '3px solid var(--primary-blue)' : 'none',
                            cursor: 'pointer',
                            fontWeight: '700',
                            transition: 'all 0.2s'
                        }}
                    >
                        Betting History
                    </button>
                    <button
                        onClick={() => setActiveTab('fantasy')}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: activeTab === 'fantasy' ? 'var(--primary-blue)' : 'transparent',
                            color: activeTab === 'fantasy' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderBottom: activeTab === 'fantasy' ? '3px solid var(--primary-blue)' : 'none',
                            cursor: 'pointer',
                            fontWeight: '700',
                            transition: 'all 0.2s'
                        }}
                    >
                        Fantasy History
                    </button>
                </div>
            </div>

            {activeTab === 'betting' && <BettingHistory />}
            {activeTab === 'fantasy' && <FantasyHistory />}
        </div>
    );
};

export default ProfilePage;
