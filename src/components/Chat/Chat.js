'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';

const Chat = () => {
    const [isMinimized, setIsMinimized] = useState(true);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [username, setUsername] = useState('Guest');
    const messagesEndRef = useRef(null);

    // Fetch username from user context/API
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch('/api/user');
                if (res.ok) {
                    const data = await res.json();
                    setUsername(data.username || 'Guest');
                }
            } catch (err) {
                console.error('Failed to fetch user:', err);
            }
        };
        fetchUser();
    }, []);

    // Fetch messages on mount and poll every 2 seconds
    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const res = await fetch('/api/chat');
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages || []);
                }
            } catch (err) {
                console.error('Failed to fetch messages:', err);
            }
        };

        fetchMessages();
        const interval = setInterval(fetchMessages, 2000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, message: inputValue }),
            });

            if (res.ok) {
                setInputValue('');
                // Messages will be updated by polling
            }
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Generate consistent color for username
    const getUserColor = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 60%)`;
    };

    return (
        <div className={`${styles.chatContainer} ${isMinimized ? styles.minimized : ''}`}>
            <div
                className={styles.chatHeader}
                onClick={() => setIsMinimized(!isMinimized)}
            >
                <span className={styles.headerTitle}>💬 Global Chat</span>
                <span className={styles.toggleIcon}>
                    {isMinimized ? '▲' : '▼'}
                </span>
            </div>

            {!isMinimized && (
                <>
                    <div className={styles.messagesContainer}>
                        {messages.length === 0 ? (
                            <div className={styles.emptyState}>
                                No messages yet. Start the conversation!
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={styles.message}>
                                    <span
                                        className={styles.messageUser}
                                        style={{ color: getUserColor(msg.username) }}
                                    >
                                        {msg.username}:
                                    </span>
                                    <span className={styles.messageText}>{msg.message}</span>
                                    <span className={styles.messageTime}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className={styles.inputContainer}>
                        <input
                            type="text"
                            className={styles.messageInput}
                            placeholder="Type a message..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                        />
                        <button
                            className={styles.sendButton}
                            onClick={handleSend}
                        >
                            Send
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default Chat;
