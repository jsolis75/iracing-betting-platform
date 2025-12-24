import { calculateFieldOdds } from './src/utils/oddsFactory.js';

const drivers = [
    { name: "Parker White", iRating: 8000, startingPosition: 13, currentPosition: 2, lapsComplete: 5, Stats: { starts: 100, wins: 20, avgPoints: 100, avgIncidents: 2.0, avgFinish: 5.0, top25Percent: 50, winPercentage: 20 } },
    { name: "Other Leader", iRating: 4000, startingPosition: 1, currentPosition: 1, lapsComplete: 5, Stats: { starts: 100, wins: 5, avgPoints: 60, avgIncidents: 3.0, avgFinish: 10.0, top25Percent: 20, winPercentage: 5 } },
    { name: "Mid Pack", iRating: 3000, startingPosition: 5, currentPosition: 3, lapsComplete: 5, Stats: { starts: 100, wins: 1, avgPoints: 40, avgIncidents: 4.0, avgFinish: 15.0, top25Percent: 5, winPercentage: 1 } },
    { name: "Back Marker", iRating: 1500, startingPosition: 20, currentPosition: 4, lapsComplete: 5, Stats: { starts: 100, wins: 0, avgPoints: 20, avgIncidents: 6.0, avgFinish: 20.0, top25Percent: 1, winPercentage: 0 } }
];

const raceState = { lapsRemaining: 30, totalLaps: 50, track: "Charlotte" }; // 40% progress

try {
    console.log("--- Parker White in P2 ---");
    let results1 = calculateFieldOdds(drivers, raceState);
    let parker1 = results1.find(d => d.name === "Parker White");
    console.log(`Parker (P2): Win Odds ${parker1.odds.win}, Normalized Prob: ${parker1.winProbability.toFixed(4)}`);

    console.log("\n--- Parker White takes P1 ---");
    // Swap positions
    drivers[0].currentPosition = 1;
    drivers[1].currentPosition = 2;
    let results2 = calculateFieldOdds(drivers, raceState);
    let parker2 = results2.find(d => d.name === "Parker White");
    console.log(`Parker (P1): Win Odds ${parker2.odds.win}, Normalized Prob: ${parker2.winProbability.toFixed(4)}`);

    const getOddsVal = (s) => {
        if (s.startsWith('+')) return parseInt(s.substring(1));
        return parseInt(s);
    };

    const v1 = getOddsVal(parker1.odds.win);
    const v2 = getOddsVal(parker2.odds.win);

    console.log(`\nComparison: P2 Odds (${v1}) vs P1 Odds (${v2})`);

    if (v2 < v1) {
        console.log("SUCCESS: Parker's odds became shorter (more negative/less positive) in P1!");
    } else {
        console.log("FAILURE: Parker's odds did not improve.");
    }
} catch (err) {
    console.error("CRASH DETECTED:");
    console.error(err.message);
    console.error(err.stack);
}
