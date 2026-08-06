-- Twitch streaming support: run this once in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)

ALTER TABLE users ADD COLUMN IF NOT EXISTS twitch_handle TEXT;

-- Optional but recommended: one twitch handle per account
CREATE UNIQUE INDEX IF NOT EXISTS users_twitch_handle_unique
    ON users (LOWER(twitch_handle))
    WHERE twitch_handle IS NOT NULL;
