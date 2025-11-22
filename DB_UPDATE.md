# Database Schema Update (Parlay Fix)

To show the details of a parlay (which drivers you picked), we need to add a `details` column to the `bets` table.

## Run this SQL in Supabase SQL Editor:

```sql
-- Add details column for storing parlay legs
ALTER TABLE bets 
ADD COLUMN IF NOT EXISTS details JSONB;
```

## How to run:
1. Clear the SQL Editor.
2. Paste the code above.
3. Click **Run**.

This will allow us to save exactly which drivers are in your parlay!
