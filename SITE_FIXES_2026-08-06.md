# Site fixes & optimization — Aug 6, 2026

## What broke during your broadcast test (all fixed)

1. **`src/utils/oddsFactory.js`** — a variable (`currentPos`) was declared inside one block but used in another. The moment a live session's leader completed lap 1, the odds calculator threw a ReferenceError and the whole home page crashed. This is what "broke the website."
2. **`/api/race-data`** — could 500 for every user if a broadcast arrived with missing driver data.
3. **Practice sessions** — practice standings were being treated as race results (shown as positions, and even scored into Winstel fantasy). Now only a real Race session counts.
4. **"No active race" state** — the site used to build a fake LIVE race card out of the empty response; now it properly shows the "Waiting for Broadcast" screen.

## Bugs that were silently breaking features (all fixed)

- **Bet settlement never worked**: `/api/settle-race` never read `raceId` from the request → crashed on every call. Also its "is the race actually over?" check read a field that doesn't exist. Both fixed — bets should now actually settle after the checkered flag (with the existing 60s delay).
- **Duplicate settlements**: the home page could fire settlement over and over due to a stale-state bug → fixed with a ref + timer cleanup.
- **Live Bets panel**: read fields that don't exist on DB rows (`bet.type`/`bet.driver`) so every bet showed "Waiting for driver..." → fixed. Also crashed on special (Yes/No) bets → fixed.
- **Profile → Fantasy History tab**: crashed instantly (two undeclared state variables) → fixed.
- **Profile → Betting History**: crashed on special bets → fixed; also stopped re-downloading race data it already had.
- **Fantasy settlement**: crashed mid-settlement while saving scores (wrong field name) → fixed.
- **Sidebar "Active Races"**: races disappeared the moment the green flag dropped (the filter mistook live positions for final results) → now races stay until cooldown.
- **Admin settle panel**: violated React's rules of hooks (could crash on login/logout) → fixed; also now polls only for you, not every user.
- **Betting exploit closed**: a negative stake could INCREASE a balance, and the payout amount was trusted from the client (free money). Stake is now validated and payout computed server-side.
- Assorted crash guards: Over/Under view, Results modal, My Contests, Winstel draft search, RaceCard stats display (win% always showed "No Data").

## Vercel bandwidth (fast origin transfer) — the big ones

- **`/api/driver-stats` was serving a ~90 MB JSON file** (530k drivers) to every homepage visitor. The homepage doesn't even need it (stats are injected per-driver by `/api/race-data`). The fetch is gone and the endpoint now requires specific driver IDs. This was very likely your biggest cost.
- **`/api/race-data` responses are ~70–90% smaller** — it now returns only the fields the site actually uses instead of echoing the entire raw iRacing payload.
- **CDN caching turned on** (`s-maxage`) for race-data/races/driver-stats: during a race, all users' polls in each 5s window are now served by Vercel's cache from ONE origin response, instead of every user hitting origin every time. Origin transfer becomes flat per interval no matter how many viewers you have.
- **Sidebar** was cache-busting every request (`?t=timestamp`) — guaranteed cache misses — and polling full race data every 10s on every page. Fixed + slowed to 30s.
- **Dead polling removed**: RaceCard fetched `/api/bet-stats` every 10s and never used the result.
- **Polls pause when the tab is hidden** (home page + sidebar), and the home poll went 8s → 10s.
- `/api/races` now pulls only the 3 fields it needs from Supabase instead of each race's full 100KB+ data blob.

Rough estimate: a 2-hour race with ~20 viewers was on the order of 2.5–4 GB of origin transfer before; it should now be tens of MB.

## Also worth doing (not code — your call)

- **Delete the exe files from the repo**: `iRacingBroadcaster.exe` + `iRacingBroadcaster-LATEST.exe` at the root, and `public/broadcast/` (~105 MB total). The sidebar download button now points at the GitHub release link, which auto-updates. Delete them in GitHub Desktop and commit.
- The broadcaster exe still needs the GitHub Actions workflow pushed (from earlier) for the release link to go live.

## Known remaining issues (documented, NOT fixed — bigger jobs)

