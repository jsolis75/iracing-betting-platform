import { calculateFieldOdds, mockDrivers } from './src/utils/oddsFactory.js';

// Mock drivers with specific characteristics for testing
const testDrivers = [
    { ...mockDrivers[0], name: "Super Max (9k iR)", iRating: 9000, Stats: { winPercentage: 40, avgPoints: 120, avgIncidents: 2.0 }, LicString: "P 4.99" },
    { ...mockDrivers[1], name: "Mid Pack (3k iR)", iRating: 3000, Stats: { winPercentage: 5, avgPoints: 60, avgIncidents: 4.5 }, LicString: "B 3.50" },
    { ...mockDrivers[3], name: "Rookie (1.5k iR)", iRating: 1500, Stats: { winPercentage: 1, avgPoints: 30, avgIncidents: 8.0 }, LicString: "D 2.00" }
];

console.log("--- Testing New Odds Logic ---");
const odds = calculateFieldOdds(testDrivers);

odds.forEach(d => {
    console.log(`\nDriver: ${d.name}`);
    console.log(`Win Odds: ${d.odds.win}`);
    console.log(`Top 3: ${d.odds.top3}`);
    console.log(`Top 10: ${d.odds.top10}`);
    console.log(`Crash: ${d.odds.crash}`);
});
