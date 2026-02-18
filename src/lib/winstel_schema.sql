-- Create winstel_drivers table
CREATE TABLE IF NOT EXISTS winstel_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    team TEXT NOT NULL,
    car_number TEXT NOT NULL,
    irating INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, car_number)
);

-- Create winstel_events table (tracks each race week)
CREATE TABLE IF NOT EXISTS winstel_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g. "Week 1: Daytona"
    track_name TEXT,
    status TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming', 'live', 'finished', 'settled'
    race_id UUID, -- Link to telemetry race if applicable
    event_order INTEGER NOT NULL UNIQUE,
    race_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winstel_salaries table
CREATE TABLE IF NOT EXISTS winstel_salaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES winstel_events(id),
    driver_id UUID REFERENCES winstel_drivers(id),
    salary INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, driver_id)
);

-- Create winstel_entries table (6 drivers per user)
CREATE TABLE IF NOT EXISTS winstel_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES winstel_events(id),
    user_id INTEGER REFERENCES users(id),
    driver_ids UUID[] NOT NULL, -- Array of 6 driver IDs
    score DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- Create winstel_standings table (season-long tracking)
CREATE TABLE IF NOT EXISTS winstel_standings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) UNIQUE,
    total_score DECIMAL(10, 2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_winstel_entries_event ON winstel_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_winstel_salaries_event ON winstel_salaries(event_id);
