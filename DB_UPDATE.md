# Database Schema Update (The "Source" Fix)

We are almost there! The error now is about the `source` column. It was defined as "Required" in the original setup, but we aren't sending it.

## Run this SQL in Supabase SQL Editor:

```sql
-- 1. Set a default value for 'source' so it's not null
ALTER TABLE races 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'broadcast';

ALTER TABLE races 
ALTER COLUMN source SET DEFAULT 'broadcast';

-- 2. Re-run these just to be absolutely sure everything else is set
ALTER TABLE races ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE races ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
```

## How to run:
1. Clear the SQL Editor.
2. Paste the code above.
3. Click **Run**.

This sets a default value of "broadcast" for the source column, which satisfies the requirement!
