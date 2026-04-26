const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const HUMAN = 1;
const AI = 2;
const WIN_SCORE = 100000;
const DROP_ANIMATION_MS = 300;

let board = createBoard();
let gameOver = false;
let isAiThinking = false;
let winningCells = [];
let moveToken = 0;
let currentPlayer = HUMAN;
let pendingComputerTimeout = null;
let hoverColumn = null;
let latestExperimentResult = null;
let moveHistory = [];
let replayStep = 0;
let replayTimer = null;
let finalStatusMessage = "";
let sidePanelView = "game";

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function copyBoard(source) {
  return source.map((row) => row.slice());
}

function isValidColumn(col) {
  return Number.isInteger(col) && col >= 0 && col < COLS;
}

function getLegalMoves(state) {
  const moves = [];
  for (let col = 0; col < COLS; col += 1) {
    if (state[0][col] === EMPTY) {
      moves.push(col);
    }
  }
  return moves;
}

function getOpenRow(state, col) {
  if (!isValidColumn(col)) {
    return -1;
  }

  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (state[row][col] === EMPTY) {
      return row;
    }
  }
  return -1;
}

function dropPiece(state, col, player) {
  const row = getOpenRow(state, col);
  if (row === -1) {
    return null;
  }
  state[row][col] = player;
  return row;
}

function isDraw(state) {
  return getLegalMoves(state).length === 0 && !checkWin(state, HUMAN).won && !checkWin(state, AI).won;
}

function checkWin(state, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1]
  ];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (state[row][col] !== player) {
        continue;
      }

      for (const [dr, dc] of directions) {
        const cells = [];
        for (let step = 0; step < 4; step += 1) {
          const r = row + dr * step;
          const c = col + dc * step;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS || state[r][c] !== player) {
            break;
          }
          cells.push([r, c]);
        }

        if (cells.length === 4) {
          return { won: true, cells };
        }
      }
    }
  }

  return { won: false, cells: [] };
}

function scoreWindow(windowCells) {
  const aiCount = windowCells.filter((cell) => cell === AI).length;
  const humanCount = windowCells.filter((cell) => cell === HUMAN).length;
  const emptyCount = windowCells.filter((cell) => cell === EMPTY).length;

  if (aiCount === 4) return WIN_SCORE;
  if (humanCount === 4) return -WIN_SCORE;
  if (aiCount === 3 && emptyCount === 1) return 100;
  if (humanCount === 3 && emptyCount === 1) return -120;
  if (aiCount === 2 && emptyCount === 2) return 10;
  if (humanCount === 2 && emptyCount === 2) return -15;
  return 0;
}

function evaluateBoard(state) {
  const aiWin = checkWin(state, AI);
  if (aiWin.won) return WIN_SCORE;
  const humanWin = checkWin(state, HUMAN);
  if (humanWin.won) return -WIN_SCORE;

  let score = 0;
  const centerCol = Math.floor(COLS / 2);
  let centerCount = 0;
  for (let row = 0; row < ROWS; row += 1) {
    if (state[row][centerCol] === AI) centerCount += 1;
    if (state[row][centerCol] === HUMAN) centerCount -= 1;
  }
  score += centerCount * 6;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col <= COLS - 4; col += 1) {
      score += scoreWindow([state[row][col], state[row][col + 1], state[row][col + 2], state[row][col + 3]]);
    }
  }

  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row <= ROWS - 4; row += 1) {
      score += scoreWindow([state[row][col], state[row + 1][col], state[row + 2][col], state[row + 3][col]]);
    }
  }

  for (let row = 0; row <= ROWS - 4; row += 1) {
    for (let col = 0; col <= COLS - 4; col += 1) {
      score += scoreWindow([state[row][col], state[row + 1][col + 1], state[row + 2][col + 2], state[row + 3][col + 3]]);
    }
  }

  for (let row = 3; row < ROWS; row += 1) {
    for (let col = 0; col <= COLS - 4; col += 1) {
      score += scoreWindow([state[row][col], state[row - 1][col + 1], state[row - 2][col + 2], state[row - 3][col + 3]]);
    }
  }

  return score;
}

function orderMoves(moves) {
  const center = Math.floor(COLS / 2);
  return moves.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
}

function getTerminalScore(aiWin, humanWin, depthRemaining) {
  if (aiWin) return WIN_SCORE + depthRemaining;
  if (humanWin) return -WIN_SCORE - depthRemaining;
  return 0;
}

function minimax(state, depth, alpha, beta, maximizingPlayer, useAlphaBeta, stats) {
  stats.nodes += 1;

  const legalMoves = orderMoves(getLegalMoves(state));
  const aiWin = checkWin(state, AI).won;
  const humanWin = checkWin(state, HUMAN).won;
  const terminal = aiWin || humanWin || legalMoves.length === 0;

  if (terminal) {
    return { column: null, score: getTerminalScore(aiWin, humanWin, depth) };
  }

  if (depth <= 0) {
    return { column: null, score: evaluateBoard(state) };
  }

  if (maximizingPlayer) {
    let value = -Infinity;
    let bestColumn = legalMoves[0];

    for (const col of legalMoves) {
      const next = copyBoard(state);
      dropPiece(next, col, AI);
      const result = minimax(next, depth - 1, alpha, beta, false, useAlphaBeta, stats);

      if (result.score > value) {
        value = result.score;
        bestColumn = col;
      }

      if (useAlphaBeta) {
        alpha = Math.max(alpha, value);
        if (alpha >= beta) {
          break;
        }
      }
    }

    return { column: bestColumn, score: value };
  }

  let value = Infinity;
  let bestColumn = legalMoves[0];

  for (const col of legalMoves) {
    const next = copyBoard(state);
    dropPiece(next, col, HUMAN);
    const result = minimax(next, depth - 1, alpha, beta, true, useAlphaBeta, stats);

    if (result.score < value) {
      value = result.score;
      bestColumn = col;
    }

    if (useAlphaBeta) {
      beta = Math.min(beta, value);
      if (alpha >= beta) {
        break;
      }
    }
  }

  return { column: bestColumn, score: value };
}

function chooseRootMove(state, depth, useAlphaBeta, player = AI, options = {}) {
  const searchDepth = Math.max(0, depth);
  const maximizing = player === AI;
  const stats = { nodes: 1 };
  const start = getNow();
  const legalMoves = orderMoves(getLegalMoves(state));
  let bestColumn = legalMoves[0] ?? null;
  let bestScore = maximizing ? -Infinity : Infinity;
  let tiedColumns = bestColumn === null ? [] : [bestColumn];
  let alpha = -Infinity;
  let beta = Infinity;

  for (const col of legalMoves) {
    const next = copyBoard(state);
    dropPiece(next, col, player);
    const childAlpha = options.randomizeTies ? -Infinity : alpha;
    const childBeta = options.randomizeTies ? Infinity : beta;
    const result = minimax(next, searchDepth - 1, childAlpha, childBeta, !maximizing, useAlphaBeta, stats);
    const isBetter = maximizing ? result.score > bestScore : result.score < bestScore;
    const isTie = result.score === bestScore;

    if (isBetter) {
      bestScore = result.score;
      bestColumn = col;
      tiedColumns = [col];
    } else if (isTie) {
      tiedColumns.push(col);
    }

    if (useAlphaBeta && !options.randomizeTies && maximizing) {
      alpha = Math.max(alpha, bestScore);
    } else if (useAlphaBeta && !options.randomizeTies) {
      beta = Math.min(beta, bestScore);
    }
  }

  if (options.randomizeTies && tiedColumns.length > 1) {
    const random = options.randomFn ?? Math.random;
    bestColumn = tiedColumns[Math.floor(random() * tiedColumns.length)];
  }

  const elapsed = getNow() - start;
  return {
    move: bestColumn,
    score: bestScore,
    depth,
    nodes: stats.nodes,
    elapsed,
    algorithm: useAlphaBeta ? "Minimax + Alpha-Beta" : "Plain Minimax",
    player,
    tiedMoves: tiedColumns
  };
}

