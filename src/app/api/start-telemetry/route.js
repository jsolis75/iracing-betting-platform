import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

let pythonProcess = null;
let broadcastRaceId = null;

export async function POST() {
    if (pythonProcess) {
        return NextResponse.json({
            message: 'Telemetry is already running',
            status: 'running',
            raceId: broadcastRaceId
        });
    }

    try {
        const scriptPath = path.join(process.cwd(), 'fetch_iracing_data.py');

        // We no longer manually register the race here.
        // The python script will push data to the /api/telemetry/ingest endpoint,
        // which will create the race record in the database.
        broadcastRaceId = 'waiting-for-data';

        // Spawn the python script
        // Using 'python' command - might need 'python3' depending on environment, but user is on Windows so 'python' is likely.
        pythonProcess = spawn('python', [scriptPath], {
            cwd: process.cwd(),
            stdio: 'ignore', // Detach stdio so it keeps running
            detached: true
        });

        pythonProcess.unref(); // Allow parent to exit independently if needed

        pythonProcess.on('error', (err) => {
            console.error('Failed to start telemetry script:', err);
            pythonProcess = null;
            broadcastRaceId = null;
        });

        pythonProcess.on('exit', (code) => {
            console.log(`Telemetry script exited with code ${code}`);
            pythonProcess = null;
            broadcastRaceId = null;
        });

        return NextResponse.json({
            message: 'Telemetry started successfully',
            status: 'started',
            raceId: broadcastRaceId
        });
    } catch (error) {
        console.error('Error starting telemetry:', error);
        return NextResponse.json({ error: 'Failed to start telemetry', details: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        status: pythonProcess ? 'running' : 'stopped',
        message: pythonProcess ? 'Telemetry is active' : 'Telemetry is stopped',
        raceId: broadcastRaceId
    });
}
