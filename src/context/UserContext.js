"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load user session on mount
    useEffect(() => {
        const storedSession = localStorage.getItem('iracing_betting_session');
        if (storedSession) {
            try {
                const sessionUser = JSON.parse(storedSession);
                // Fetch fresh user data from database
                fetchUserData(sessionUser.username);
            } catch (error) {
                console.error('Error loading session:', error);
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, []);

    const fetchUserData = async (username) => {
        try {
            const response = await fetch(`/api/users?username=${encodeURIComponent(username)}`);
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
                localStorage.setItem('iracing_betting_session', JSON.stringify(userData));
            } else {
                // User not found in database, clear session
                localStorage.removeItem('iracing_betting_session');
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        } finally {
            setLoading(false);
        }
    };

    const login = async (username, password) => {
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, action: 'login' })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setUser(data.user);
                localStorage.setItem('iracing_betting_session', JSON.stringify(data.user));
                return { success: true };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error' };
        }
    };

    const register = async (username, email, password) => {
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, action: 'signup' })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setUser(data.user);
                localStorage.setItem('iracing_betting_session', JSON.stringify(data.user));
                return { success: true };
            } else {
                return { success: false, error: data.error || 'Registration failed' };
            }
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Network error' };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('iracing_betting_session');
    };

    const updateUserBalance = (amount) => {
        if (!user) return;
        // Optimistic update
        const updatedUser = { ...user, balance: parseFloat(user.balance) + amount };
        setUser(updatedUser);
        localStorage.setItem('iracing_betting_session', JSON.stringify(updatedUser));

        // Refresh from database to ensure consistency
        setTimeout(() => fetchUserData(user.username), 1000);
    };

    const refreshUser = () => {
        if (user) {
            fetchUserData(user.username);
        }
    };

    const resetBalance = () => {
        // This would need a backend endpoint to reset balance
        // For now, just refresh user data
        if (user) {
            fetchUserData(user.username);
        }
    };

    return (
        <UserContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            updateUserBalance,
            refreshUser,
            resetBalance,
            setUser
        }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => useContext(UserContext);
