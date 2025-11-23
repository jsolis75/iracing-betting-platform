"use client";

import React, { useState } from 'react';
import styles from './Login.module.css';
import { useUser } from '@/context/UserContext';

const Login = () => {
    const { login, register } = useUser();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            setError('Please fill in all fields');
            return;
        }

        let result;
        if (isLogin) {
            result = await login(username, password);
        } else {
            result = await register(username, '', password); // Email optional for now
        }

        if (!result.success) {
            setError(result.error);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.title}>{isLogin ? 'Login' : 'Create Account'}</h1>
                {error && <div className={styles.error}>{error}</div>}
                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Username</label>
                        <input
                            type="text"
                            className={styles.input}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Password</label>
                        <input
                            type="password"
                            className={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button type="submit" className={styles.button}>
                        {isLogin ? 'Login' : 'Sign Up'}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={async () => {
                            const randomId = Math.floor(Math.random() * 100000);
                            const guestUser = `Guest_${randomId}`;
                            const guestPass = `guest_${randomId}`;
                            const result = await register(guestUser, '', guestPass);
                            if (!result.success) setError(result.error);
                        }}
                        style={{ backgroundColor: '#4a5568' }}
                    >
                        Play as Guest (No Signup)
                    </button>
                </div>
                <div className={styles.switchMode}>
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <span className={styles.link} onClick={() => setIsLogin(!isLogin)}>
                        {isLogin ? 'Sign Up' : 'Login'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default Login;
