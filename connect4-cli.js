(function attachConnect4Cli(root) {
  const engine = typeof module !== "undefined" && module.exports
    ? require("./connect4-engine.js")
    : root.Connect4Engine;
  const experiment = typeof module !== "undefined" && module.exports
    ? require("./connect4-experiment.js")
    : root.Connect4Experiment;

  const { runHeadlessSuite } = engine;
  const {
    buildExperimentResult,
    buildExperimentSummaryText,
    experimentToCsv
  } = experiment;

  function getCliOption(args, name, fallback) {
    const prefix = `--${name}=`;
    const match = args.find((arg) => arg.startsWith(prefix));
    if (!match) return fallback;
    return match.slice(prefix.length);
  }

  function getCliBoolean(args, name, fallback = false) {
    if (args.includes(`--${name}`)) return true;
    if (args.includes(`--no-${name}`)) return false;
    return fallback;
  }

  function buildHeadlessSummaryText(result) {
    const lines = [
      "Connect 4 AI Headless Validation",
      `Depth: ${result.depth}`,
      `Red depth: ${result.redDepth}`,
      `Yellow depth: ${result.yellowDepth}`,
      `Games: ${result.games}`,
      `Algorithm: ${result.useAlphaBeta ? "Minimax + Alpha-Beta" : "Plain Minimax"}`,
      `Equal-score move variation: ${result.randomizeTies ? "on" : "off"}`,
      `Alternate starting player: ${result.alternateStart ? "on" : "off"}`,
      `Overall result: ${result.passed ? "PASS" : "CHECK"}`,
      "",
      "Checks:"
    ];

    for (const check of result.checks) {
      lines.push(`${check.passed ? "PASS" : "CHECK"} - ${check.name}`);
    }

    lines.push("", "Simulations:");
    for (const simulation of result.simulations) {
      lines.push(`Game ${simulation.game}: winner=${simulation.winner}, moves=${simulation.moves}, nodes=${simulation.totalNodes}, time=${simulation.totalTimeSeconds}s`);
      lines.push(`Moves: ${simulation.moveSequence}`);
    }

    return `${lines.join("\n")}\n`;
  }

  function formatCliPayload(payload, format, type = "headless") {
    if (format === "summary") {
      return type === "experiment" ? buildExperimentSummaryText(payload) : buildHeadlessSummaryText(payload);
    }
    if (format === "csv") {
      if (type !== "experiment") {
        throw new Error("--format=csv is available for --experiment output.");
      }
      return experimentToCsv(payload);
    }
    return `${JSON.stringify(payload, null, 2)}\n`;
  }

  function writeCliPayload(payload, options = {}) {
    const format = options.format ?? "json";
    const type = options.type ?? "headless";
    const content = formatCliPayload(payload, format, type);
    if (options.out) {
      const fs = require("fs");
      fs.writeFileSync(options.out, content);
      console.log(`Wrote ${type} ${format} output to ${options.out}`);
      return;
    }
    process.stdout.write(content);
  }

  function printCliHelp() {
    process.stdout.write(`Connect 4 AI headless commands

Validation suite:
  node connect4-game-controller.js --headless [--depth=4] [--red-depth=2] [--yellow-depth=6] [--games=4]
                 [--plain-minimax] [--variety] [--alternate-start] [--seed=42]
                 [--format=json|summary] [--out=path]

Experiment evidence:
  node connect4-game-controller.js --experiment [--board=empty|midgame|current] [--max-depth=5]
                 [--validation-games=4] [--no-tie-variation] [--no-matchups]
                 [--format=json|csv|summary] [--out=path]

Examples:
  node connect4-game-controller.js --headless --red-depth=2 --yellow-depth=6 --games=6 --format=summary
  node connect4-game-controller.js --experiment --board=midgame --max-depth=6 --format=csv --out=experiment.csv
`);
  }

  function runCli(args = process.argv.slice(2)) {
    if (args.includes("--help") || args.includes("-h")) {
      printCliHelp();
      process.exit(0);
    }

    if (args.includes("--experiment") || args.includes("--benchmark")) {
      const result = buildExperimentResult({
        boardSource: getCliOption(args, "board", "empty"),
        maxDepth: Number(getCliOption(args, "max-depth", 5)),
        validationGames: Number(getCliOption(args, "validation-games", 2)),
        tieVariation: !args.includes("--no-tie-variation"),
        includeMatchups: !args.includes("--no-matchups")
      });
      writeCliPayload(result, {
        type: "experiment",
        format: getCliOption(args, "format", "json"),
        out: getCliOption(args, "out", "")
      });
      process.exit(0);
    }

    if (args.includes("--headless")) {
      const depth = Number(getCliOption(args, "depth", 4));
      const redDepth = Number(getCliOption(args, "red-depth", depth));
      const yellowDepth = Number(getCliOption(args, "yellow-depth", depth));
      const games = Number(getCliOption(args, "games", 2));
      const useAlphaBeta = !args.includes("--plain-minimax");
      const randomizeTies = getCliBoolean(args, "variety", false);
      const alternateStart = getCliBoolean(args, "alternate-start", false);
      const seed = args.some((arg) => arg.startsWith("--seed=")) ? Number(getCliOption(args, "seed", 1)) : undefined;
      const result = runHeadlessSuite({ depth, redDepth, yellowDepth, games, useAlphaBeta, randomizeTies, alternateStart, seed });
      writeCliPayload(result, {
        type: "headless",
        format: getCliOption(args, "format", "json"),
        out: getCliOption(args, "out", "")
      });
      process.exit(result.passed ? 0 : 1);
    }

    printCliHelp();
    process.exit(0);
  }

  const api = {
    getCliOption,
    getCliBoolean,
    buildHeadlessSummaryText,
    formatCliPayload,
    writeCliPayload,
    printCliHelp,
    runCli
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4Cli = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