function chooseComputerMove(state, depth, useAlphaBeta, player = AI, options = {}) {
  return chooseRootMove(state, depth, useAlphaBeta, player, options);
}

function chooseAiMove(state, depth, useAlphaBeta) {
  return chooseRootMove(state, depth, useAlphaBeta, AI);
}

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getWinner(state) {
  const redWin = checkWin(state, HUMAN);
  if (redWin.won) return { winner: HUMAN, cells: redWin.cells };
  const yellowWin = checkWin(state, AI);
  if (yellowWin.won) return { winner: AI, cells: yellowWin.cells };
  if (isDraw(state)) return { winner: EMPTY, cells: [] };
  return { winner: null, cells: [] };
}

function getImmediateWinningMoves(state, player) {
  const wins = [];
  for (const col of getLegalMoves(state)) {
    const next = copyBoard(state);
    dropPiece(next, col, player);
    if (checkWin(next, player).won) {
      wins.push(col);
    }
  }
  return wins;
}

function formatColumns(cols) {
  return cols.map((col) => col + 1).join(cols.length === 2 ? " and " : ", ");
}

function getOpponent(player) {
  return player === HUMAN ? AI : HUMAN;
}

function formatScoreForPlayer(score, player) {
  const rounded = Math.round(score);
  const direction = player === AI ? "higher favors Yellow" : "lower favors Red";
  return `${formatNumber(rounded)} (${direction})`;
}

function explainComputerMove(stateBeforeMove, result) {
  const player = result.player;
  const opponent = getOpponent(player);
  const playerName = formatPlayer(player);
  const opponentName = formatPlayer(opponent);
  const selectedColumn = result.move === null ? null : result.move + 1;
  const tiedMoves = result.tiedMoves ?? [];

  if (result.move === null) {
    return {
      reason: `${playerName} AI found no legal move, so the game is ending.`,
      scoreLabel: formatScoreForPlayer(result.score, player),
      tiedMovesLabel: "-"
    };
  }

  const next = copyBoard(stateBeforeMove);
  dropPiece(next, result.move, player);
  const winsNow = checkWin(next, player).won;
  const opponentThreats = getImmediateWinningMoves(stateBeforeMove, opponent);
  const opponentReplies = getImmediateWinningMoves(next, opponent);
  const createdThreats = winsNow ? [] : getImmediateWinningMoves(next, player);
  const centerColumn = Math.floor(COLS / 2);
  let reason;

  if (winsNow) {
    reason = `${playerName} AI chose column ${selectedColumn} because it immediately completes four in a row.`;
  } else if (opponentThreats.includes(result.move)) {
    reason = opponentThreats.length > 1
      ? `${playerName} AI chose column ${selectedColumn} to block one of ${opponentName}'s immediate winning threats in columns ${formatColumns(opponentThreats)} after depth-${result.depth} minimax evaluated the replies.`
      : `${playerName} AI chose column ${selectedColumn} to block ${opponentName}'s immediate winning threat after depth-${result.depth} minimax evaluated the replies.`;
  } else if (opponentReplies.length > 0) {
    reason = `${playerName} AI chose column ${selectedColumn} as the best depth-${result.depth} minimax option, but ${opponentName} still has an immediate reply threat in column ${formatColumns(opponentReplies)}.`;
  } else if (createdThreats.length > 1) {
    reason = `${playerName} AI chose column ${selectedColumn} because it creates multiple next-turn winning threats in columns ${formatColumns(createdThreats)}, with opponent replies considered by depth-${result.depth} minimax.`;
  } else if (createdThreats.length === 1) {
    reason = `${playerName} AI chose column ${selectedColumn} because it creates a next-turn threat in column ${formatColumns(createdThreats)} that the opponent can answer, and depth-${result.depth} minimax still rated it best.`;
  } else if (tiedMoves.length > 1) {
    reason = `${playerName} AI chose column ${selectedColumn} from equal depth-${result.depth} minimax choices: columns ${formatColumns(tiedMoves)}.`;
  } else if (result.move === centerColumn) {
    reason = `${playerName} AI chose the center column because center control contributes to more possible four-in-a-row lines in the depth-${result.depth} evaluation.`;
  } else {
    reason = `${playerName} AI chose column ${selectedColumn} because it had the best depth-${result.depth} minimax evaluation from this position.`;
  }

  return {
    reason,
    scoreLabel: formatScoreForPlayer(result.score, player),
    tiedMovesLabel: tiedMoves.length > 1 ? formatColumns(tiedMoves) : "No tie at the best score"
  };
}

function withComputerMoveExplanation(stateBeforeMove, result) {
  return {
    ...result,
    ...explainComputerMove(stateBeforeMove, result)
  };
}

function createSearchSnapshot(result) {
  return {
    player: result.player,
    algorithm: result.algorithm,
    depth: result.depth,
    nodes: result.nodes,
    elapsed: result.elapsed,
    score: result.score,
    scoreLabel: result.scoreLabel,
    reason: result.reason,
    tiedMoves: result.tiedMoves ?? [],
    tiedMovesLabel: result.tiedMovesLabel ?? "-"
  };
}

function playHeadlessGame(options = {}) {
  const depth = options.depth ?? 4;
  const redDepth = options.redDepth ?? depth;
  const yellowDepth = options.yellowDepth ?? depth;
  const useAlphaBeta = options.useAlphaBeta ?? true;
  const maxMoves = options.maxMoves ?? ROWS * COLS;
  const randomizeTies = options.randomizeTies ?? false;
  const randomFn = options.randomFn;
  const state = options.board ? copyBoard(options.board) : createBoard();
  const moves = [];
  let player = options.startingPlayer ?? HUMAN;
  let totalNodes = 0;
  let totalTime = 0;

  for (let turn = 0; turn < maxMoves; turn += 1) {
    const outcome = getWinner(state);
    if (outcome.winner !== null) {
      return { board: state, moves, winner: outcome.winner, totalNodes, totalTime };
    }

    const playerDepth = player === HUMAN ? redDepth : yellowDepth;
    const result = withComputerMoveExplanation(
      state,
      chooseComputerMove(state, playerDepth, useAlphaBeta, player, { randomizeTies, randomFn })
    );
    if (result.move === null || !getLegalMoves(state).includes(result.move)) {
      throw new Error(`Illegal headless move for player ${player}: ${result.move}`);
    }

    const row = dropPiece(state, result.move, player);
    moves.push({
      turn: turn + 1,
      player,
      column: result.move,
      row,
      score: result.score,
      nodes: result.nodes,
      elapsed: result.elapsed,
      algorithm: result.algorithm,
      reason: result.reason,
      tiedMoves: result.tiedMoves
    });
    totalNodes += result.nodes;
    totalTime += result.elapsed;
    player = player === HUMAN ? AI : HUMAN;
  }

  const outcome = getWinner(state);
  return { board: state, moves, winner: outcome.winner, totalNodes, totalTime };
}