- **Login has no real password check** — anyone can log in as any username. Fine for friends, not for strangers. Real fix = Supabase Auth.
- Admin endpoints (`fix-balances`, `recalculate-balance`, `reset-balance`, `manual-settle`, bets PUT) have no authentication.
- Balance updates are read-then-write (concurrent settlements can double-pay) — proper fix is a Postgres atomic increment function.
- The broadcast API key is hardcoded in the repo; move to env vars if the repo goes public... it already is public, so consider rotating it someday.
- `/api/broadcast` and `/api/start-telemetry` are dead/stale code paths that could be deleted.

---

# UI Upgrade — same day, round 2

## Mobile
- The site now works properly on phones: the sidebar becomes a bottom navigation bar (Live / Fantasy / Ranks / Profile), the bet slip becomes a slide-up drawer opened by a floating 🎟️ button (with a badge showing your picks), driver rows stack with labeled WIN / TOP 3 / TOP 10 / CRASH buttons, tables scroll horizontally, and background tabs stop polling.

## Light mode
- All hardcoded dark colors in inline styles were replaced with theme variables — light mode no longer shows random dark boxes.

## Live race feel
- Full-width animated flag banner (green / pulsing yellow caution / red / white / checkered pattern) with live lap count.
- Lap progress bar under the banner.
- Position change badges (▲2 / ▼1) appear when drivers gain/lose spots between updates.
- Odds buttons flash green/red when odds move.
- Drivers you have pending bets on get a gold "💰 Your bet" highlight.
- All browser alert() popups replaced with toast notifications (confirm dialogs kept native on purpose — they ask a question).

## Post-race recap
- When the checkered flag flies, the race card now shows a Race Recap: the podium (🥇🥈🥉), each of your bets with won/lost amounts, and your net result for the race ("🎉 You won $X!"). Pending bets show "settling…" until the server grades them (~60s after the flag).

## New files
- src/components/Toast/ToastContext.js (toast system)
- src/components/Betting/BetSlipDock.js (desktop column / mobile drawer wrapper)
- src/components/Race/RaceRecap.js + .module.css (recap screen)

Everything verified with a real browser: production build rendered with mocked live race data and screenshotted on desktop dark, desktop light, mobile, and post-race states.

---

# Round 3 — Live race streaming (Twitch-powered)

Anyone racing OR spectating can now stream their POV to the site, and viewers watch right next to the odds and bet slip. Twitch serves all the video (costs you zero bandwidth); the site handles discovery and embedding.

## How it works for users
1. On the site, click "🔗 Link your Twitch to stream" (in the streams bar on the race page) and enter their Twitch username — one time only.
2. Stream iRacing with OBS to their Twitch channel like normal.
3. Within ~a minute the site shows them under "Live Race Streams": viewers pick a POV, or hit Multi-view to watch up to 4 streams in a grid. 🏎️ marks streams currently playing iRacing.

## One-time setup for YOU (required before it works)
1. Run `ADD_TWITCH_STREAMING.sql` in the Supabase SQL editor (adds the twitch_handle column).
2. Create a free Twitch app at https://dev.twitch.tv/console/apps (category: Website Integration; any OAuth redirect URL is fine, e.g. https://localhost).
3. In Vercel → your project → Settings → Environment Variables, add:
   - `TWITCH_CLIENT_ID` = (from the Twitch app page)
   - `TWITCH_CLIENT_SECRET` = (click "New Secret" on the Twitch app page)
4. Redeploy. Until these are set, the feature stays hidden except the link button.

## New/changed files
- `ADD_TWITCH_STREAMING.sql` — run once in Supabase
- `src/app/api/streams/route.js` — checks which linked users are live (cached 45s server-side + CDN, so it's nearly free)
- `src/components/Streams/StreamView.js` + `.module.css` — POV picker, player, multi-view grid, link-your-twitch form
- `src/app/api/users/route.js` — twitch handle save/load (validates the handle, accepts pasted twitch.tv URLs)
- `src/app/page.js` — StreamView added to the race page

Note: Twitch streams run ~3-10 seconds behind the live telemetry, so positions on the site may update a moment before you see the pass on video. That's normal.
