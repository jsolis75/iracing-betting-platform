# How to Broadcast iRacing Data

Since we are using a **free** setup, you will run a small script on your PC to send data to your website.

## Step 1: Deploy Website Updates

1. Open **GitHub Desktop**
2. You should see changes for:
   - `src/app/api/race-data/route.js`
   - `src/app/api/telemetry/ingest/route.js`
   - `broadcast_telemetry.py`
3. **Summary**: `feat: Add local broadcasting support`
4. **Commit to main**
5. **Push origin**
6. Wait 2-3 minutes for Vercel to deploy.

## Step 2: Install Python & Requirements

You need Python installed on your computer to run the broadcaster.

1. **Install Python** (if you haven't):
   - Download from [python.org](https://www.python.org/downloads/)
   - **IMPORTANT**: Check the box **"Add Python to PATH"** during installation.

2. **Install Libraries**:
   Open PowerShell (Terminal) and run:
   ```powershell
   pip install irsdk requests
   ```

## Step 3: Start Broadcasting

Whenever you are racing and want to stream data to your site:

1. Open PowerShell
2. Navigate to your project folder:
   ```powershell
   cd C:\Users\jsoli\.gemini\antigravity\scratch\iracing-betting-platform
   ```
3. Run the script:
   ```powershell
   python broadcast_telemetry.py
   ```

4. **Start iRacing**:
   - Join a session.
   - The script will say `✅ Connected to iRacing! Broadcasting data...`
   - Your website (`iracingbets.com`) will now show live data!

---

**Troubleshooting**:
- If script says "Waiting for iRacing...", make sure the sim is actually running (you are in the car or spotting).
- If script says "API Error", check your internet connection.
