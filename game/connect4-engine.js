// Shared Connect 4 rules, minimax search, heuristic scoring, and headless validation.
(function attachConnect4Engine(root) {
  const ROWS = 6;
  const COLS = 7;
  const EMPTY = 0;
  const HUMAN = 1;
  const AI = 2;
  const WIN_SCORE = 100000;

  // Board helpers keep the same 6x7 array shape in the browser and Node tests.
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
    // These four directions cover horizontal, vertical, and both diagonal wins.
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
    // Each four-cell window is scored with the project heuristic from the report.
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
    // Terminal boards get exact scores; non-terminal boards get center and window bonuses.
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
    // Searching center columns first improves alpha-beta pruning without changing minimax values.
    const center = Math.floor(COLS / 2);
    return moves.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  }

  function getTerminalScore(aiWin, humanWin, depthRemaining) {
    // Depth adjustment makes the AI prefer faster wins and postpone unavoidable losses.
    if (aiWin) return WIN_SCORE + depthRemaining;
    if (humanWin) return -WIN_SCORE - depthRemaining;
    return 0;
  }

  function minimax(state, depth, alpha, beta, maximizingPlayer, useAlphaBeta, stats) {
    // MAX nodes are Yellow AI turns; MIN nodes are Red turns, whether human or autopilot.
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

  function createTacticalRootResult(state, depth, useAlphaBeta, player, legalMoves, start) {
    // Forced one-ply tactics do not need a full tree search: win now, or block the only immediate loss.
    const orderedCurrentWins = orderMoves(getImmediateWinningMoves(state, player));
    const opponent = getOpponent(player);
    const orderedOpponentWins = orderMoves(getImmediateWinningMoves(state, opponent));
    let move = null;
    let score = null;
    let tactical = null;

    if (orderedCurrentWins.length > 0) {
      move = orderedCurrentWins[0];
      score = player === AI ? WIN_SCORE + depth : -WIN_SCORE - depth;
      tactical = "win";
    } else if (orderedOpponentWins.length === 1) {
      move = orderedOpponentWins[0];
      const next = copyBoard(state);
      dropPiece(next, move, player);
      score = evaluateBoard(next);
      tactical = "block";
    }

    if (move === null) return null;

    return {
      move,
      score,
      depth,
      nodes: legalMoves.length + 1,
      elapsed: getNow() - start,
      algorithm: useAlphaBeta ? "Minimax + Alpha-Beta" : "Plain Minimax",
      player,
      tiedMoves: [move],
      tactical
    };
  }

  function chooseRootMove(state, depth, useAlphaBeta, player = AI, options = {}) {
    // Root search records the chosen move, score, timing, node count, and equal-score ties.
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

    if (!options.disableTacticalShortcut) {
      const tacticalResult = createTacticalRootResult(state, depth, useAlphaBeta, player, legalMoves, start);
      if (tacticalResult) return tacticalResult;
    }

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

  function chooseAiMove(state, depth, useAlphaBeta, options = {}) {
    return chooseRootMove(state, depth, useAlphaBeta, AI, options);
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
    // Short explanations translate search results into classroom-friendly move reasoning.
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
      reason = `${playerName} AI chose column ${selectedColumn} to finish four in a row immediately.`;
    } else if (opponentThreats.includes(result.move)) {
      reason = result.tactical === "block"
        ? `${playerName} AI used a one-ply tactical check to block ${opponentName}'s immediate winning threat in column ${selectedColumn}.`
        : opponentThreats.length > 1
        ? `${playerName} AI chose column ${selectedColumn} to block ${opponentName}'s immediate threats in columns ${formatColumns(opponentThreats)}; depth-${result.depth} search checked replies.`
        : `${playerName} AI chose column ${selectedColumn} to block ${opponentName}'s immediate winning threat; depth-${result.depth} search checked replies.`;
    } else if (opponentReplies.length > 0) {
      reason = `${playerName} AI chose column ${selectedColumn} as the best depth-${result.depth} option, but ${opponentName} still has an immediate reply threat in column ${formatColumns(opponentReplies)}.`;
    } else if (createdThreats.length > 1) {
      reason = `${playerName} AI chose column ${selectedColumn} to create multiple next-turn threats in columns ${formatColumns(createdThreats)} after checking replies.`;
    } else if (createdThreats.length === 1) {
      reason = `${playerName} AI chose column ${selectedColumn} to create a next-turn threat in column ${formatColumns(createdThreats)}; depth-${result.depth} search still rated it best.`;
    } else if (tiedMoves.length > 1) {
      reason = `${playerName} AI chose column ${selectedColumn} from equal depth-${result.depth} best moves: columns ${formatColumns(tiedMoves)}.`;
    } else if (result.move === centerColumn) {
      reason = `${playerName} AI chose the center column because it supports the most possible four-in-a-row lines.`;
    } else {
      reason = `${playerName} AI chose column ${selectedColumn} because depth-${result.depth} minimax gave it the best score.`;
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
      tactical: result.tactical ?? null,
      tiedMoves: result.tiedMoves ?? [],
      tiedMovesLabel: result.tiedMovesLabel ?? "-"
    };
  }

  function playHeadlessGame(options = {}) {
    // Headless games reuse the exact same engine as the browser so validation is meaningful.
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
    // The suite checks rules, edge cases, search behavior, and short AI-vs-AI simulations.
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
    const tacticalBlock = withComputerMoveExplanation(
      state,
      chooseComputerMove(state, 8, useAlphaBeta, AI, { randomizeTies: false })
    );
    checks.push({
      name: "forced immediate block uses tactical shortcut",
      passed: tacticalBlock.move === 3
        && tacticalBlock.nodes <= getLegalMoves(state).length + 1
        && tacticalBlock.reason.includes("one-ply tactical check")
    });
    const pureBlock = chooseComputerMove(state, 4, useAlphaBeta, AI, {
      randomizeTies: false,
      disableTacticalShortcut: true
    });
    checks.push({
      name: "pure benchmark mode can disable tactical shortcut",
      passed: pureBlock.move === 3
        && pureBlock.tactical === undefined
        && pureBlock.nodes > tacticalBlock.nodes
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

  const api = {
    ROWS,
    COLS,
    EMPTY,
    HUMAN,
    AI,
    WIN_SCORE,
    createBoard,
    copyBoard,
    isValidColumn,
    getLegalMoves,
    getOpenRow,
    dropPiece,
    isDraw,
    checkWin,
    scoreWindow,
    evaluateBoard,
    orderMoves,
    getTerminalScore,
    minimax,
    chooseRootMove,
    chooseComputerMove,
    chooseAiMove,
    createSeededRandom,
    getWinner,
    getImmediateWinningMoves,
    formatColumns,
    getOpponent,
    formatScoreForPlayer,
    explainComputerMove,
    withComputerMoveExplanation,
    createSearchSnapshot,
    playHeadlessGame,
    runHeadlessSuite,
    formatPlayer,
    getNow,
    formatNumber,
    formatSeconds
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4Engine = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
