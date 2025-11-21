require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());

// In-memory cache for race data (still useful for quick access)
const raceCache = new Map();
let telemetryProcess = null;

// ============================================================================
// RACE DATA ENDPOINTS
// ============================================================================

// Get race data
app.get('/api/race-data', async (req, res) => {
    try {
        const { raceId } = req.query;

        if (raceId) {
            // Get specific race from database
            const result = await pool.query(
                'SELECT * FROM races WHERE id = $1',
                [raceId]
            );

            if (result.rows.length > 0) {
                return res.json(result.rows[0].data);
            }
        }

        // Get default race (most recent)
        const result = await pool.query(
            'SELECT * FROM races ORDER BY last_updated DESC LIMIT 1'
        );

        if (result.rows.length > 0) {
            return res.json(result.rows[0].data);
        }

        res.status(404).json({ error: 'No race data available' });
    } catch (error) {
        console.error('Error fetching race data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all active races
app.get('/api/races', async (req, res) => {
    try {
        // Get races updated in last hour
        const result = await pool.query(
            `SELECT id, name, track, source, last_updated 
             FROM races 
             WHERE last_updated > NOW() - INTERVAL '1 hour'
             ORDER BY last_updated DESC`
        );

        const races = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            track: row.track,
            source: row.source,
            lastUpdate: row.last_updated
        }));

        res.json({ races });
    } catch (error) {
        console.error('Error fetching races:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update or create race data
app.post('/api/race-data', async (req, res) => {
    try {
        const { raceId, name, track, source, data } = req.body;

        await pool.query(
            `INSERT INTO races (id, name, track, source, data, last_updated)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (id) 
             DO UPDATE SET 
                name = $2,
                track = $3,
                data = $4,
                last_updated = NOW()`,
            [raceId, name, track, source, JSON.stringify(data)]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating race data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================================
// TELEMETRY ENDPOINTS
// ============================================================================

// Start telemetry
app.post('/api/start-telemetry', (req, res) => {
    if (telemetryProcess) {
        return res.status(400).json({ error: 'Telemetry already running' });
    }

    try {
        const scriptPath = path.join(__dirname, 'fetch_iracing_data.py');
        telemetryProcess = spawn('python3', [scriptPath]);

        const raceId = `broadcast_${Date.now()}`;

        telemetryProcess.stdout.on('data', async (data) => {
            try {
                const raceData = JSON.parse(data.toString());

                // Store in database
                await pool.query(
                    `INSERT INTO races (id, name, track, source, data, last_updated)
                     VALUES ($1, $2, $3, $4, $5, NOW())
                     ON CONFLICT (id) 
                     DO UPDATE SET data = $4, last_updated = NOW()`,
                    [
                        raceId,
                        'My Broadcast',
                        raceData.WeekendInfo?.TrackDisplayName || 'Unknown',
                        'broadcast',
                        JSON.stringify(raceData)
                    ]
                );
            } catch (err) {
                console.error('Error processing telemetry data:', err);
            }
        });

        telemetryProcess.on('error', (error) => {
            console.error('Telemetry error:', error);
            telemetryProcess = null;
        });

        telemetryProcess.on('close', () => {
            telemetryProcess = null;
        });

        res.json({
            success: true,
            message: 'Telemetry started',
            raceId
        });
    } catch (error) {
        console.error('Error starting telemetry:', error);
        res.status(500).json({ error: 'Failed to start telemetry' });
    }
});

// Stop telemetry
app.post('/api/stop-telemetry', (req, res) => {
    if (telemetryProcess) {
        telemetryProcess.kill();
        telemetryProcess = null;
        res.json({ success: true, message: 'Telemetry stopped' });
    } else {
        res.status(400).json({ error: 'No telemetry running' });
    }
});

// ============================================================================
// CHAT ENDPOINTS
// ============================================================================

// Get chat messages
app.get('/api/chat', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100'
        );

        const messages = result.rows.reverse().map(row => ({
            username: row.username,
            message: row.message,
            timestamp: row.created_at
        }));

        res.json({ messages });
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Post chat message
app.post('/api/chat', async (req, res) => {
    try {
        const { username, message } = req.body;

        const result = await pool.query(
            'INSERT INTO chat_messages (username, message) VALUES ($1, $2) RETURNING *',
            [username, message]
        );

        res.json({
            success: true,
            message: {
                username: result.rows[0].username,
                message: result.rows[0].message,
                timestamp: result.rows[0].created_at
            }
        });
    } catch (error) {
        console.error('Error posting chat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================================
// USER & BETTING ENDPOINTS
// ============================================================================

// Get user
app.get('/api/user', async (req, res) => {
    try {
        const { username } = req.query;

        if (!username) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const result = await pool.query(
            'SELECT id, username, email, balance, created_at FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create user (signup)
app.post('/api/user/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Simple password hashing (use bcrypt in production!)
        const passwordHash = Buffer.from(password).toString('base64');

        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, balance',
            [username, email, passwordHash]
        );

        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Place bet
app.post('/api/bets', async (req, res) => {
    try {
        const { userId, raceId, driverName, betType, stake, odds, potentialPayout } = req.body;

        // Check user balance
        const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
        if (userResult.rows[0].balance < stake) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Deduct stake from balance
        await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [stake, userId]);

        // Create bet
        const result = await pool.query(
            `INSERT INTO bets (user_id, race_id, driver_name, bet_type, stake, odds, potential_payout)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [userId, raceId, driverName, betType, stake, odds, potentialPayout]
        );

        res.json({ success: true, bet: result.rows[0] });
    } catch (error) {
        console.error('Error placing bet:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user bets
app.get('/api/bets', async (req, res) => {
    try {
        const { userId } = req.query;

        const result = await pool.query(
            'SELECT * FROM bets WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        res.json({ bets: result.rows });
    } catch (error) {
        console.error('Error fetching bets:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📊 Database connected: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
    console.log(`🌍 CORS origin: ${process.env.CORS_ORIGIN || '*'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (telemetryProcess) {
        telemetryProcess.kill();
    }
    pool.end();
    process.exit(0);
});