function runHeadlessSuite(options = {}) {
  const depth = options.depth ?? 4;
  const redDepth = options.redDepth ?? depth;
  const yellowDepth = options.yellowDepth ?? depth;
  const games = options.games ?? 2;
  const useAlphaBeta = options.useAlphaBeta ?? true;
  const randomizeTies = options.randomizeTies ?? false;
  const alternateStart = options.alternateStart ?? false;
  const randomFn = options.seed === undefined ? Math.random : createSeededRandom(Number(options.seed));
  const checks = [];

  let state = createBoard();
  checks.push({ name: "empty board has 7 legal moves", passed: getLegalMoves(state).length === COLS });
  checks.push({ name: "piece drops to bottom row", passed: dropPiece(state, 0, HUMAN) === ROWS - 1 });
  checks.push({ name: "second piece stacks above first", passed: dropPiece(state, 0, AI) === ROWS - 2 });
  checks.push({
    name: "invalid columns are rejected without changing the board",
    passed: dropPiece(state, -1, HUMAN) === null
      && dropPiece(state, COLS, AI) === null
      && state.flat().filter((cell) => cell !== EMPTY).length === 2
  });

  state = createBoard();
  for (let row = 0; row < ROWS; row += 1) dropPiece(state, 0, row % 2 === 0 ? HUMAN : AI);
  checks.push({
    name: "full columns reject extra drops",
    passed: dropPiece(state, 0, HUMAN) === null && !getLegalMoves(state).includes(0)
  });
  checks.push({
    name: "move ordering checks center columns first",
    passed: orderMoves([0, 1, 2, 3, 4, 5, 6]).join(",") === "3,2,4,1,5,0,6"
  });

  state = createBoard();
  for (let col = 0; col < 4; col += 1) dropPiece(state, col, HUMAN);
  checks.push({ name: "horizontal win detected", passed: checkWin(state, HUMAN).won });

  state = createBoard();
  for (let row = 0; row < 4; row += 1) dropPiece(state, 2, AI);
  checks.push({ name: "vertical win detected", passed: checkWin(state, AI).won });

  state = createBoard();
  state[5][0] = HUMAN;
  state[4][1] = HUMAN;
  state[3][2] = HUMAN;
  state[2][3] = HUMAN;
  checks.push({ name: "diagonal up-right win detected", passed: checkWin(state, HUMAN).won });

  state = createBoard();
  state[2][0] = AI;
  state[3][1] = AI;
  state[4][2] = AI;
  state[5][3] = AI;
  checks.push({ name: "diagonal down-right win detected", passed: checkWin(state, AI).won });

  state = [
    [HUMAN, HUMAN, AI, AI, HUMAN, HUMAN, AI],
    [AI, AI, HUMAN, HUMAN, AI, AI, HUMAN],
    [HUMAN, HUMAN, AI, AI, HUMAN, HUMAN, AI],
    [AI, AI, HUMAN, HUMAN, AI, AI, HUMAN],
    [HUMAN, HUMAN, AI, AI, HUMAN, HUMAN, AI],
    [AI, AI, HUMAN, HUMAN, AI, AI, HUMAN]
  ];
  checks.push({ name: "full board draw detected", passed: isDraw(state) && getWinner(state).winner === EMPTY });

  state = createBoard();
  dropPiece(state, 0, HUMAN);
  dropPiece(state, 1, HUMAN);
  dropPiece(state, 2, HUMAN);
  checks.push({
    name: "immediate winning move detected",
    passed: getImmediateWinningMoves(state, HUMAN).includes(3)
  });

  state = createBoard();
  dropPiece(state, 0, AI);
  dropPiece(state, 1, AI);
  dropPiece(state, 2, AI);
  checks.push({
    name: "opponent winning threat detected",
    passed: getImmediateWinningMoves(state, AI).includes(3)
  });

  state = createBoard();
  dropPiece(state, 0, HUMAN);
  dropPiece(state, 1, HUMAN);
  dropPiece(state, 2, HUMAN);
  checks.push({
    name: "red minimizer takes an immediate win",
    passed: chooseComputerMove(state, 4, useAlphaBeta, HUMAN, { randomizeTies: false }).move === 3
  });

  state = createBoard();
  dropPiece(state, 0, AI);
  dropPiece(state, 1, AI);
  dropPiece(state, 2, AI);
  checks.push({
    name: "red minimizer blocks an immediate yellow win",
    passed: chooseComputerMove(state, 4, useAlphaBeta, HUMAN, { randomizeTies: false }).move === 3
  });

  state = createBoard();
  dropPiece(state, 0, HUMAN);
  dropPiece(state, 1, HUMAN);
  dropPiece(state, 2, HUMAN);
  const explainedRisk = withComputerMoveExplanation(state, {
    move: 4,
    score: -90,
    depth: 2,
    nodes: 1,
    elapsed: 0,
    algorithm: "Minimax + Alpha-Beta",
    player: AI,
    tiedMoves: [4]
  });
  checks.push({
    name: "AI reason labels opponent reply threats clearly",
    passed: explainedRisk.reason.includes("immediate reply threat") && !explainedRisk.reason.includes("creates a next-turn threat")
  });

  state = createBoard();
  dropPiece(state, 0, AI);
  dropPiece(state, 1, AI);
  dropPiece(state, 2, AI);
  dropPiece(state, 3, AI);
  const fasterAiWin = minimax(state, 5, -Infinity, Infinity, false, useAlphaBeta, { nodes: 0 }).score;
  const slowerAiWin = minimax(state, 1, -Infinity, Infinity, false, useAlphaBeta, { nodes: 0 }).score;
  checks.push({
    name: "terminal scoring rewards quicker AI wins",
    passed: fasterAiWin > slowerAiWin
  });

  state = createBoard();
  dropPiece(state, 0, HUMAN);
  dropPiece(state, 1, HUMAN);
  dropPiece(state, 2, HUMAN);
  dropPiece(state, 3, HUMAN);
  const fasterAiLoss = minimax(state, 5, -Infinity, Infinity, true, useAlphaBeta, { nodes: 0 }).score;
  const slowerAiLoss = minimax(state, 1, -Infinity, Infinity, true, useAlphaBeta, { nodes: 0 }).score;
  checks.push({
    name: "terminal scoring delays unavoidable AI losses",
    passed: fasterAiLoss < slowerAiLoss
  });

  state = createBoard();
  const plain = chooseAiMove(state, depth, false);
  const pruned = chooseAiMove(state, depth, true);
  checks.push({ name: "alpha-beta selects same move as minimax", passed: plain.move === pruned.move });
  checks.push({ name: "alpha-beta searches no more nodes", passed: pruned.nodes <= plain.nodes });

  state = createBoard();
  dropPiece(state, 3, HUMAN);
  dropPiece(state, 3, AI);
  dropPiece(state, 2, HUMAN);
  const redBest = chooseComputerMove(state, redDepth, useAlphaBeta, HUMAN, { randomizeTies: false });
  const redVaried = chooseComputerMove(state, redDepth, useAlphaBeta, HUMAN, {
    randomizeTies: true,
    randomFn: createSeededRandom(11)
  });
  const yellowBest = chooseComputerMove(state, yellowDepth, useAlphaBeta, AI, { randomizeTies: false });
  const yellowVaried = chooseComputerMove(state, yellowDepth, useAlphaBeta, AI, {
    randomizeTies: true,
    randomFn: createSeededRandom(13)
  });
  checks.push({
    name: "equal-score variation preserves red best minimax score",
    passed: redBest.score === redVaried.score && redVaried.depth === redDepth
  });
  checks.push({
    name: "equal-score variation preserves yellow best minimax score",
    passed: yellowBest.score === yellowVaried.score && yellowVaried.depth === yellowDepth
  });

  const simulations = [];
  for (let game = 0; game < games; game += 1) {
    simulations.push(playHeadlessGame({
      depth,
      redDepth,
      yellowDepth,
      useAlphaBeta,
      randomizeTies,
      randomFn,
      startingPlayer: alternateStart && game % 2 === 1 ? AI : HUMAN
    }));
  }

  return {
    depth,
    redDepth,
    yellowDepth,
    games,
    useAlphaBeta,
    randomizeTies,
    alternateStart,
    checks,
    passed: checks.every((check) => check.passed),
    simulations: simulations.map((simulation, index) => ({
      game: index + 1,
      winner: formatPlayer(simulation.winner),
      moves: simulation.moves.length,
      totalNodes: simulation.totalNodes,
      totalTimeSeconds: Number((simulation.totalTime / 1000).toFixed(4)),
      moveSequence: simulation.moves.map((move) => `${move.player === HUMAN ? "R" : "Y"}${move.column + 1}`).join(" ")
    }))
  };
}

function formatPlayer(player) {
  if (player === HUMAN) return "Red";
  if (player === AI) return "Yellow";
  if (player === EMPTY) return "Draw";
  return "None";
}

function getNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(3)} s`;
}

function setStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
}

function recordMove(row, col, player, metadata = {}) {
  moveHistory.push({ row, col, player, ...metadata });
  replayStep = moveHistory.length;
}

function buildBoardFromMoves(step) {
  const replayBoard = createBoard();
  for (const move of moveHistory.slice(0, step)) {
    dropPiece(replayBoard, move.col, move.player);
  }
  return replayBoard;
}

function stopReplayPlayback() {
  if (replayTimer !== null) {
    window.clearTimeout(replayTimer);
    replayTimer = null;
  }
  const playButton = document.getElementById("replayPlayButton");
  if (playButton) playButton.textContent = "Play";
}

function getReplaySpeedMs() {
  const speed = document.getElementById("replaySpeed");
  return speed ? Number(speed.value) : 700;
}

function updateReplaySpeedLabel() {
  const label = document.getElementById("replaySpeedLabel");
  if (!label) return;
  label.textContent = `${(getReplaySpeedMs() / 1000).toFixed(2)} s / move`;
}

function getReplayDescription() {
  if (moveHistory.length === 0) {
    return "No completed game to replay yet.";
  }
  if (replayStep === 0) {
    return `Move 0 of ${moveHistory.length}: empty board before the first drop.`;
  }

  const move = moveHistory[replayStep - 1];
  const player = move.search ? `${formatPlayer(move.player)} AI` : formatPlayer(move.player);
  const moveText = `Move ${replayStep} of ${moveHistory.length}: ${player} dropped in column ${move.col + 1}.`;
  if (replayStep === moveHistory.length && finalStatusMessage) {
    return `${moveText} Final position: ${finalStatusMessage}`;
  }
  return moveText;
}

function updateReplayMoveInsight() {
  const panel = document.getElementById("replayMoveInsight");
  if (!panel) return;

  const move = replayStep > 0 ? moveHistory[replayStep - 1] : null;
  if (!move || !move.search) {
    panel.hidden = true;
    return;
  }

  const search = move.search;
  panel.hidden = false;
  document.getElementById("replayMoveReason").textContent = search.reason;
  document.getElementById("replayInsightPlayer").textContent = `${formatPlayer(search.player)} AI`;
  document.getElementById("replayInsightAlgorithm").textContent = search.algorithm;
  document.getElementById("replayInsightDepth").textContent = search.depth;
  document.getElementById("replayInsightNodes").textContent = formatNumber(search.nodes);
  document.getElementById("replayInsightTime").textContent = formatSeconds(search.elapsed);
  document.getElementById("replayInsightScore").textContent = search.scoreLabel;
  document.getElementById("replayInsightTies").textContent = search.tiedMovesLabel;
}

function updateSidePanelView() {
  const sidePanel = document.getElementById("sidePanel");
  if (!sidePanel) return;

  const canReplay = gameOver && moveHistory.length > 0;
  if (!canReplay && sidePanelView === "replay") {
    sidePanelView = "game";
  }

  sidePanel.dataset.activeView = sidePanelView;
  const controlsButton = document.getElementById("controlsTabButton");
  const replayButton = document.getElementById("replayTabButton");
  if (controlsButton) controlsButton.classList.toggle("active", sidePanelView === "game");
  if (replayButton) {
    replayButton.classList.toggle("active", sidePanelView === "replay");
    replayButton.disabled = !canReplay;
    replayButton.title = canReplay ? "Review the completed game" : "Replay is available after a completed game";
  }
}

function setSidePanelView(view) {
  const canReplay = gameOver && moveHistory.length > 0;
  sidePanelView = view === "replay" && canReplay ? "replay" : "game";
  updateSidePanelView();
}

function updateReplayControls() {
  const panel = document.getElementById("replayPanel");
  if (!panel) return;
  const hasMoves = moveHistory.length > 0;
  panel.hidden = !gameOver || !hasMoves;
  updateSidePanelView();
  if (!gameOver || !hasMoves) {
    updateReplayMoveInsight();
    return;
  }

  const slider = document.getElementById("replaySlider");
  const count = document.getElementById("replayCount");
  const description = document.getElementById("replayDescription");
  const prevButton = document.getElementById("replayPrevButton");
  const nextButton = document.getElementById("replayNextButton");
  slider.max = String(moveHistory.length);
  slider.value = String(replayStep);
  count.textContent = `${replayStep} / ${moveHistory.length}`;
  description.textContent = getReplayDescription();
  prevButton.disabled = replayStep <= 0;
  nextButton.disabled = replayStep >= moveHistory.length;
  updateReplayMoveInsight();
  updateReplaySpeedLabel();
}

function showReplayStep(step, options = {}) {
  if (!options.keepPlaying) {
    stopReplayPlayback();
  }
  replayStep = Math.min(Math.max(Number(step), 0), moveHistory.length);
  board = buildBoardFromMoves(replayStep);
  const outcome = getWinner(board);
  winningCells = outcome.winner === HUMAN || outcome.winner === AI ? outcome.cells : [];
  renderBoard();
  updateReplayControls();
  setStatus(`Replay: ${getReplayDescription()}`);
}

function scheduleReplayAdvance() {
  replayTimer = window.setTimeout(() => {
    if (replayStep >= moveHistory.length) {
      stopReplayPlayback();
      return;
    }
    showReplayStep(replayStep + 1, { keepPlaying: true });
    if (replayStep >= moveHistory.length) {
      stopReplayPlayback();
      return;
    }
    scheduleReplayAdvance();
  }, getReplaySpeedMs());
}

function toggleReplayPlayback() {
  if (moveHistory.length === 0) return;
  if (replayTimer !== null) {
    stopReplayPlayback();
    return;
  }
  if (replayStep >= moveHistory.length) {
    showReplayStep(0, { keepPlaying: true });
  }
  document.getElementById("replayPlayButton").textContent = "Pause";
  scheduleReplayAdvance();
}

function finishGame(message, cells = []) {
  gameOver = true;
  isAiThinking = false;
  winningCells = cells;
  finalStatusMessage = message;
  replayStep = moveHistory.length;
  stopReplayPlayback();
  setStatus(message);
  renderBoard();
  updateReplayControls();
}

function resetReplay() {
  stopReplayPlayback();
  moveHistory = [];
  replayStep = 0;
  finalStatusMessage = "";
  sidePanelView = "game";
  updateReplayControls();
}

function renderBoard(options = {}) {
  const boardElement = document.getElementById("board");
  boardElement.innerHTML = "";
  const winSet = new Set(winningCells.map(([row, col]) => `${row},${col}`));
  const hiddenCell = options.hiddenCell ? `${options.hiddenCell.row},${options.hiddenCell.col}` : null;
  const ghostRow = getGhostRow();

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.col = String(col);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}`);
      if (`${row},${col}` !== hiddenCell) {
        if (board[row][col] === HUMAN) cell.classList.add("red");
        if (board[row][col] === AI) cell.classList.add("yellow");
        if (row === ghostRow && col === hoverColumn && board[row][col] === EMPTY) {
          cell.classList.add("ghost", "red");
          cell.setAttribute("aria-label", `Preview red piece in column ${col + 1}`);
        }
      }
      if (winSet.has(`${row},${col}`)) cell.classList.add("win");
      boardElement.appendChild(cell);
    }
  }

  updateColumnButtons();
}

