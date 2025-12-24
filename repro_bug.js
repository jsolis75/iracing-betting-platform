const { calculateFieldOdds } = require('./src/utils/oddsFactory');

const drivers = [
    { name: "Parker White", iRating: 8000, startingPosition: 13, currentPosition: 2, lapsComplete: 5 },
    { name: "Other Leader", iRating: 4000, startingPosition: 1, currentPosition: 1, lapsComplete: 5 },
    { name: "Mid Pack", iRating: 3000, startingPosition: 5, currentPosition: 3, lapsComplete: 5 },
    { name: "Back Marker", iRating: 1500, startingPosition: 20, currentPosition: 20, lapsComplete: 5 }
];

const raceState = { lapsRemaining: 45, totalLaps: 50 }; // 10% progress

console.log("--- Parker White in P2 ---");
let results = calculateFieldOdds(drivers, raceState);
let parker = results.find(d => d.name === "Parker White");
console.log(`Parker (P2): Win Odds ${parker.odds.win}, Prob: ${parker.winProbability.toFixed(4)}`);

console.log("\n--- Parker White takes P1 ---");
drivers[0].currentPosition = 1;
drivers[1].currentPosition = 2;
results = calculateFieldOdds(drivers, raceState);
parker = results.find(d => d.name === "Parker White");
console.log(`Parker (P1): Win Odds ${parker.odds.win}, Prob: ${parker.winProbability.toFixed(4)}`);
