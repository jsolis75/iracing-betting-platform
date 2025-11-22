const fs = require('fs');
const path = require('path');

// Mock the logic from route.js
function loadStats() {
    const csvPath = path.join(process.cwd(), 'iracerdata', 'Oval_driver_stats.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');

    const driverIndex = 0;
    const custIdIndex = 1;
    const avgIncIndex = 12;
    const classIndex = 13;

    const statsMap = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',');
        if (cols.length < 14) continue;

        const driverName = cols[driverIndex];
        const custId = cols[custIdIndex];
        const avgIncidents = parseFloat(cols[avgIncIndex]) || 3.0;
        const licenseClass = cols[classIndex];

        const key = custId || driverName;
        statsMap[key] = { name: driverName, avgIncidents, licenseClass };
    }
    return statsMap;
}

// Mock the logic from page.js
function testLookup() {
    console.log("Loading stats...");
    const stats = loadStats();
    console.log(`Loaded ${Object.keys(stats).length} drivers.`);

    // Test Case 1: Justin Brooks (ID: 33988)
    const driver1 = { UserID: "33988", UserName: "Justin Brooks" };
    const lookup1 = stats[driver1.UserID] || stats[driver1.UserName];
    console.log("\nTest 1 (Justin Brooks - ID 33988):");
    console.log(lookup1 ? "✅ Found:" : "❌ Not Found", lookup1);

    // Test Case 2: Ty Majeski (ID: 62032)
    const driver2 = { UserID: "62032", UserName: "Ty Majeski" };
    const lookup2 = stats[driver2.UserID] || stats[driver2.UserName];
    console.log("\nTest 2 (Ty Majeski - ID 62032):");
    console.log(lookup2 ? "✅ Found:" : "❌ Not Found", lookup2);

    // Test Case 3: Unknown ID (Fallback check - shouldn't find unless name matches)
    const driver3 = { UserID: "999999999", UserName: "Ghost Driver" };
    const lookup3 = stats[driver3.UserID] || stats[driver3.UserName];
    console.log("\nTest 3 (Ghost Driver):");
    console.log(lookup3 ? "❌ Found (Unexpected):" : "✅ Not Found (Correct)", lookup3);
}

testLookup();