function animateDrop(row, col, player) {
  const boardElement = document.getElementById("board");
  const targetIndex = row * COLS + col;
  const targetCell = boardElement.children[targetIndex];

  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!targetCell || reduceMotion) {
    return Promise.resolve();
  }

  const boardRect = boardElement.getBoundingClientRect();
  const targetRect = targetCell.getBoundingClientRect();
  const fallingPiece = document.createElement("div");
  const finalX = targetRect.left - boardRect.left - boardElement.clientLeft;
  const finalY = targetRect.top - boardRect.top - boardElement.clientTop;
  const startOffset = -(finalY + targetRect.height + 18);
  const duration = DROP_ANIMATION_MS + row * 34;

  fallingPiece.className = `falling-piece ${player === HUMAN ? "red" : "yellow"}`;
  fallingPiece.style.width = `${targetRect.width}px`;
  fallingPiece.style.height = `${targetRect.height}px`;
  fallingPiece.style.left = `${finalX}px`;
  fallingPiece.style.top = `${finalY}px`;

  boardElement.appendChild(fallingPiece);

  return new Promise((resolve) => {
    const finish = () => {
      fallingPiece.remove();
      resolve();
    };

    if (typeof fallingPiece.animate === "function") {
      const animation = fallingPiece.animate(
        [
          { transform: `translate3d(0, ${startOffset}px, 0)` },
          { transform: "translate3d(0, 0, 0)" }
        ],
        {
          duration,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards"
        }
      );
      animation.addEventListener("finish", finish, { once: true });
      return;
    }

    fallingPiece.style.setProperty("--drop-start", `${startOffset}px`);
    fallingPiece.style.setProperty("--drop-duration", `${duration}ms`);
    fallingPiece.classList.add("css-drop");
    window.setTimeout(finish, duration);
  });
}

function createColumnControls() {
  const controls = document.getElementById("columnControls");
  controls.innerHTML = "";

  for (let col = 0; col < COLS; col += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "column-button";
    button.textContent = col + 1;
    button.setAttribute("aria-label", `Drop piece in column ${col + 1}`);
    button.addEventListener("click", () => handleHumanMove(col));
    button.addEventListener("mouseenter", () => setHoverColumn(col));
    button.addEventListener("focus", () => setHoverColumn(col));
    button.addEventListener("mouseleave", clearHoverColumn);
    button.addEventListener("blur", clearHoverColumn);
    controls.appendChild(button);
  }
}

function updateColumnButtons() {
  const buttons = document.querySelectorAll(".column-button");
  buttons.forEach((button, col) => {
    button.disabled = isRedAiEnabled() || gameOver || isAiThinking || currentPlayer !== HUMAN || board[0][col] !== EMPTY;
    button.classList.toggle("hover-preview", hoverColumn === col && !button.disabled);
  });
}

async function handleHumanMove(col) {
  if (isRedAiEnabled() || currentPlayer !== HUMAN || gameOver || isAiThinking || board[0][col] !== EMPTY) {
    return;
  }

  isAiThinking = true;
  hoverColumn = null;
  const activeToken = moveToken;
  const row = dropPiece(board, col, HUMAN);
  recordMove(row, col, HUMAN);
  setStatus("Dropping red piece...");
  renderBoard({ hiddenCell: { row, col } });
  await animateDrop(row, col, HUMAN);
  if (activeToken !== moveToken) return;

  const humanWin = checkWin(board, HUMAN);
  if (humanWin.won) {
    finishGame("You win. Red connected four.", humanWin.cells);
    return;
  }

  if (isDraw(board)) {
    finishGame("Draw. The board is full.");
    return;
  }

  currentPlayer = AI;
  renderBoard();
  setStatus(getTurnStatus());
  updateColumnButtons();

  window.setTimeout(() => makeComputerMove(activeToken), 70);
}

async function makeComputerMove(activeToken = moveToken) {
  if (activeToken !== moveToken) return;
  pendingComputerTimeout = null;
  const depth = getDepthForPlayer(currentPlayer);
  const useAlphaBeta = document.getElementById("useAlphaBeta").checked;
  const searchState = copyBoard(board);
  const result = withComputerMoveExplanation(
    searchState,
    chooseComputerMove(board, depth, useAlphaBeta, currentPlayer, {
      randomizeTies: isRedAiEnabled() && currentPlayer === HUMAN
    })
  );
  if (activeToken !== moveToken) return;

  if (result.move !== null) {
    const row = dropPiece(board, result.move, currentPlayer);
    recordMove(row, result.move, currentPlayer, { source: "ai", search: createSearchSnapshot(result) });
    renderBoard({ hiddenCell: { row, col: result.move } });
    await animateDrop(row, result.move, currentPlayer);
    if (activeToken !== moveToken) return;
  }

  updateStats(result);

  const outcome = getWinner(board);
  if (outcome.winner === HUMAN) {
    finishGame(isRedAiEnabled() ? "Red AI wins. Red connected four." : "You win. Red connected four.", outcome.cells);
  } else if (outcome.winner === AI) {
    finishGame("Yellow AI wins. Yellow connected four.", outcome.cells);
  } else if (outcome.winner === EMPTY) {
    finishGame("Draw. The board is full.");
  } else {
    currentPlayer = currentPlayer === HUMAN ? AI : HUMAN;
    setStatus(getTurnStatus());
    isAiThinking = false;
    renderBoard();
  }

  if (!gameOver && shouldComputerPlayCurrentTurn()) {
    scheduleComputerMove(activeToken);
  }
}

function updateStats(result) {
  document.getElementById("statPlayer").textContent = result.player === HUMAN ? "Red" : "Yellow";
  document.getElementById("statAlgorithm").textContent = result.algorithm;
  document.getElementById("statDepth").textContent = result.depth;
  document.getElementById("statNodes").textContent = formatNumber(result.nodes);
  document.getElementById("statTime").textContent = formatSeconds(result.elapsed);
  document.getElementById("statMove").textContent = result.move === null ? "-" : String(result.move + 1);
  const reason = document.getElementById("statReason");
  if (reason) {
    reason.textContent = result.reason ?? "Waiting for the next AI move.";
  }
}

function resetGame() {
  moveToken += 1;
  clearPendingComputerMove();
  board = createBoard();
  gameOver = false;
  isAiThinking = false;
  winningCells = [];
  hoverColumn = null;
  currentPlayer = HUMAN;
  resetReplay();
  setStatus(getTurnStatus());
  updateStats({
    algorithm: document.getElementById("useAlphaBeta").checked ? "Minimax + Alpha-Beta" : "Plain Minimax",
    depth: getDepthForPlayer(AI),
    nodes: 0,
    elapsed: 0,
    move: null,
    player: AI
  });
  renderBoard();
  if (shouldComputerPlayCurrentTurn()) {
    scheduleComputerMove(moveToken);
  }
}

function isRedAiEnabled() {
  const redAiEnabled = document.getElementById("redAiEnabled");
  return Boolean(redAiEnabled && redAiEnabled.checked);
}

function getDepthForPlayer(player) {
  const id = player === HUMAN ? "redDifficulty" : "difficulty";
  return Number(document.getElementById(id).value);
}

function shouldComputerPlayCurrentTurn() {
  return !gameOver && (currentPlayer === AI || (currentPlayer === HUMAN && isRedAiEnabled()));
}

function getTurnStatus() {
  if (gameOver) return "";
  const currentWins = getImmediateWinningMoves(board, currentPlayer);
  const opponent = currentPlayer === HUMAN ? AI : HUMAN;
  const opponentWins = getImmediateWinningMoves(board, opponent);

  if (currentPlayer === HUMAN) {
    const base = isRedAiEnabled() ? "Red AI is thinking." : "Your turn.";
    if (currentWins.length > 0) {
      return `${base} Winning move available in column ${formatColumns(currentWins)}.`;
    }
    if (opponentWins.length > 1) {
      return `${base} Unavoidable threat: Yellow can win next turn in columns ${formatColumns(opponentWins)}.`;
    }
    if (opponentWins.length === 1) {
      return `${base} Warning: block Yellow's winning threat in column ${formatColumns(opponentWins)}.`;
    }
    return isRedAiEnabled() ? "Red AI is thinking..." : "Your turn. Drop a red piece.";
  }

  if (currentWins.length > 0) {
    return `Yellow AI is thinking. Winning move available in column ${formatColumns(currentWins)}.`;
  }
  if (opponentWins.length > 1) {
    return `Yellow AI is thinking. Unavoidable threat: Red can win next turn in columns ${formatColumns(opponentWins)}.`;
  }
  if (opponentWins.length === 1) {
    return `Yellow AI is thinking. Must block Red's winning threat in column ${formatColumns(opponentWins)}.`;
  }
  return "Yellow AI is thinking...";
}

