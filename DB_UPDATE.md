# Database Schema Update

To make the free broadcasting work, we need to update the `races` table to support the new fields.

## Run this SQL in Supabase SQL Editor:

```sql
-- Add columns for iRacing integration if they don't exist
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

Let me know when you've done this!
