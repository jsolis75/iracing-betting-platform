/**
 * Maps raw iRacing API/SDK data to our application's RaceCard format.
 */

// Session flag bit definitions from iRacing SDK
const SessionFlags = {
    checkered: 0x00000001,
    white: 0x00000002,
    green: 0x00000004,
    yellow: 0x00000008,
    red: 0x00000010,
    blue: 0x00000020,
    debris: 0x00000040,
    crossed: 0x00000080,
    yellowWaving: 0x00000100,
    oneLapToGreen: 0x00000200,
    greenHeld: 0x00000400,
    tenToGo: 0x00000800,
    fiveToGo: 0x00001000,
    randomWaving: 0x00002000,
    caution: 0x00004000,
    cautionWaving: 0x00008000,
};

function getFlagStatus(sessionFlags) {
    if (sessionFlags & SessionFlags.checkered) return 'Checkered';
    if (sessionFlags & SessionFlags.white) return 'White Flag';
    if (sessionFlags & SessionFlags.yellow || sessionFlags & SessionFlags.caution) return 'Yellow';
    if (sessionFlags & SessionFlags.green) return 'Green';
    if (sessionFlags & SessionFlags.red) return 'Red Flag';
    return 'Racing';
}

export const mapIRacingData = (rawData) => {
    if (!rawData || !rawData.DriverInfo) {
        return null;
    }

    const { WeekendInfo, SessionInfo, DriverInfo, Telemetry } = rawData;

    // Extract Race Details
    const trackName = WeekendInfo.TrackDisplayName || "Unknown Track";
    const seriesId = WeekendInfo.SeriesID || 0;
    const session = SessionInfo.Sessions.find(s => s.SessionType === "Race") || SessionInfo.Sessions[0];
    const raceName = session.SessionName || "Live Event";
    const totalLaps = session.SessionLaps === "unlimited" ? "∞" : session.SessionLaps;

    // Calculate current lap from laps remaining
    const lapsRemaining = Telemetry?.SessionLapsRemain || 0;
    const currentLap = totalLaps === "∞" ? "N/A" : Math.max(0, parseInt(totalLaps) - Math.floor(lapsRemaining));

    // Get flag status
    const sessionFlags = Telemetry?.SessionFlags || 0;
    const flagStatus = getFlagStatus(sessionFlags);

    // Get current real-world local time
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Format lap display
    const lapDisplay = totalLaps === "∞"
        ? `Lap ${currentLap}`
        : `Lap ${currentLap} of ${totalLaps}`;

    // Combine lap and time display
    const raceProgress = `${lapDisplay} • ${timeDisplay}`;

    // Get qualifying results to determine starting positions
    const qualifyingSession = SessionInfo.Sessions.find(s =>
        s.SessionType === "Qualify" ||
        s.SessionType === "Lone Qualify" ||
        s.SessionType === "Open Qualify"
    );

    const startingPositions = {};
    if (qualifyingSession && qualifyingSession.ResultsPositions) {
        qualifyingSession.ResultsPositions.forEach(result => {
            startingPositions[result.CarIdx] = result.Position;
        });
    }

    // Get current race session results for incidents AND current position
    const raceSession = SessionInfo.Sessions.find(s => s.SessionType === "Race");
    const currentIncidents = {};
    const currentPositions = {};
    if (raceSession && raceSession.ResultsPositions) {
        raceSession.ResultsPositions.forEach(result => {
            currentIncidents[result.CarIdx] = result.Incidents || 0;
            currentPositions[result.CarIdx] = result.Position || 0;
        });
    }

    // Map Drivers
    // Filter out pace car and spectators
    const drivers = DriverInfo.Drivers
        .filter(d => d.UserName !== "Pace Car" && d.IsSpectator !== 1)
        .map((d, index) => {
            // Extract Safety Rating from LicString (e.g., "A 4.50" -> "4.50")
            const safetyRating = d.LicString ? parseFloat(d.LicString.split(' ')[1]) || 0 : 0;

            // Get current race incidents and position
            const incidents = currentIncidents[d.CarIdx] || 0;
            const currentPos = currentPositions[d.CarIdx] || 0;

            return {
                id: d.CarIdx,
                name: d.UserName,
                number: d.CarNumber,
                iRating: d.IRating || 1500,
                safetyRating: safetyRating,
                licenseClass: d.LicString ? d.LicString.split(' ')[0] : 'R',
                currentIncidents: incidents,
                currentPosition: currentPos,
                wins: d.CareerStats?.totalWins || 0,
                starts: d.CareerStats?.totalStarts || 0,
                avgIncidents: d.CareerStats?.avgIncidents || 0,
                // Use qualifying position if available, otherwise use array index + 1 as estimate
                startingPosition: startingPositions[d.CarIdx] || (index + 1)
            };
        })
        // Sort by iRating descending to get a reasonable position estimate
        .sort((a, b) => (b.iRating - a.iRating))
        .map((d, index) => ({
            ...d,
            // If no qualifying data, assign position based on iRating rank
            startingPosition: startingPositions[d.id] || (index + 1)
        }));

    return {
        id: Date.now(),
        name: raceName,
        track: trackName,
        time: raceProgress,
        flagStatus: flagStatus,
        seriesId: seriesId,
        lapsRemaining: lapsRemaining,
        totalLaps: totalLaps,
        drivers: drivers
    };
};
