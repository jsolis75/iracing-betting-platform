-- Tier List feature: run this in Supabase SQL editor BEFORE deploying the code
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)

CREATE TABLE IF NOT EXISTS tier_votes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    category TEXT NOT NULL,
    driver_key TEXT NOT NULL,      -- iRacing customer id
    driver_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, category, driver_key)
);

CREATE INDEX IF NOT EXISTS tier_votes_category_idx ON tier_votes (category, driver_key);
