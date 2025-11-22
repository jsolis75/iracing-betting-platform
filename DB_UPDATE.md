# Database Schema Update (Complete)

You can **clear** your SQL editor and just run this **one block of code**. It contains everything needed and is safe to run even if you ran parts of it before.

## Copy and Paste this into Supabase SQL Editor:

```sql
-- 1. Enable UUID extension (needed for random IDs)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Add all necessary columns (safe to run multiple times)
ALTER TABLE races ADD COLUMN IF NOT EXISTS iracing_session_id TEXT;
ALTER TABLE races ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;
ALTER TABLE races ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE races ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 3. Fix the ID column to auto-generate a UUID if one isn't provided
ALTER TABLE races ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_races_session_id ON races(iracing_session_id);
CREATE INDEX IF NOT EXISTS idx_races_status_updated ON races(status, last_updated);
```

## How to run:
1. Delete whatever is currently in the SQL Editor.
2. Paste the code above.
3. Click **Run**.

This will ensure your database is 100% ready for the broadcast!
