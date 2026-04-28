// CLI smoke test wrapper for the reusable Connect 4 engine validation suite.
const connect4 = require("../game/connect4-engine.js");

const depthArg = process.argv.find((arg) => arg.startsWith("--depth="));
const redDepthArg = process.argv.find((arg) => arg.startsWith("--red-depth="));
const yellowDepthArg = process.argv.find((arg) => arg.startsWith("--yellow-depth="));
const gamesArg = process.argv.find((arg) => arg.startsWith("--games="));
const depth = depthArg ? Number(depthArg.split("=")[1]) : 4;
const redDepth = redDepthArg ? Number(redDepthArg.split("=")[1]) : depth;
const yellowDepth = yellowDepthArg ? Number(yellowDepthArg.split("=")[1]) : depth;
const games = gamesArg ? Number(gamesArg.split("=")[1]) : 2;
const useAlphaBeta = !process.argv.includes("--plain-minimax");
const randomizeTies = process.argv.includes("--variety");
const alternateStart = process.argv.includes("--alternate-start");
const seedArg = process.argv.find((arg) => arg.startsWith("--seed="));
const seed = seedArg ? Number(seedArg.split("=")[1]) : undefined;

// The reusable suite lives in the engine so browser logic and CLI checks share behavior.
const result = connect4.runHeadlessSuite({ depth, redDepth, yellowDepth, games, useAlphaBeta, randomizeTies, alternateStart, seed });

console.log(`Headless Connect 4 test suite`);
console.log(`Depth: ${result.depth}`);
console.log(`Red depth: ${result.redDepth}`);
console.log(`Yellow depth: ${result.yellowDepth}`);
console.log(`Algorithm: ${result.useAlphaBeta ? "Minimax + Alpha-Beta" : "Plain Minimax"}`);
console.log(`Equal-score move variation: ${result.randomizeTies ? "on" : "off"}`);
console.log(`Starting player: ${result.alternateStart ? "alternating" : "red"}`);
console.log("");

for (const check of result.checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}`);
}

console.log("");
for (const simulation of result.simulations) {
  console.log(
    `Game ${simulation.game}: winner=${simulation.winner}, moves=${simulation.moves}, nodes=${simulation.totalNodes}, time=${simulation.totalTimeSeconds}s`
  );
  if (simulation.moveSequence) {
    console.log(`  ${simulation.moveSequence}`);
  }
}

process.exit(result.passed ? 0 : 1);
