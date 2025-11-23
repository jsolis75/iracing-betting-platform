// "use client" ensures this component runs on the client side
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import RaceCard from "@/components/Race/RaceCard";
import BetSlip from "@/components/Betting/BetSlip";
import LiveBets from "@/components/Betting/LiveBets";
import Login from "@/components/Auth/Login";
import { useUser } from "@/context/UserContext";
import { useBetting } from "@/context/BettingContext";

function HomeContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const selectedRaceId = searchParams.get('raceId');
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverStats, setDriverStats] = useState({}); // New: CSV stats storage
  const [hasSettled, setHasSettled] = useState(false); // Prevent multiple settlement calls

  const { settleBets } = useBetting();

  // Load driver stats from CSV on mount
  useEffect(() => {
    const loadDriverStats = async () => {
      try {
        const response = await fetch('/api/driver-stats');
        if (response.ok) {
          const data = await response.json();
          setDriverStats(data.stats || {});
        }
      } catch (error) {
        console.error('Error loading driver stats:', error);
      }
    };
    loadDriverStats();
  }, []);

  const lastModifiedRef = React.useRef(null);

  useEffect(() => {
    // If there is no authenticated user we don't attempt to load anything.
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchRaceData = async (signal) => {
      try {
        // Fetch from our API route with optional raceId parameter
        const url = selectedRaceId
          ? `/api/race-data?raceId=${selectedRaceId}`
          : `/api/race-data`;

        const headers = {};
        if (lastModifiedRef.current) {
          headers['If-Modified-Since'] = lastModifiedRef.current;
        }

        const response = await fetch(url, { signal, headers });

        if (response.status === 304) {
          // Data hasn't changed, skip processing
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch race data: ${response.status} `);
        }

        // Update Last-Modified for next request
        const newLastModified = response.headers.get('Last-Modified');
        if (newLastModified) {
          lastModifiedRef.current = newLastModified;
        }

        const data = await response.json();

        // ---------------------------------------------------------------
        // Determine the starting grid (qualifying positions) if the data provides it.
        // ---------------------------------------------------------------
        const qualifySession = data.SessionInfo?.Sessions?.find(
          (s) =>
            s.SessionName === "QUALIFY" ||
            s.SessionType === "Lone Qualify" ||
            s.SessionType === "Open Qualify"
        );
        const startPosMap = {};
        if (qualifySession && qualifySession.ResultsPositions) {
          qualifySession.ResultsPositions.forEach((p) => {
            startPosMap[p.CarIdx] = p.Position;
          });
        }

        // ---------------------------------------------------------------
        // Get current running positions from the Race session
        // ---------------------------------------------------------------
        // ---------------------------------------------------------------
        // Get current running positions from the Active session
        // ---------------------------------------------------------------
        // Try to find Race, then Practice, then Qualify, or default to the last session
        let activeSession = data.SessionInfo?.Sessions?.find((s) => s.SessionType === "Race");
        if (!activeSession) {
          activeSession = data.SessionInfo?.Sessions?.find((s) => s.SessionType === "Practice");
        }
        if (!activeSession) {
          activeSession = data.SessionInfo?.Sessions?.find((s) => s.SessionType === "Open Qualify" || s.SessionType === "Lone Qualify");
        }
        // Fallback to the last session if nothing specific found
        if (!activeSession && data.SessionInfo?.Sessions?.length > 0) {
          activeSession = data.SessionInfo.Sessions[data.SessionInfo.Sessions.length - 1];
        }

        const currentPosMap = {};
        const lapsCompleteMap = {};
        const reasonOutMap = {};

        if (activeSession && activeSession.ResultsPositions) {
          activeSession.ResultsPositions.forEach((p) => {
            currentPosMap[p.CarIdx] = p.Position;
            lapsCompleteMap[p.CarIdx] = p.LapsComplete || 0;
            reasonOutMap[p.CarIdx] = p.ReasonOutStr;
          });
        }

        // ---------------------------------------------------------------
        // Determine flag status from Telemetry SessionFlags bitmask
        // ---------------------------------------------------------------
        const iRacingFlags = {
          Checkered: 0x0001,
          White: 0x0002,
          Green: 0x0004,
          Yellow: 0x0008,
          Red: 0x0010,
          Caution: 0x4000,
          CautionWaving: 0x8000,
        };

        const sessionFlags = data.Telemetry?.SessionFlags || 0;
        let flagStatus = "Green";

        if (sessionFlags & iRacingFlags.Checkered) flagStatus = "Checkered";
        else if (sessionFlags & iRacingFlags.Red) flagStatus = "Red Flag";
        else if ((sessionFlags & iRacingFlags.Caution) || (sessionFlags & iRacingFlags.CautionWaving)) flagStatus = "Yellow";
        else if (sessionFlags & iRacingFlags.White) flagStatus = "White Flag";
        else if (sessionFlags & iRacingFlags.Green) flagStatus = "Green";
        // If no specific flag is active but we are running, assume Green
        else flagStatus = "Green";

        // ---------------------------------------------------------------
        // Calculate Winner's Laps for "Lap Down" Logic
        // ---------------------------------------------------------------
        let winnerLaps = 0;
        if (activeSession && activeSession.ResultsPositions) {
          activeSession.ResultsPositions.forEach((p) => {
            if (p.LapsComplete > winnerLaps) winnerLaps = p.LapsComplete;
          });
        }

        // ---------------------------------------------------------------
        // Build the race object consumed by <RaceCard />
        // ---------------------------------------------------------------
        // Handle unlimited laps (Practice often has SessionLaps: "unlimited" or 0)
        let totalLaps = activeSession?.SessionLaps;
        if (totalLaps === "unlimited" || totalLaps === 0) {
          totalLaps = 999; // Arbitrary high number for display
        }

        const lapsRemaining = (totalLaps || 0) - (activeSession?.ResultsLapsComplete || winnerLaps || 0);

        const raceData = {
          id: data.WeekendInfo?.SessionID || Date.now(),
          name: data.WeekendInfo?.TrackDisplayName || "Unknown Track",
          track: data.WeekendInfo?.TrackDisplayShortName || "",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          lapsRemaining: lapsRemaining,
          totalLaps: totalLaps,
          status: flagStatus === "Green" ? "Green Flag" : "Caution",
          flagStatus: flagStatus,
          drivers: data.DriverInfo?.Drivers
            ?.filter((d) => d.CarIsPaceCar === 0 && d.IsSpectator === 0)
            .map((d, index, array) => {
              const lapsComplete = lapsCompleteMap[d.CarIdx] || 0;
              const reasonOut = reasonOutMap[d.CarIdx]?.toLowerCase().trim() || "running";

              // Determine DNF Status
              let isDNF = false;
              const dnfReasons = ["accident", "engine", "suspension", "handling", "brakes"];

              if (dnfReasons.some(r => reasonOut.includes(r))) {
                isDNF = true; // Explicit mechanical/accident DNF
              } else if (reasonOut.includes("disconnected") || reasonOut.includes("disco")) {
                // "60 Second Rule" (Approx 2 laps)
                // If they disconnected but finished within 2 laps of the leader, they are NOT a DNF.
                const lapsDown = winnerLaps - lapsComplete;
                if (lapsDown > 2) {
                  isDNF = true;
                }
              }

              // DEBUG: Log first driver to inspect fields
              if (index === 0) {
                console.log("DEBUG: Driver Data", {
                  name: d.UserName,
                  userID: d.UserID,
                  custID: d.CustID,
                  type: typeof d.UserID,
                  statsFound: !!(driverStats[d.UserID] || driverStats[String(d.UserID)])
                });
              }

              // Synthetic Stats for Unknown Drivers
              // If driver is not in CSV, estimate their Avg Incidents based on Safety Rating (LicSubLevel)
              // LicSubLevel is 0-499 (e.g., 499 = 4.99 SR). Higher SR = Lower Incidents.
              // Formula: Base 5.5 - (SR * 0.8) -> 4.99 SR = ~1.5 Incidents, 1.00 SR = ~4.7 Incidents
              const safetyRatingVal = d.LicSubLevel ? d.LicSubLevel / 100 : 2.5;
              const syntheticAvgIncidents = Math.max(1.0, 5.5 - (safetyRatingVal * 0.8));

              // Define userID for lookup
              const userID = d.UserID || d.CustID;

              return {
                id: d.CarIdx,
                userID: userID,
                name: d.UserName,
                number: d.CarNumber,
                iRating: d.IRating,
                licenseClass: d.LicString,
                safetyRating: safetyRatingVal,
                startingPosition: startPosMap[d.CarIdx] || index + 1,
                currentPosition: currentPosMap[d.CarIdx] || index + 1,
                currentIncidents: d.CurDriverIncidentCount, // Use actual incidents
                lapsComplete: lapsComplete,
                status: reasonOutMap[d.CarIdx] || "Running",
                isDNF: isDNF, // New flag for UI and Settlement
                Stats: driverStats[userID] || driverStats[String(userID)] || driverStats[d.UserName] || {
                  avgIncidents: syntheticAvgIncidents, // DYNAMIC FALLBACK
                  starts: 0,
                  wins: 0,
                  avgPoints: 50,
                  top25Percent: 0,
                  winPercentage: 0,
                  avgFinish: 0
                },
                LicString: d.LicString // Pass through for odds calculation
              };
            }),
        };

        // Reset any previous race data before inserting the new one – this forces the UI to re‑render.
        setRaces([raceData]);
        // If race is finished, settle bets
        // If race is finished, trigger server-side settlement
        // If race is finished, trigger server-side settlement
        // Check if we already triggered settlement to avoid spamming the API
        if ((raceData.flagStatus === "Checkered" || raceData.lapsRemaining <= 0) && !hasSettled) {
          setHasSettled(true); // Mark as settled immediately

          // Call the settlement API
          fetch('/api/settle-race', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              raceId: raceData.id,
              drivers: raceData.drivers
            })
          }).catch(err => {
            console.error("Error triggering settlement:", err);
            setHasSettled(false); // Retry on error? Or maybe not to be safe.
          });
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Error loading race data:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    const controller = new AbortController();
    fetchRaceData(controller.signal);

    // Poll every 5 seconds for live updates
    const interval = setInterval(() => {
      fetchRaceData(controller.signal);
    }, 5000);

    // Cleanup interval on unmount
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [user, selectedRaceId, settleBets]);

  // ---------------------------------------------------------------------
  // UI rendering – if there is no authenticated user we show the login screen.
  // ---------------------------------------------------------------------
  if (!user) {
    return (
      <main className="container">
        <div style={{ maxWidth: "400px", margin: "4rem auto" }}>

          <div style={{
            backgroundColor: 'rgba(46, 204, 113, 0.15)',
            border: '1px solid #2ecc71',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '2rem',
            textAlign: 'center'
          }}>
            <h2 style={{ color: '#2ecc71', fontSize: '1.4rem', marginBottom: '0.5rem', fontWeight: '800' }}>
              🏁 100% Free to Play
            </h2>
            <p style={{ fontSize: '0.95rem', color: '#e2e8f0', lineHeight: '1.5' }}>
              Use virtual currency to bet on live iRacing events.<br />
              <strong style={{ color: '#fff' }}>No real money is ever involved.</strong>
            </p>
          </div>

          <h1 style={{ textAlign: "center", marginBottom: "2rem" }}>Welcome to iRacingBet</h1>
          <Login />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Connecting to live race data...</p>
        </div>
      ) : (
        <>
          {races.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: '#1e1e1e', borderRadius: '8px', margin: '2rem 0' }}>
              <h2>📡 Waiting for Broadcast</h2>
              <p style={{ color: '#aaa', marginTop: '1rem' }}>
                No live race data detected.
              </p>
              <div style={{ marginTop: '2rem', fontSize: '0.9em', color: '#666' }}>
                <p>To start broadcasting:</p>
                <ol style={{ textAlign: 'left', maxWidth: '300px', margin: '1rem auto' }}>
                  <li>Open iRacing on your PC</li>
                  <li>Run the broadcast script: <code>python broadcast_telemetry.py</code></li>
                </ol>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                background: '#2d3748',
                color: '#a0aec0',
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                textAlign: 'right',
                marginBottom: '1rem',
                borderRadius: '4px'
              }}>
                Last Updated: {new Date().toLocaleTimeString()}
              </div>
              <LiveBets raceData={races[0]} />
              {races.map((race) => <RaceCard key={race.id} race={race} />)}
            </>
          )}
        </>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
