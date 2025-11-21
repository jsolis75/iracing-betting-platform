"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [users, setUsers] = useState([]); // In-memory user store for demo

    // Load users from local storage or mock data on mount
    useEffect(() => {
        const storedUsers = localStorage.getItem('iracing_betting_users');
        if (storedUsers) {
            setUsers(JSON.parse(storedUsers));
        } else {
            // Default demo user
            const demoUser = {
                username: 'DemoUser',
                password: 'password',
                balance: 1000.00,
                betHistory: []
            };
            setUsers([demoUser]);
            localStorage.setItem('iracing_betting_users', JSON.stringify([demoUser]));
        }

        // Restore logged-in user session if it exists
        const storedSession = localStorage.getItem('iracing_betting_session');
        if (storedSession) {
            const sessionUser = JSON.parse(storedSession);
            setUser(sessionUser);
        }
    }, []);

    const login = (username, password) => {
        const foundUser = users.find(u => u.username === username && u.password === password);
        if (foundUser) {
            setUser(foundUser);
            localStorage.setItem('iracing_betting_session', JSON.stringify(foundUser));
            return { success: true };
        }
        return { success: false, error: 'Invalid credentials' };
    };

    const register = (username, password) => {
        if (users.some(u => u.username === username)) {
            return { success: false, error: 'Username already exists' };
        }
        const newUser = {
            username,
            password,
            balance: 1000.00, // Starting balance
            betHistory: []
        };
        const updatedUsers = [...users, newUser];
        setUsers(updatedUsers);
        localStorage.setItem('iracing_betting_users', JSON.stringify(updatedUsers));
        setUser(newUser);
        localStorage.setItem('iracing_betting_session', JSON.stringify(newUser));
        return { success: true };
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('iracing_betting_session');
    };

    const updateUserBalance = (amount) => {
        if (!user) return;
        const updatedUser = { ...user, balance: user.balance + amount };
        setUser(updatedUser);
        localStorage.setItem('iracing_betting_session', JSON.stringify(updatedUser));

        const updatedUsers = users.map(u => u.username === user.username ? updatedUser : u);
        setUsers(updatedUsers);
        localStorage.setItem('iracing_betting_users', JSON.stringify(updatedUsers));
    };

    const addBetToHistory = (bet) => {
        if (!user) return;
        const updatedUser = { ...user, betHistory: [...user.betHistory, bet] };
        setUser(updatedUser);
        localStorage.setItem('iracing_betting_session', JSON.stringify(updatedUser));

        const updatedUsers = users.map(u => u.username === user.username ? updatedUser : u);
        setUsers(updatedUsers);
        localStorage.setItem('iracing_betting_users', JSON.stringify(updatedUsers));
    };

    const resetBalance = () => {
        if (!user) return;
        const updatedUser = { ...user, balance: 1000.00 };
        setUser(updatedUser);
        localStorage.setItem('iracing_betting_session', JSON.stringify(updatedUser));

        const updatedUsers = users.map(u => u.username === user.username ? updatedUser : u);
        setUsers(updatedUsers);
        localStorage.setItem('iracing_betting_users', JSON.stringify(updatedUsers));
    };

    return (
        <UserContext.Provider value={{ user, login, register, logout, updateUserBalance, addBetToHistory, resetBalance, users, setUser, setUsers }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => useContext(UserContext);
