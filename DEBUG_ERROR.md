# Debugging Internal Server Error

## Check Vercel Logs

1. Go to https://vercel.com/dashboard
2. Click your project
3. Click **Logs** or **Runtime Logs**
4. Try to sign up again on your site
5. Look for error messages in the logs

**Common errors to look for:**
- "Missing Supabase environment variables"
- "Database connection string not configured"
- Connection errors to Supabase

## Verify Environment Variables

Go to Vercel → Settings → Environment Variables and verify you have:

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Should look like: `https://xxxxx.supabase.co`
   
2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Should be a long string starting with `eyJ...`
   
3. **POSTGRES1_URL**
   - Should look like: `postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres`

## Test Database Connection in Supabase

1. Go to Supabase dashboard
2. Click **SQL Editor**
3. Run this query:
   ```sql
   SELECT * FROM users;
   ```
4. Does it work? If not, the database might not be set up correctly.

## Quick Fix: Use Supabase Client Instead

The issue might be with the `pg` connection. Let me create a version that uses Supabase's client library instead, which is simpler.

---

**What do the Vercel logs say?** Copy and paste any error messages you see!
