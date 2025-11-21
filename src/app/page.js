// "use client" ensures this component runs on the client side
"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import RaceCard from "@/components/Race/RaceCard";
import BetSlip from "@/components/Betting/BetSlip";
import LiveBets from "@/components/Betting/LiveBets";
import Login from "@/components/Auth/Login";
import { useUser } from "@/context/UserContext";
import { useBetting } from "@/context/BettingContext";

export default function Home() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const selectedRaceId = searchParams.get('raceId');
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const { settleBets } = useBetting();
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
          ? `/api/race-data?raceId=${selectedRaceId}&t=${Date.now()}`
          : `/api/race-data?t=${Date.now()}`;
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch race data: ${response.status} `);
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
        const raceSession = data.SessionInfo?.Sessions?.find((s) => s.SessionType === "Race");
        const currentPosMap = {};
        const lapsCompleteMap = {};
        const reasonOutMap = {};
        if (raceSession && raceSession.ResultsPositions) {
          raceSession.ResultsPositions.forEach((p) => {
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
        if (raceSession && raceSession.ResultsPositions) {
          raceSession.ResultsPositions.forEach((p) => {
            if (p.LapsComplete > winnerLaps) winnerLaps = p.LapsComplete;
          });
        }

        // ---------------------------------------------------------------
        // Build the race object consumed by <RaceCard />
        // ---------------------------------------------------------------
        const raceData = {
          id: data.WeekendInfo?.SessionID || Date.now(),
          name: data.WeekendInfo?.TrackDisplayName || "Unknown Track",
          track: data.WeekendInfo?.TrackDisplayShortName || "",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          lapsRemaining:
            (raceSession?.SessionLaps || 0) - (raceSession?.ResultsLapsComplete || 0),
          totalLaps: raceSession?.SessionLaps || 0,
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

              return {
                id: d.CarIdx,
                name: d.UserName,
                number: d.CarNumber,
                iRating: d.IRating,
                licenseClass: d.LicString,
                safetyRating: d.LicSubLevel / 100,
                startingPosition: startPosMap[d.CarIdx] || index + 1,
                currentPosition: currentPosMap[d.CarIdx] || index + 1,
                currentIncidents: d.CurDriverIncidentCount, // Use actual incidents
                lapsComplete: lapsComplete,
                status: reasonOutMap[d.CarIdx] || "Running",
                isDNF: isDNF, // New flag for UI and Settlement
                stats: d.Stats, // Historical stats from API
              };
            }),
        };

        // Reset any previous race data before inserting the new one – this forces the UI to re‑render.
        setRaces([raceData]);
        // If race is finished, settle bets
        if (raceData.flagStatus === "Checkered" || raceData.lapsRemaining <= 0) {
          settleBets(raceData);
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
          <h1 style={{ textAlign: "center", marginBottom: "2rem" }}>Welcome to iRacingBet</h1>
          <Login />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      {loading ? (
        <p>Loading live races…</p>
      ) : (
        <>
          {races.length > 0 && <LiveBets raceData={races[0]} />}
          {races.map((race) => <RaceCard key={race.id} race={race} />)}
        </>
      )}
    </main>
  );
}
