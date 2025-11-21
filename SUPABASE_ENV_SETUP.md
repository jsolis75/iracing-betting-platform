# Adding Supabase Environment Variables to Vercel

Before the database integration will work, you need to add these environment variables to Vercel:

## Step 1: Get Your Supabase Credentials

1. Go to your Supabase project: https://supabase.com/dashboard
2. Click on your project
3. Go to **Settings** → **API**
4. You'll need two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

## Step 2: Add to Vercel

1. Go to https://vercel.com/dashboard
2. Click on your **iracing-betting-platform** project
3. Go to **Settings** → **Environment Variables**
4. Add these THREE variables:

### Variable 1:
- **Key**: `NEXT_PUBLIC_SUPABASE_URL`
- **Value**: Your Supabase Project URL
- **Environments**: All three (Production, Preview, Development)

### Variable 2:
- **Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value**: Your Supabase anon/public key
- **Environments**: All three (Production, Preview, Development)

### Variable 3 (Already exists - just verify):
- **Key**: `POSTGRES1_URL`
- **Value**: Your Supabase connection string (postgresql://...)
- **Environments**: All three (Production, Preview, Development)

## Step 3: Redeploy

1. Go to **Deployments** tab
2. Click **...** on latest deployment
3. Click **Redeploy**
4. Wait 2-3 minutes

## Step 4: Test

Once deployed, try:
1. Visit your site
2. Click "Sign Up"
3. Create a new account
4. Check Supabase database to see if user was created:
   ```sql
   SELECT * FROM users;
   ```

---

**Let me know when you've added the environment variables and I'll help you test!**