function scheduleComputerMove(activeToken) {
  clearPendingComputerMove();
  if (!shouldComputerPlayCurrentTurn()) return;
  isAiThinking = true;
  setStatus(getTurnStatus());
  updateColumnButtons();
  pendingComputerTimeout = window.setTimeout(() => makeComputerMove(activeToken), currentPlayer === AI ? 120 : 260);
}

function clearPendingComputerMove() {
  if (pendingComputerTimeout !== null) {
    window.clearTimeout(pendingComputerTimeout);
    pendingComputerTimeout = null;
  }
}

function handleRedAiToggle() {
  if (gameOver) {
    updateColumnButtons();
    return;
  }

  if (currentPlayer === HUMAN && isRedAiEnabled()) {
    scheduleComputerMove(moveToken);
    return;
  }

  if (currentPlayer === HUMAN && !isRedAiEnabled()) {
    clearPendingComputerMove();
    isAiThinking = false;
    setStatus(getTurnStatus());
    renderBoard();
  }
}

function isManualHumanTurn() {
  return !isRedAiEnabled() && currentPlayer === HUMAN && !gameOver && !isAiThinking;
}

function getGhostRow() {
  if (hoverColumn === null || !isManualHumanTurn()) return -1;
  return getOpenRow(board, hoverColumn);
}

function setHoverColumn(col) {
  if (!isManualHumanTurn() || board[0][col] !== EMPTY) {
    clearHoverColumn();
    return;
  }
  if (hoverColumn === col) return;
  hoverColumn = col;
  renderBoard();
}

function clearHoverColumn() {
  if (hoverColumn === null) return;
  hoverColumn = null;
  renderBoard();
}

function handleBoardPointer(event) {
  const cell = event.target.closest(".cell");
  if (!cell) {
    clearHoverColumn();
    return;
  }
  setHoverColumn(Number(cell.dataset.col));
}

function handleBoardClick(event) {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  handleHumanMove(Number(cell.dataset.col));
}

function handleKeyboardDrop(event) {
  if (!/^[1-7]$/.test(event.key)) return;
  if (isExperimentLabOpen()) return;
  const activeTag = document.activeElement ? document.activeElement.tagName : "";
  if (activeTag === "INPUT" || activeTag === "SELECT" || activeTag === "TEXTAREA") return;
  const col = Number(event.key) - 1;
  if (!isManualHumanTurn() || board[0][col] !== EMPTY) return;
  event.preventDefault();
  handleHumanMove(col);
}

function toggleStats() {
  const statsPanel = document.getElementById("statsPanel");
  statsPanel.hidden = !document.getElementById("showStats").checked;
}

function runBenchmarkOnState(state, depths = [3, 4, 5]) {
  const rows = [];
  for (const depth of depths) {
    rows.push(chooseAiMove(state, depth, false));
    rows.push(chooseAiMove(state, depth, true));
  }
  return rows;
}

function openExperimentLab() {
  const overlay = document.getElementById("experimentOverlay");
  overlay.hidden = false;
  document.getElementById("runExperimentButton").focus();
}

function closeExperimentLab() {
  document.getElementById("experimentOverlay").hidden = true;
}

function isExperimentLabOpen() {
  const overlay = document.getElementById("experimentOverlay");
  return Boolean(overlay && !overlay.hidden);
}

function getExperimentControlValue(id, fallback) {
  if (typeof document === "undefined") return fallback;
  const element = document.getElementById(id);
  return element ? element.value : fallback;
}

function getExperimentControlChecked(id, fallback) {
  if (typeof document === "undefined") return fallback;
  const element = document.getElementById(id);
  return element ? element.checked : fallback;
}

function getExperimentConfig(overrides = {}) {
  const maxDepth = Number(overrides.maxDepth ?? getExperimentControlValue("experimentMaxDepth", 5));
  const validationGames = Number(overrides.validationGames ?? getExperimentControlValue("experimentValidationGames", 2));
  return {
    boardSource: overrides.boardSource ?? getExperimentControlValue("experimentBoardSource", "empty"),
    maxDepth: Math.min(Math.max(maxDepth || 5, 3), 6),
    validationGames: Math.min(Math.max(validationGames || 2, 1), 6),
    tieVariation: overrides.tieVariation ?? getExperimentControlChecked("experimentTieVariation", true),
    includeMatchups: overrides.includeMatchups ?? getExperimentControlChecked("experimentMatchups", true)
  };
}

