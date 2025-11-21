"use client";

import React from 'react';
import BettingHistory from '@/components/Profile/BettingHistory';
import { useUser } from '@/context/UserContext';
import Login from '@/components/Auth/Login';

const ProfilePage = () => {
    const { user, logout } = useUser();

    if (!user) return <Login />;

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

            <BettingHistory />
        </div>
    );
};

export default ProfilePage;
