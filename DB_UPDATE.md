# Database Schema Update (Fix)

I missed one column in the previous update! The error you are seeing is because the `status` column is missing.

## Run this SQL in Supabase SQL Editor:

```sql
-- Add the missing status column
ALTER TABLE races 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Just in case, make sure these are there too (it won't hurt to run again)
ALTER TABLE races 
ADD COLUMN IF NOT EXISTS iracing_session_id TEXT,
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data JSONB;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_races_session_id ON races(iracing_session_id);
CREATE INDEX IF NOT EXISTS idx_races_status_updated ON races(status, last_updated);
```

## How to run:
1. Go to Supabase Dashboard
2. Click **SQL Editor** (on the left)
3. Paste the code above
4. Click **Run**

After you run this, the "API Error 500" should disappear and the broadcast will work!
