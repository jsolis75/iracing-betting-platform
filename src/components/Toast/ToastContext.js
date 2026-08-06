"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ============================================================
// Toast notification system — replaces browser alert() popups.
// Usage:  const toast = useToast();  toast.success('Bet placed!');
// ============================================================

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const dismiss = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
    }, []);

    const push = useCallback((type, message, duration = 4000) => {
        const id = ++idCounter;
        setToasts(prev => [...prev.slice(-4), { id, type, message }]); // max 5 visible
        timersRef.current[id] = setTimeout(() => dismiss(id), duration);
        return id;
    }, [dismiss]);

    const api = {
        success: (msg, ms) => push('success', msg, ms),
        error: (msg, ms) => push('error', msg, ms),
        info: (msg, ms) => push('info', msg, ms),
        dismiss,
    };

    const icon = (type) =>
        type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="toastStack" role="status" aria-live="polite">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast toast-${t.type}`}
                        onClick={() => dismiss(t.id)}
                    >
                        <span className="toastIcon">{icon(t.type)}</span>
                        <span className="toastMsg">{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    // Fallback so components never crash if provider is missing (e.g. tests):
    if (!ctx) {
        return {
            success: (m) => console.log('[toast]', m),
            error: (m) => console.warn('[toast]', m),
            info: (m) => console.log('[toast]', m),
            dismiss: () => { },
        };
    }
    return ctx;
}
