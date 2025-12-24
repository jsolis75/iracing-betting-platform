import { calculateFieldOdds } from './src/utils/oddsFactory.js';

const drivers = [
    { name: "Parker White", iRating: 8000, currentPosition: 2, startingPosition: 10, Stats: { starts: 100, wins: 20 } },
    { name: "Leader", iRating: 4000, currentPosition: 1, startingPosition: 1, Stats: { starts: 100, wins: 5 } }
];

const raceState = { lapsRemaining: 25, totalLaps: 50, track: "Charlotte" };

console.log("Running test...");
const results = calculateFieldOdds(drivers, raceState);
const parker = results.find(d => d.name === "Parker White");
console.log(`Parker P2 Odds: ${parker.odds.win}`);

drivers[0].currentPosition = 1;
drivers[1].currentPosition = 2;
const results2 = calculateFieldOdds(drivers, raceState);
const parker2 = results2.find(d => d.name === "Parker White");
console.log(`Parker P1 Odds: ${parker2.odds.win}`);