function getBenchmarkDepths(maxDepth) {
  return Array.from({ length: maxDepth - 1 }, (_, index) => index + 2);
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function setExperimentProgress(percent, label) {
  const progress = document.getElementById("experimentProgress");
  if (!progress) return;
  const clamped = Math.min(Math.max(percent, 0), 100);
  progress.hidden = false;
  document.getElementById("experimentProgressFill").style.width = `${clamped}%`;
  document.getElementById("experimentProgressPercent").textContent = `${Math.round(clamped)}%`;
  document.getElementById("experimentProgressLabel").textContent = label;
}

function hideExperimentProgress() {
  const progress = document.getElementById("experimentProgress");
  if (progress) progress.hidden = true;
}

function createPreparedExperimentBoard() {
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

function getExperimentBoardSnapshot(source) {
  if (source === "current") {
    return {
      state: copyBoard(board),
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

function buildExperimentResult(overrides = {}) {
  const config = getExperimentConfig(overrides);
  const depths = getBenchmarkDepths(config.maxDepth);
  const boardSnapshot = getExperimentBoardSnapshot(config.boardSource);
  const snapshot = boardSnapshot.state;
  const comparisons = depths.map((depth) => {
    const plain = chooseAiMove(snapshot, depth, false);
    const pruned = chooseAiMove(snapshot, depth, true);
    return {
      depth,
      plain,
      alphaBeta: pruned,
      sameMove: plain.move === pruned.move,
      sameScore: plain.score === pruned.score,
      fewerOrEqualNodes: pruned.nodes <= plain.nodes
    };
  });

  const validation = runHeadlessSuite({
    depth: 3,
    redDepth: 2,
    yellowDepth: 4,
    games: config.validationGames,
    useAlphaBeta: true,
    randomizeTies: config.tieVariation,
    seed: 42
  });

  const matchups = config.includeMatchups ? [
    {
      label: "Easy Red Autopilot vs Expert Yellow Opponent",
      redDepth: 2,
      yellowDepth: 6,
      expectedWinner: "Yellow",
      simulation: playHeadlessGame({
        redDepth: 2,
        yellowDepth: 6,
        useAlphaBeta: true,
        randomizeTies: true,
        randomFn: createSeededRandom(101)
      })
    },
    {
      label: "Expert Red Autopilot vs Easy Yellow Opponent",
      redDepth: 6,
      yellowDepth: 2,
      expectedWinner: "Red",
      simulation: playHeadlessGame({
        redDepth: 6,
        yellowDepth: 2,
        useAlphaBeta: true,
        randomizeTies: true,
        randomFn: createSeededRandom(202)
      })
    }
  ].map((matchup) => ({
    ...matchup,
    winner: formatPlayer(matchup.simulation.winner),
    moves: matchup.simulation.moves.length,
    totalNodes: matchup.simulation.totalNodes,
    passed: formatPlayer(matchup.simulation.winner) === matchup.expectedWinner
  })) : [];

  return {
    generatedAt: new Date().toISOString(),
    config: {
      ...config,
      depths
    },
    boardSourceLabel: boardSnapshot.label,
    boardSourceShortLabel: boardSnapshot.shortLabel,
    currentBoard: snapshot,
    legalMoves: getLegalMoves(snapshot).map((col) => col + 1),
    currentPlayer: boardSnapshot.playerLabel,
    comparisons,
    validation,
    matchups,
    conclusion: "Alpha-beta should preserve the minimax move and score while searching fewer or equal nodes."
  };
}

async function buildExperimentResultWithProgress() {
  const config = getExperimentConfig();
  const depths = getBenchmarkDepths(config.maxDepth);
  const boardSnapshot = getExperimentBoardSnapshot(config.boardSource);
  const snapshot = boardSnapshot.state;
  const comparisons = [];
  const matchupTasks = config.includeMatchups ? 2 : 0;
  const totalSteps = depths.length * 2 + 1 + matchupTasks + 1;
  let completedSteps = 0;

  const advance = async (label, increment = 0) => {
    completedSteps += increment;
    setExperimentProgress((completedSteps / totalSteps) * 100, label);
    await yieldToBrowser();
  };

  await advance("Preparing board snapshot...");

  for (const depth of depths) {
    await advance(`Running plain minimax at depth ${depth}...`);
    const plain = chooseAiMove(snapshot, depth, false);
    await advance(`Running alpha-beta at depth ${depth}...`, 1);
    const pruned = chooseAiMove(snapshot, depth, true);
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
  const validation = runHeadlessSuite({
    depth: 3,
    redDepth: 2,
    yellowDepth: 4,
    games: config.validationGames,
    useAlphaBeta: true,
    randomizeTies: config.tieVariation,
    seed: 42
  });
  await advance("Validation checks complete.", 1);

  const matchups = [];
  if (config.includeMatchups) {
    const matchupDefinitions = [
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

    for (const matchup of matchupDefinitions) {
      await advance(`Running matchup: ${matchup.label}...`);
      const simulation = playHeadlessGame({
        redDepth: matchup.redDepth,
        yellowDepth: matchup.yellowDepth,
        useAlphaBeta: true,
        randomizeTies: true,
        randomFn: createSeededRandom(matchup.seed)
      });
      matchups.push({
        ...matchup,
        simulation,
        winner: formatPlayer(simulation.winner),
        moves: simulation.moves.length,
        totalNodes: simulation.totalNodes,
        passed: formatPlayer(simulation.winner) === matchup.expectedWinner
      });
      await advance(`Finished matchup: ${matchup.label}.`, 1);
    }
  }

  await advance("Rendering experiment evidence...", 1);

  return {
    generatedAt: new Date().toISOString(),
    config: {
      ...config,
      depths
    },
    boardSourceLabel: boardSnapshot.label,
    boardSourceShortLabel: boardSnapshot.shortLabel,
    currentBoard: snapshot,
    legalMoves: getLegalMoves(snapshot).map((col) => col + 1),
    currentPlayer: boardSnapshot.playerLabel,
    comparisons,
    validation,
    matchups,
    conclusion: "Alpha-beta should preserve the minimax move and score while searching fewer or equal nodes."
  };
}

function renderExperimentResult(result) {
  const rowsElement = document.getElementById("benchmarkRows");
  const proofGrid = document.getElementById("proofGrid");
  const summary = document.getElementById("experimentSummary");
  const kpis = document.getElementById("experimentKpis");
  const validationRows = document.getElementById("validationRows");
  const matchupRows = document.getElementById("matchupRows");
  rowsElement.innerHTML = "";

  for (const comparison of result.comparisons) {
    for (const item of [comparison.plain, comparison.alphaBeta]) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.algorithm}</td>
        <td>${item.depth}</td>
        <td>${formatNumber(item.nodes)}</td>
        <td>${formatSeconds(item.elapsed)}</td>
        <td>${item.move === null ? "-" : item.move + 1}</td>
        <td>${item.score}</td>
        <td>${comparison.sameMove && comparison.sameScore ? "Same minimax result" : "Review mismatch"}</td>
      `;
      rowsElement.appendChild(row);
    }
  }

  const totalPlainNodes = result.comparisons.reduce((sum, item) => sum + item.plain.nodes, 0);
  const totalPrunedNodes = result.comparisons.reduce((sum, item) => sum + item.alphaBeta.nodes, 0);
  const allSame = result.comparisons.every((item) => item.sameMove && item.sameScore);
  const allPruned = result.comparisons.every((item) => item.fewerOrEqualNodes);
  const validationPassed = result.validation.passed;
  const matchupsPassed = result.config.includeMatchups ? result.matchups.every((item) => item.passed) : null;
  const nodeReduction = totalPlainNodes === 0 ? 0 : ((1 - totalPrunedNodes / totalPlainNodes) * 100);
  const depthLabel = result.config.depths.join(", ");

  summary.textContent = `Generated ${new Date(result.generatedAt).toLocaleString()}. Board: ${result.boardSourceLabel}. Depths tested: ${depthLabel}. Alpha-beta searched ${formatNumber(totalPrunedNodes)} nodes versus ${formatNumber(totalPlainNodes)} plain minimax nodes.`;

  kpis.innerHTML = `
    <div><span>Board</span><strong>${result.boardSourceShortLabel}</strong></div>
    <div><span>Depths Tested</span><strong>${depthLabel}</strong></div>
    <div><span>Node Reduction</span><strong>${nodeReduction.toFixed(1)}%</strong></div>
    <div><span>Plain Nodes</span><strong>${formatNumber(totalPlainNodes)}</strong></div>
    <div><span>Alpha-Beta Nodes</span><strong>${formatNumber(totalPrunedNodes)}</strong></div>
    <div><span>Validation Checks</span><strong>${result.validation.checks.filter((check) => check.passed).length}/${result.validation.checks.length}</strong></div>
  `;

  const proofItems = [
    { label: "Same move and score", passed: allSame },
    { label: "Alpha-beta searched fewer/equal nodes", passed: allPruned },
    { label: "Rule and AI validation checks", passed: validationPassed },
    {
      label: result.config.includeMatchups ? "Depth matchup sanity checks" : "Depth matchup checks skipped",
      passed: matchupsPassed !== false,
      status: result.config.includeMatchups ? undefined : "SKIP",
      cardClass: result.config.includeMatchups ? undefined : "info"
    },
    { label: "Board snapshot recorded", passed: Array.isArray(result.currentBoard) && result.currentBoard.length === ROWS },
    { label: "Downloadable evidence available", passed: true }
  ];
  proofGrid.innerHTML = "";
  for (const proof of proofItems) {
    const item = document.createElement("div");
    item.className = `proof-card ${proof.cardClass ?? (proof.passed ? "pass" : "fail")}`;
    item.innerHTML = `<span>${proof.status ?? (proof.passed ? "PASS" : "CHECK")}</span><strong>${proof.label}</strong>`;
    proofGrid.appendChild(item);
  }

  validationRows.innerHTML = "";
  for (const check of result.validation.checks) {
    const item = document.createElement("div");
    item.className = check.passed ? "validation-row pass" : "validation-row fail";
    item.innerHTML = `<span>${check.passed ? "PASS" : "CHECK"}</span><strong>${check.name}</strong>`;
    validationRows.appendChild(item);
  }

  matchupRows.innerHTML = "";
  if (result.matchups.length === 0) {
    matchupRows.innerHTML = "<div>Skipped by the current lab controls.</div>";
  }
  for (const matchup of result.matchups) {
    const item = document.createElement("div");
    item.className = matchup.passed ? "matchup-row pass" : "matchup-row fail";
    item.innerHTML = `
      <span>${matchup.passed ? "PASS" : "REVIEW"}</span>
      <strong>${matchup.label}</strong>
      <p>Expected ${matchup.expectedWinner}; observed ${matchup.winner} in ${matchup.moves} moves after searching ${formatNumber(matchup.totalNodes)} nodes.</p>
    `;
    matchupRows.appendChild(item);
  }
}

async function runExperiment() {
  const runButton = document.getElementById("runExperimentButton");
  const rowsElement = document.getElementById("benchmarkRows");
  const config = getExperimentConfig();
  runButton.disabled = true;
  document.getElementById("downloadJsonButton").disabled = true;
  document.getElementById("downloadCsvButton").disabled = true;
  document.getElementById("downloadSummaryButton").disabled = true;
  document.getElementById("proofGrid").innerHTML = "";
  document.getElementById("experimentKpis").innerHTML = "";
  document.getElementById("validationRows").innerHTML = "<div>Running validation checks...</div>";
  document.getElementById("matchupRows").innerHTML = config.includeMatchups
    ? "<div>Running AI matchup sanity checks...</div>"
    : "<div>AI matchup checks are disabled for this run.</div>";
  document.getElementById("experimentSummary").textContent = "Running minimax, alpha-beta, and validation checks with the selected lab controls...";
  rowsElement.innerHTML = '<tr><td colspan="7">Running experiment...</td></tr>';
  setExperimentProgress(0, "Starting experiment...");

  try {
    await yieldToBrowser();
    latestExperimentResult = await buildExperimentResultWithProgress();
    renderExperimentResult(latestExperimentResult);
    setExperimentProgress(100, "Experiment complete.");
  } catch (error) {
    console.error(error);
    document.getElementById("experimentSummary").textContent = `Experiment failed: ${error.message}`;
    setExperimentProgress(100, "Experiment failed.");
  } finally {
    runButton.disabled = false;
    const hasResult = Boolean(latestExperimentResult);
    document.getElementById("downloadJsonButton").disabled = !hasResult;
    document.getElementById("downloadCsvButton").disabled = !hasResult;
    document.getElementById("downloadSummaryButton").disabled = !hasResult;
  }
}

function markExperimentControlsChanged() {
  latestExperimentResult = null;
  hideExperimentProgress();
  document.getElementById("downloadJsonButton").disabled = true;
  document.getElementById("downloadCsvButton").disabled = true;
  document.getElementById("downloadSummaryButton").disabled = true;
  document.getElementById("experimentSummary").textContent = "Experiment settings changed. Run the experiment to generate fresh evidence.";
  document.getElementById("experimentKpis").innerHTML = "";
  document.getElementById("proofGrid").innerHTML = "";
  document.getElementById("validationRows").innerHTML = "<div>Run the experiment to populate validation evidence.</div>";
  document.getElementById("matchupRows").innerHTML = "<div>Run the experiment to compare easy-vs-expert AI matchups.</div>";
  document.getElementById("benchmarkRows").innerHTML = '<tr><td colspan="7">No experiment run yet.</td></tr>';
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadExperimentJson() {
  if (!latestExperimentResult) return;
  downloadText("connect4-ai-experiment-results.json", JSON.stringify(latestExperimentResult, null, 2), "application/json");
}

function csvValue(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function experimentToCsv(result) {
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

function downloadExperimentCsv() {
  if (!latestExperimentResult) return;
  downloadText("connect4-ai-experiment-results.csv", experimentToCsv(latestExperimentResult), "text/csv");
}

function buildExperimentSummaryText(result) {
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

function downloadExperimentSummary() {
  if (!latestExperimentResult) return;
  downloadText("connect4-ai-experiment-summary.txt", buildExperimentSummaryText(latestExperimentResult), "text/plain");
}

function handleExperimentKeydown(event) {
  if (event.key === "Escape" && isExperimentLabOpen()) {
    closeExperimentLab();
  }
}

function createReportPdf() {
  window.open("report.html?print=1", "_blank", "noopener");
}

function initBrowserGame() {
  createColumnControls();
  renderBoard();
  updateStats({
    algorithm: "Minimax + Alpha-Beta",
    depth: 4,
    nodes: 0,
    elapsed: 0,
    move: null,
    player: AI
  });

  const boardElement = document.getElementById("board");
  boardElement.addEventListener("mousemove", handleBoardPointer);
  boardElement.addEventListener("click", handleBoardClick);
  boardElement.addEventListener("mouseleave", clearHoverColumn);
  document.addEventListener("keydown", handleKeyboardDrop);
  document.addEventListener("keydown", handleExperimentKeydown);

  document.getElementById("resetButton").addEventListener("click", resetGame);
  document.getElementById("controlsTabButton").addEventListener("click", () => setSidePanelView("game"));
  document.getElementById("replayTabButton").addEventListener("click", () => setSidePanelView("replay"));
  document.getElementById("redAiEnabled").addEventListener("change", handleRedAiToggle);
  document.getElementById("showStats").addEventListener("change", toggleStats);
  document.getElementById("createPdfButton").addEventListener("click", createReportPdf);
  document.getElementById("openExperimentButton").addEventListener("click", openExperimentLab);
  document.getElementById("closeExperimentButton").addEventListener("click", closeExperimentLab);
  document.getElementById("runExperimentButton").addEventListener("click", runExperiment);
  document.getElementById("downloadJsonButton").addEventListener("click", downloadExperimentJson);
  document.getElementById("downloadCsvButton").addEventListener("click", downloadExperimentCsv);
  document.getElementById("downloadSummaryButton").addEventListener("click", downloadExperimentSummary);
  document.getElementById("replaySlider").addEventListener("input", (event) => showReplayStep(event.target.value));
  document.getElementById("replayPrevButton").addEventListener("click", () => showReplayStep(replayStep - 1));
  document.getElementById("replayNextButton").addEventListener("click", () => showReplayStep(replayStep + 1));
  document.getElementById("replayPlayButton").addEventListener("click", toggleReplayPlayback);
  document.getElementById("replaySpeed").addEventListener("input", updateReplaySpeedLabel);
  updateReplayControls();
  for (const id of [
    "experimentBoardSource",
    "experimentMaxDepth",
    "experimentValidationGames",
    "experimentTieVariation",
    "experimentMatchups"
  ]) {
    document.getElementById(id).addEventListener("change", markExperimentControlsChanged);
  }
  document.getElementById("experimentOverlay").addEventListener("click", (event) => {
    if (event.target.id === "experimentOverlay") closeExperimentLab();
  });
  document.getElementById("difficulty").addEventListener("change", () => {
    if (document.getElementById("statPlayer").textContent === "Yellow") {
      document.getElementById("statDepth").textContent = document.getElementById("difficulty").value;
    }
  });
  document.getElementById("redDifficulty").addEventListener("change", () => {
    if (document.getElementById("statPlayer").textContent === "Red") {
      document.getElementById("statDepth").textContent = document.getElementById("redDifficulty").value;
    }
  });
  document.getElementById("useAlphaBeta").addEventListener("change", () => {
    document.getElementById("statAlgorithm").textContent = document.getElementById("useAlphaBeta").checked
      ? "Minimax + Alpha-Beta"
      : "Plain Minimax";
  });
}

if (typeof document !== "undefined") {
  initBrowserGame();
}

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
  node script.js --headless [--depth=4] [--red-depth=2] [--yellow-depth=6] [--games=4]
                 [--plain-minimax] [--variety] [--alternate-start] [--seed=42]
                 [--format=json|summary] [--out=path]

Experiment evidence:
  node script.js --experiment [--board=empty|midgame|current] [--max-depth=5]
                 [--validation-games=4] [--no-tie-variation] [--no-matchups]
                 [--format=json|csv|summary] [--out=path]

Examples:
  node script.js --headless --red-depth=2 --yellow-depth=6 --games=6 --format=summary
  node script.js --experiment --board=midgame --max-depth=6 --format=csv --out=experiment.csv
`);
}

if (typeof module !== "undefined" && require.main === module) {
  const args = process.argv.slice(2);
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
}

if (typeof module !== "undefined") {
  module.exports = {
    ROWS,
    COLS,
    EMPTY,
    HUMAN,
    AI,
    createBoard,
    copyBoard,
    getLegalMoves,
    getOpenRow,
    dropPiece,
    checkWin,
    isDraw,
    getImmediateWinningMoves,
    evaluateBoard,
    orderMoves,
    minimax,
    chooseAiMove,
    chooseComputerMove,
    getWinner,
    playHeadlessGame,
    runHeadlessSuite,
    runBenchmarkOnState,
    withComputerMoveExplanation,
    buildExperimentResult,
    buildExperimentSummaryText,
    experimentToCsv
  };
}
