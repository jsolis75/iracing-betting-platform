// In-memory race registry
let races = new Map();
let raceIdCounter = 1;

// Register a new race
export function registerRace(raceData) {
    const raceId = `race_${raceIdCounter++}`;
    races.set(raceId, {
        id: raceId,
        name: raceData.name || 'Unknown Race',
        track: raceData.track || 'Unknown Track',
        source: raceData.source || 'live', // 'live' or 'broadcast'
        lastUpdate: new Date().toISOString(),
        data: raceData
    });
    return raceId;
}

// Update existing race
export function updateRace(raceId, raceData) {
    if (races.has(raceId)) {
        const existing = races.get(raceId);
        races.set(raceId, {
            ...existing,
            lastUpdate: new Date().toISOString(),
            data: raceData
        });
        return true;
    }
    return false;
}

// Get all races
export function getAllRaces() {
    return Array.from(races.values()).map(race => ({
        id: race.id,
        name: race.name,
        track: race.track,
        source: race.source,
        lastUpdate: race.lastUpdate
    }));
}

// Get specific race data
export function getRaceData(raceId) {
    return races.get(raceId)?.data || null;
}

// Remove old races (older than 1 hour)
export function cleanupOldRaces() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [id, race] of races.entries()) {
        if (new Date(race.lastUpdate).getTime() < oneHourAgo) {
            races.delete(id);
        }
    }
}

// API Route Handlers
export async function GET() {
    cleanupOldRaces();
    const raceList = getAllRaces();
    return Response.json({ races: raceList });
}
