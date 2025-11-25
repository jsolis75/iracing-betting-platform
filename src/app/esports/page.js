import React from 'react';

export default function EsportsPage() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '80vh',
            color: 'var(--text-primary)',
            textAlign: 'center'
        }}>
            <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--primary-blue)' }}>Coming Soon</h1>
            <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>
                eNASCAR Coca Cola Series Betting coming soon
            </p>
        </div>
    );
}
