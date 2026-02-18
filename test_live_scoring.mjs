import fs from 'fs';
import fetch from 'node-fetch';

async function testIngest() {
    const sampleData = JSON.parse(fs.readFileSync('./src/data/iracing-sample.json', 'utf8'));

    // Modify sample data to simulate some movement
    // Driver 8 (Bryce D Benton) is P1 in practice, let's make sure he's in the race positions

    console.log('Sending mock telemetry to ingest API...');

    try {
        const res = await fetch('http://localhost:3000/api/telemetry/ingest', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'iracing-broadcast-key-123'
            },
            body: JSON.stringify(sampleData)
        });

        const result = await res.json();
        console.log('API Response:', result);

        if (result.success) {
            console.log('Live scoring update triggered successfully.');
        } else {
            console.error('API Error:', result.error);
        }
    } catch (err) {
        console.error('Failed to contact local API. Make sure dev server is running.', err.message);
    }
}

testIngest();
