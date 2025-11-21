# Quick Deployment Steps

## What You Need to Do:

### 1. Commit Changes in GitHub Desktop

1. Open **GitHub Desktop**
2. You should see all the new files in the "Changes" tab:
   - `src/lib/supabase.js`
   - `src/app/api/users/route.js`
   - `src/app/api/bets/route.js`
   - `src/context/UserContext.js` (modified)
   - `src/components/Auth/Login.js` (modified)
   - And more...

3. In the **Summary** field (bottom left), type:
   ```
   feat: Add database integration with Supabase
   ```

4. Click **Commit to main**

### 2. Push to GitHub

1. Click the **Push origin** button at the top
2. Wait for it to upload (30-60 seconds)

### 3. Vercel Auto-Deploys

1. Vercel will automatically detect the push
2. It will start building (takes 2-3 minutes)
3. You can watch progress at: https://vercel.com/dashboard

### 4. Test Your Site

Once deployed, try:
1. Visit your site: `https://iracingbets.com`
2. Click **Sign Up**
3. Create a new account with:
   - Username: `testuser`
   - Password: `password123`
4. If successful, you'll be logged in!

### 5. Verify in Database

Check Supabase to see if the user was created:
1. Go to Supabase dashboard
2. Click **Table Editor**
3. Click **users** table
4. You should see your new user!

---

**Let me know when you've pushed to GitHub and I'll help you test!**
