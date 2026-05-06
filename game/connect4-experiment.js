// Builds repeatable minimax/alpha-beta benchmark evidence for browser and Node use.
(function attachConnect4Experiment(root) {
  const engine = typeof module !== "undefined" && module.exports
    ? require("./connect4-engine.js")
    : root.Connect4Engine;

  const {
    HUMAN,
    AI,
    createBoard,
    copyBoard,
    dropPiece,
    getLegalMoves,
    chooseAiMove,
    playHeadlessGame,
    runHeadlessSuite,
    createSeededRandom,
    formatPlayer
  } = engine;

  const DEFAULT_CONCLUSION = "Alpha-beta should preserve the minimax move and score while searching fewer or equal nodes.";

  const MATCHUP_DEFINITIONS = [
    {
      label: "Easy Red Autopilot vs Expert Yellow Opponent",
      redDepth: 2,
      yellowDepth: 6,
      expectedWinner: "Yellow",
      seed: 101
    },
    {
      label: "Expert Red Autopilot vs Easy Yellow Opponent",
      redDepth: 6,
      yellowDepth: 2,
      expectedWinner: "Red",
      seed: 202
    }
  ];

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    const safeValue = Number.isFinite(number) ? Math.trunc(number) : fallback;
    return Math.min(Math.max(safeValue, min), max);
  }

  function normalizeExperimentConfig(overrides = {}) {
    const maxDepth = clampNumber(overrides.maxDepth ?? 5, 5, 3, 6);
    const validationGames = clampNumber(overrides.validationGames ?? 2, 2, 1, 6);

    return {
      boardSource: overrides.boardSource ?? "empty",
      maxDepth,
      validationGames,
      tieVariation: overrides.tieVariation ?? true,
      includeMatchups: overrides.includeMatchups ?? true
    };
  }

  function runBenchmarkOnState(state, depths = [3, 4, 5]) {
    // For each depth, compare plain minimax against alpha-beta on the same board.
    const benchmarkOptions = { disableTacticalShortcut: true };
    const rows = [];
    for (const depth of depths) {
      rows.push(chooseAiMove(state, depth, false, benchmarkOptions));
      rows.push(chooseAiMove(state, depth, true, benchmarkOptions));
    }
    return rows;
  }

  function getBenchmarkDepths(maxDepth) {
    return Array.from({ length: maxDepth - 1 }, (_, index) => index + 2);
  }

  function createPreparedExperimentBoard() {
    // A fixed midgame board gives repeatable evidence beyond the empty opening.
    const state = createBoard();
    const sequence = [
      [3, HUMAN],
      [3, AI],
      [2, HUMAN],
      [4, AI],
      [2, HUMAN],
      [4, AI],
      [1, HUMAN],
      [5, AI],
      [3, HUMAN],
      [2, AI],
      [5, HUMAN],
      [1, AI]
    ];
    for (const [col, player] of sequence) {
      dropPiece(state, col, player);
    }
    return state;
  }

  function createExperimentBoardSnapshot(source, currentBoard = null, currentPlayer = HUMAN) {
    if (source === "current") {
      return {
        state: Array.isArray(currentBoard) ? copyBoard(currentBoard) : createBoard(),
        label: "Current game position",
        shortLabel: "Current",
        playerLabel: formatPlayer(currentPlayer)
      };
    }

    if (source === "midgame") {
      return {
        state: createPreparedExperimentBoard(),
        label: "Prepared midgame test position",
        shortLabel: "Midgame",
        playerLabel: "Yellow benchmark"
      };
    }

    return {
      state: createBoard(),
      label: "Empty starting board",
      shortLabel: "Empty",
      playerLabel: "Yellow benchmark"
    };
  }

  function compareDepth(snapshot, depth) {
    // Correct alpha-beta should match plain minimax while searching fewer or equal nodes.
    const benchmarkOptions = { disableTacticalShortcut: true };
    const plain = chooseAiMove(snapshot, depth, false, benchmarkOptions);
    const pruned = chooseAiMove(snapshot, depth, true, benchmarkOptions);

    return {
      depth,
      plain,
      alphaBeta: pruned,
      sameMove: plain.move === pruned.move,
      sameScore: plain.score === pruned.score,
      fewerOrEqualNodes: pruned.nodes <= plain.nodes
    };
  }

  function runValidationEvidence(config) {
    return runHeadlessSuite({
      depth: 3,
      redDepth: 2,
      yellowDepth: 4,
      games: config.validationGames,
      useAlphaBeta: true,
      randomizeTies: config.tieVariation,
      seed: 42
    });
  }

  function runSingleMatchupEvidence(matchup) {
    const simulation = playHeadlessGame({
      redDepth: matchup.redDepth,
      yellowDepth: matchup.yellowDepth,
      useAlphaBeta: true,
      randomizeTies: true,
      randomFn: createSeededRandom(matchup.seed)
    });

    return {
      ...matchup,
      simulation,
      winner: formatPlayer(simulation.winner),
      moves: simulation.moves.length,
      totalNodes: simulation.totalNodes,
      passed: formatPlayer(simulation.winner) === matchup.expectedWinner
    };
  }

  function runMatchupEvidence(includeMatchups) {
    if (!includeMatchups) {
      return [];
    }

    return MATCHUP_DEFINITIONS.map(runSingleMatchupEvidence);
  }

  function createExperimentResult(config, boardSnapshot, depths, comparisons, validation, matchups, generatedAt = new Date().toISOString()) {
    const snapshot = boardSnapshot.state;
    return {
      generatedAt,
      config: {
        ...config,
        depths
      },
      boardSourceLabel: boardSnapshot.label,
      boardSourceShortLabel: boardSnapshot.shortLabel,
      currentBoard: copyBoard(snapshot),
      legalMoves: getLegalMoves(snapshot).map((col) => col + 1),
      currentPlayer: boardSnapshot.playerLabel,
      comparisons,
      validation,
      matchups,
      conclusion: DEFAULT_CONCLUSION
    };
  }

  function buildExperimentResult(overrides = {}, options = {}) {
    // Synchronous builder is used by the command line exports.
    const config = normalizeExperimentConfig(overrides);
    const depths = getBenchmarkDepths(config.maxDepth);
    const boardSnapshot = createExperimentBoardSnapshot(config.boardSource, options.currentBoard, options.currentPlayer);
    const comparisons = depths.map((depth) => compareDepth(boardSnapshot.state, depth));
    const validation = runValidationEvidence(config);
    const matchups = runMatchupEvidence(config.includeMatchups);

    return createExperimentResult(config, boardSnapshot, depths, comparisons, validation, matchups);
  }

  async function buildExperimentResultWithProgress(overrides = {}, options = {}) {
    // Async builder yields between expensive steps so the browser progress bar can repaint.
    const config = normalizeExperimentConfig(overrides);
    const depths = getBenchmarkDepths(config.maxDepth);
    const boardSnapshot = createExperimentBoardSnapshot(config.boardSource, options.currentBoard, options.currentPlayer);
    const comparisons = [];
    const matchupTasks = config.includeMatchups ? MATCHUP_DEFINITIONS.length : 0;
    const totalSteps = depths.length * 2 + 1 + matchupTasks + 1;
    let completedSteps = 0;

    const advance = async (label, increment = 0) => {
      completedSteps += increment;
      if (typeof options.onProgress === "function") {
        await options.onProgress({
          percent: (completedSteps / totalSteps) * 100,
          label,
          completedSteps,
          totalSteps
        });
      }
    };

    await advance("Preparing board snapshot...");

    for (const depth of depths) {
      await advance(`Running plain minimax at depth ${depth}...`);
      const plain = chooseAiMove(boardSnapshot.state, depth, false, { disableTacticalShortcut: true });
      await advance(`Running alpha-beta at depth ${depth}...`, 1);
      const pruned = chooseAiMove(boardSnapshot.state, depth, true, { disableTacticalShortcut: true });
      comparisons.push({
        depth,
        plain,
        alphaBeta: pruned,
        sameMove: plain.move === pruned.move,
        sameScore: plain.score === pruned.score,
        fewerOrEqualNodes: pruned.nodes <= plain.nodes
      });
      await advance(`Finished depth ${depth}.`, 1);
    }

    await advance("Running headless validation checks...");
    const validation = runValidationEvidence(config);
    await advance("Validation checks complete.", 1);

    const matchups = [];
    if (config.includeMatchups) {
      for (const matchup of MATCHUP_DEFINITIONS) {
        await advance(`Running matchup: ${matchup.label}...`);
        matchups.push(runSingleMatchupEvidence(matchup));
        await advance(`Finished matchup: ${matchup.label}.`, 1);
      }
    }

    await advance("Rendering experiment evidence...", 1);

    return createExperimentResult(config, boardSnapshot, depths, comparisons, validation, matchups);
  }

  function csvValue(value) {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function experimentToCsv(result) {
    // CSV output gives a simple artifact the report or grader can open in a spreadsheet.
    const rows = [["Section", "Name", "Algorithm", "Depth", "Nodes", "Time Seconds", "Move", "Score", "Result", "Notes"]];
    rows.push([
      "Experiment Config",
      result.boardSourceLabel,
      "",
      result.config.depths.join(" / "),
      "",
      "",
      "",
      "",
      "INFO",
      `validationGames=${result.config.validationGames}; tieVariation=${result.config.tieVariation}; includeMatchups=${result.config.includeMatchups}`
    ]);
    for (const comparison of result.comparisons) {
      for (const item of [comparison.plain, comparison.alphaBeta]) {
        rows.push([
          "Benchmark",
          `Depth ${comparison.depth}`,
          item.algorithm,
          item.depth,
          item.nodes,
          (item.elapsed / 1000).toFixed(4),
          item.move === null ? "-" : item.move + 1,
          item.score,
          comparison.sameMove && comparison.sameScore && comparison.fewerOrEqualNodes ? "PASS" : "CHECK",
          `sameMove=${comparison.sameMove}; sameScore=${comparison.sameScore}; alphaBetaFewerOrEqualNodes=${comparison.fewerOrEqualNodes}`
        ]);
      }
    }
    for (const check of result.validation.checks) {
      rows.push([
        "Validation",
        check.name,
        "",
        "",
        "",
        "",
        "",
        "",
        check.passed ? "PASS" : "CHECK",
        "Headless rule/search validation"
      ]);
    }
    for (const matchup of result.matchups) {
      rows.push([
        "AI Matchup",
        matchup.label,
        "Minimax + Alpha-Beta",
        `Red ${matchup.redDepth} / Yellow ${matchup.yellowDepth}`,
        matchup.totalNodes,
        "",
        "",
        "",
        matchup.passed ? "PASS" : "REVIEW",
        `expected=${matchup.expectedWinner}; observed=${matchup.winner}; moves=${matchup.moves}`
      ]);
    }
    if (result.matchups.length === 0) {
      rows.push([
        "AI Matchup",
        "Skipped by lab controls",
        "",
        "",
        "",
        "",
        "",
        "",
        "SKIP",
        "Enable AI matchup checks in the Experiment Lab to run these simulations."
      ]);
    }
    return `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`;
  }

  function buildExperimentSummaryText(result) {
    // Text output is intentionally plain so it is easy to attach or paste into notes.
    const totalPlainNodes = result.comparisons.reduce((sum, item) => sum + item.plain.nodes, 0);
    const totalPrunedNodes = result.comparisons.reduce((sum, item) => sum + item.alphaBeta.nodes, 0);
    const nodeReduction = totalPlainNodes === 0 ? 0 : ((1 - totalPrunedNodes / totalPlainNodes) * 100);
    const lines = [
      "Connect 4 AI Experiment Evidence",
      `Generated: ${result.generatedAt}`,
      `Board source: ${result.boardSourceLabel}`,
      `Benchmark depths: ${result.config.depths.join(", ")}`,
      `Validation games: ${result.config.validationGames}`,
      `Tie variation checks: ${result.config.tieVariation ? "enabled" : "disabled"}`,
      `AI matchup checks: ${result.config.includeMatchups ? "enabled" : "disabled"}`,
      `Player context: ${result.currentPlayer}`,
      `Legal moves in board snapshot: ${result.legalMoves.join(", ") || "none"}`,
      "Benchmark mode: one-ply tactical shortcuts are disabled for plain minimax vs alpha-beta comparisons.",
      "",
      "Main claim:",
      result.conclusion,
      `Total plain minimax nodes: ${totalPlainNodes}`,
      `Total alpha-beta nodes: ${totalPrunedNodes}`,
      `Node reduction: ${nodeReduction.toFixed(1)}%`,
      "",
      "Depth comparisons:"
    ];
    for (const comparison of result.comparisons) {
      lines.push(`Depth ${comparison.depth}: same move=${comparison.sameMove}, same score=${comparison.sameScore}, plain nodes=${comparison.plain.nodes}, alpha-beta nodes=${comparison.alphaBeta.nodes}`);
    }
    lines.push("", "Validation checks:");
    for (const check of result.validation.checks) {
      lines.push(`${check.passed ? "PASS" : "CHECK"} - ${check.name}`);
    }
    lines.push("", "AI matchup sanity checks:");
    if (result.matchups.length === 0) {
      lines.push("SKIP - Matchup checks were disabled in the Experiment Lab controls.");
    } else {
      for (const matchup of result.matchups) {
        lines.push(`${matchup.passed ? "PASS" : "REVIEW"} - ${matchup.label}: expected ${matchup.expectedWinner}, observed ${matchup.winner}, moves=${matchup.moves}, nodes=${matchup.totalNodes}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  const api = {
    normalizeExperimentConfig,
    runBenchmarkOnState,
    getBenchmarkDepths,
    createPreparedExperimentBoard,
    createExperimentBoardSnapshot,
    compareDepth,
    runValidationEvidence,
    runSingleMatchupEvidence,
    runMatchupEvidence,
    buildExperimentResult,
    buildExperimentResultWithProgress,
    buildExperimentSummaryText,
    experimentToCsv
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4Experiment = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
