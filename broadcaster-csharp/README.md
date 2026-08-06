# iRacing Broadcaster (C#)

A standalone Windows executable that broadcasts iRacing telemetry data to
**https://iracingbets.com**. This is a full port of `broadcast_telemetry.py`
(the Python script): it parses the sim's session info (WeekendInfo,
SessionInfo, DriverInfo — drivers, positions, results) and reads live
telemetry (session flags, state, laps/time remaining) directly from
iRacing's shared memory, then POSTs it to `/api/telemetry/ingest` every
5 seconds. No Python, no dependencies — users just download and run it.

## For users

1. Download `iRacingBroadcaster.exe`
2. Double-click to run (if Windows SmartScreen warns, click "More info" → "Run anyway")
3. Start or join an iRacing session (be in the car or spotting, not just the UI)
4. The app shows `[OK] Connected to iRacing! Broadcasting data...` and iracingbets.com goes live

## Building

Pushing changes in this folder to GitHub builds the exe automatically via
GitHub Actions (`.github/workflows/build-broadcaster.yml`) and publishes it at:

```
https://github.com/jsolis75/iracing-betting-platform/releases/download/broadcaster-latest/iRacingBroadcaster.exe
```

To build locally instead (requires .NET 8 SDK):

```bash
dotnet publish -c Release
# output: bin/Release/net8.0/win-x64/publish/iRacingBroadcaster.exe
```

## Advanced

- `--url <api-url>` or env var `IRACINGBETS_API_URL` — override the target API (for testing)
- `--test-yaml <file>` — parse a session-info YAML file and print the JSON payload (development)
