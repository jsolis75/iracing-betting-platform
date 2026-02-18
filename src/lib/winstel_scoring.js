export function calculateDriverScore(position, startingPosition) {
    if (!position) return 0;

    // 1. Position points (DraftKings style)
    let posPoints = 0;
    if (position === 1) posPoints = 45;
    else if (position === 2) posPoints = 42;
    else if (position === 3) posPoints = 41;
    else if (position === 4) posPoints = 40;
    else if (position >= 5 && position <= 43) {
        posPoints = 44 - position;
    } else {
        posPoints = 1;
    }

    // 2. Place differential (starting - current)
    const diffPoints = startingPosition - position;

    return posPoints + diffPoints;
}

export function calculateEntryScore(driverIds, driverResults) {
    let total = 0;
    driverIds.forEach(driverId => {
        const result = driverResults[driverId];
        if (result) {
            total += calculateDriverScore(result.position, result.startingPosition);
        }
    });
    return total;
}
