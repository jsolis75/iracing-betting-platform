-- Create multiplayer_lobbies table
CREATE TABLE IF NOT EXISTS multiplayer_lobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'live', 'finished', 'tiebreaker', 'settled'
    prize_pool DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(race_id)
);

-- Create multiplayer_entries table
CREATE TABLE IF NOT EXISTS multiplayer_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id UUID REFERENCES multiplayer_lobbies(id),
    user_id INTEGER REFERENCES users(id),
    driver_1 TEXT,
    driver_2 TEXT,
    driver_3 TEXT,
    captain_driver TEXT,
    score DECIMAL(10, 2) DEFAULT 0,
    rps_choice TEXT, -- 'rock', 'paper', 'scissors'
    wants_rps BOOLEAN,
    status TEXT DEFAULT 'active', -- 'active', 'eliminated' (for RPS)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lobby_id, user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_multiplayer_entries_lobby ON multiplayer_entries(lobby_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_race ON multiplayer_lobbies(race_id);
