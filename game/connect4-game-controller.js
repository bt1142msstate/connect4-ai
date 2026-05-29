// Live game controller that coordinates engine state, board UI, replay, and experiment UI.
const Connect4Engine = typeof module !== "undefined" && module.exports
  ? require("./connect4-engine.js")
  : globalThis.Connect4Engine;

const Connect4Experiment = typeof module !== "undefined" && module.exports
  ? require("./connect4-experiment.js")
  : globalThis.Connect4Experiment;

const Connect4ExperimentUi = typeof module !== "undefined" && module.exports
  ? null
  : globalThis.Connect4ExperimentUi;

const Connect4ReplayUi = typeof module !== "undefined" && module.exports
  ? null
  : globalThis.Connect4ReplayUi;

const Connect4BoardUi = typeof module !== "undefined" && module.exports
  ? null
  : globalThis.Connect4BoardUi;

const Connect4Sound = typeof module !== "undefined" && module.exports
  ? null
  : globalThis.Connect4Sound;

const {
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
  withComputerMoveExplanation,
  createSearchSnapshot,
  formatColumns,
  formatNumber,
  formatSeconds
} = Connect4Engine;

const {
  runBenchmarkOnState,
  getBenchmarkDepths,
  createPreparedExperimentBoard,
  createExperimentBoardSnapshot,
  buildExperimentResult,
  buildExperimentResultWithProgress,
  buildExperimentSummaryText,
  experimentToCsv
} = Connect4Experiment;

const MAX_LIVE_PLAIN_MINIMAX_DEPTH = 7;

// Live game state stays in this controller; helper modules read it through callbacks.
let board = createBoard();
let gameOver = false;
let isAiThinking = false;
let winningCells = [];
let moveToken = 0;
let currentPlayer = HUMAN;
let pendingComputerTimeout = null;
let experimentLab = null;
let replayController = null;
let boardUi = null;
let soundController = null;

function setStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
}

function recordMove(row, col, player, metadata = {}) {
  if (replayController) replayController.recordMove(row, col, player, metadata);
}

function finishGame(message, cells = []) {
  gameOver = true;
  isAiThinking = false;
  winningCells = cells;
  if (replayController) replayController.finishGame(message);
  setStatus(message);
  renderBoard();
  if (replayController) replayController.updateControls();
}

function resetReplay() {
  if (replayController) replayController.reset();
}

function renderBoard(options = {}) {
  if (boardUi) boardUi.render(options);
}

function animateDrop(row, col, player) {
  return boardUi ? boardUi.animateDrop(row, col, player) : Promise.resolve();
}

function playDropSound(player) {
  if (soundController) soundController.playDrop(player);
}

function playWinSound(player) {
  if (soundController) soundController.playWin(player);
}

function playDrawSound() {
  if (soundController) soundController.playDraw();
}

function updateColumnButtons() {
  if (boardUi) boardUi.updateColumnButtons();
}

function isTwoPlayerMode() {
  const mode = document.getElementById("gameMode");
  return Boolean(mode && mode.value === "two-player");
}

function isManualTurn() {
  if (gameOver || isAiThinking || board[0].every((cell) => cell !== EMPTY)) return false;
  if (isTwoPlayerMode()) return true;
  return currentPlayer === HUMAN && !isRedAiEnabled();
}

async function handleHumanMove(col) {
  // Manual input is accepted during human-controlled turns and only in open columns.
  if (!isManualTurn() || board[0][col] !== EMPTY) {
    return;
  }

  isAiThinking = true;
  if (boardUi) boardUi.clearHoverColumn({ render: false });
  const activeToken = moveToken;
  const player = currentPlayer;
  const playerName = player === HUMAN ? "red" : "yellow";
  const row = dropPiece(board, col, player);
  recordMove(row, col, player);
  setStatus(`Dropping ${playerName} piece...`);
  renderBoard({ hiddenCell: { row, col } });
  await animateDrop(row, col, player);
  if (activeToken !== moveToken) return;
  playDropSound(player);

  const playerWin = checkWin(board, player);
  if (playerWin.won) {
    playWinSound(player);
    if (isTwoPlayerMode()) {
      finishGame(`${player === HUMAN ? "Red" : "Yellow"} wins. ${player === HUMAN ? "Red" : "Yellow"} connected four.`, playerWin.cells);
    } else {
      finishGame("You win. Red connected four.", playerWin.cells);
    }
    return;
  }

  if (isDraw(board)) {
    playDrawSound();
    finishGame("Draw. The board is full.");
    return;
  }

  currentPlayer = currentPlayer === HUMAN ? AI : HUMAN;
  isAiThinking = false;
  renderBoard();
  setStatus(getTurnStatus());
  updateColumnButtons();

  if (shouldComputerPlayCurrentTurn()) {
    scheduleComputerMove(activeToken);
  }
}

async function makeComputerMove(activeToken = moveToken) {
  // A token prevents delayed AI moves from landing after reset or replay state changes.
  if (activeToken !== moveToken) return;
  pendingComputerTimeout = null;
  const useAlphaBeta = document.getElementById("useAlphaBeta").checked;
  const depth = getSearchDepthForPlayer(currentPlayer, useAlphaBeta);
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
    playDropSound(currentPlayer);
  }

  updateStats(result);

  const outcome = getWinner(board);
  if (outcome.winner === HUMAN) {
    playWinSound(HUMAN);
    finishGame(isRedAiEnabled() ? "Red AI wins. Red connected four." : "You win. Red connected four.", outcome.cells);
  } else if (outcome.winner === AI) {
    playWinSound(AI);
    finishGame("Yellow AI wins. Yellow connected four.", outcome.cells);
  } else if (outcome.winner === EMPTY) {
    playDrawSound();
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
  // The stats panel mirrors the latest AI search so the decision can be inspected.
  document.getElementById("statPlayer").textContent = result.player === HUMAN ? "Red" : "Yellow";
  document.getElementById("statAlgorithm").textContent = result.algorithm;
  document.getElementById("statDepth").textContent = result.depth;
  document.getElementById("statNodes").textContent = formatNumber(result.nodes);
  document.getElementById("statTime").textContent = formatSeconds(result.elapsed);
  document.getElementById("statMove").textContent = result.move === null ? "-" : String(result.move + 1);
  const reason = document.getElementById("statReason");
  if (reason) {
    const reasonText = result.reason ?? "Waiting for the next AI move.";
    reason.textContent = reasonText;
    reason.title = reasonText;
  }
}

function resetGame() {
  // Reset clears timers, search state, replay history, and restores Red as the starter.
  moveToken += 1;
  clearPendingComputerMove();
  board = createBoard();
  gameOver = false;
  isAiThinking = false;
  winningCells = [];
  if (boardUi) boardUi.clearHoverColumn({ render: false });
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
  if (isTwoPlayerMode()) return false;
  const redAiEnabled = document.getElementById("redAiEnabled");
  return Boolean(redAiEnabled && redAiEnabled.checked);
}

function getDepthForPlayer(player) {
  const id = player === HUMAN ? "redDifficulty" : "difficulty";
  return Number(document.getElementById(id).value);
}

function getSearchDepthForPlayer(player, useAlphaBeta) {
  const depth = getDepthForPlayer(player);
  return useAlphaBeta ? depth : Math.min(depth, MAX_LIVE_PLAIN_MINIMAX_DEPTH);
}

function shouldComputerPlayCurrentTurn() {
  return !isTwoPlayerMode() && !gameOver && (currentPlayer === AI || (currentPlayer === HUMAN && isRedAiEnabled()));
}

function getTurnStatus() {
  // Status text calls out immediate wins and unavoidable threats without changing gameplay.
  if (gameOver) return "";
  const currentWins = getImmediateWinningMoves(board, currentPlayer);
  const opponent = currentPlayer === HUMAN ? AI : HUMAN;
  const opponentWins = getImmediateWinningMoves(board, opponent);

  if (currentPlayer === HUMAN) {
    const base = isTwoPlayerMode()
      ? "Red player's turn."
      : isRedAiEnabled()
        ? "Red AI is thinking."
        : "Your turn.";
    if (currentWins.length > 0) {
      return `${base} Winning move available in column ${formatColumns(currentWins)}.`;
    }
    if (opponentWins.length > 1) {
      return `${base} Unavoidable threat: Yellow can win next turn in columns ${formatColumns(opponentWins)}.`;
    }
    if (opponentWins.length === 1) {
      return `${base} Warning: block Yellow's winning threat in column ${formatColumns(opponentWins)}.`;
    }
    if (isTwoPlayerMode()) return "Red player's turn. Drop a red piece.";
    return isRedAiEnabled() ? "Red AI is thinking..." : "Your turn. Drop a red piece.";
  }

  if (isTwoPlayerMode()) {
    if (currentWins.length > 0) {
      return `Yellow player's turn. Winning move available in column ${formatColumns(currentWins)}.`;
    }
    if (opponentWins.length > 1) {
      return `Yellow player's turn. Unavoidable threat: Red can win next turn in columns ${formatColumns(opponentWins)}.`;
    }
    if (opponentWins.length === 1) {
      return `Yellow player's turn. Warning: block Red's winning threat in column ${formatColumns(opponentWins)}.`;
    }
    return "Yellow player's turn. Drop a yellow piece.";
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
  // Small delays make automated turns readable and give the UI time to update.
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
  if (isTwoPlayerMode()) {
    document.getElementById("redAiEnabled").checked = false;
    updateModeControls();
    return;
  }

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

function updateModeControls() {
  const twoPlayer = isTwoPlayerMode();
  const redAiToggle = document.getElementById("redAiEnabled");
  const redDifficulty = document.getElementById("redDifficulty");
  const yellowDifficulty = document.getElementById("difficulty");
  const alphaBeta = document.getElementById("useAlphaBeta");

  if (twoPlayer && redAiToggle) redAiToggle.checked = false;
  [redAiToggle, redDifficulty, yellowDifficulty, alphaBeta].forEach((control) => {
    if (control) control.disabled = twoPlayer;
  });
  document.querySelectorAll("[data-ai-setting]").forEach((element) => {
    element.classList.toggle("is-disabled", twoPlayer);
  });
  toggleStats();
}

function handleGameModeChange() {
  clearPendingComputerMove();
  isAiThinking = false;
  updateModeControls();
  resetGame();
}

function toggleStats() {
  const statsPanel = document.getElementById("statsPanel");
  statsPanel.hidden = isTwoPlayerMode() || !document.getElementById("showStats").checked;
}

function closeExperimentLab() {
  if (experimentLab) experimentLab.close();
}

function isExperimentLabOpen() {
  return Boolean(experimentLab && experimentLab.isOpen());
}

function openWalkthrough() {
  const overlay = document.getElementById("walkthroughOverlay");
  overlay.hidden = false;
  document.getElementById("closeWalkthroughButton").focus();
}

function closeWalkthrough() {
  document.getElementById("walkthroughOverlay").hidden = true;
}

function isWalkthroughOpen() {
  const overlay = document.getElementById("walkthroughOverlay");
  return Boolean(overlay && !overlay.hidden);
}

function handleExperimentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (isExperimentLabOpen()) {
    closeExperimentLab();
  } else if (isWalkthroughOpen()) {
    closeWalkthrough();
  }
}

function createReportPdf() {
  window.open("report.html?print=1", "_blank", "noopener");
}

function getDropSpeedMultiplier() {
  const control = document.getElementById("dropSpeed");
  if (!control) return 1;
  const value = Number(control.value);
  return Number.isFinite(value) ? Math.max(0.5, Math.min(2, value)) : 1;
}

function formatDropSpeed(value) {
  return Number.isInteger(value)
    ? `${value.toFixed(1)}x`
    : `${value.toFixed(2).replace(/0$/, "")}x`;
}

function updateDropSpeedLabel() {
  const label = document.getElementById("dropSpeedLabel");
  if (label) {
    label.textContent = formatDropSpeed(getDropSpeedMultiplier());
  }
}

function handleDropSpeedKeyboard(event) {
  const control = event.currentTarget;
  const step = Number(control.step) || 0.25;
  const min = Number(control.min) || 0.5;
  const max = Number(control.max) || 2;
  const current = Number(control.value) || 1;
  let next = current;

  if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - step;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + step;
  if (event.key === "Home") next = min;
  if (event.key === "End") next = max;
  if (next === current) return;

  event.preventDefault();
  control.value = String(Math.max(min, Math.min(max, next)));
  updateDropSpeedLabel();
}

function initBrowserGame() {
  soundController = Connect4Sound ? Connect4Sound.createSoundController({ enabledControlId: "soundEnabled" }) : null;
  if (soundController) soundController.bindUnlockEvents(document);
  // Wire modules after the DOM exists so the static file:// page can run without a server.
  boardUi = Connect4BoardUi.createBoardUi({
    getBoard: () => board,
    getWinningCells: () => winningCells,
    getCurrentPlayer: () => currentPlayer,
    getGameOver: () => gameOver,
    getIsAiThinking: () => isAiThinking,
    isRedAiEnabled,
    isTwoPlayerMode,
    isExperimentLabOpen,
    isWalkthroughOpen,
    getDropSpeedMultiplier,
    onHumanMove: handleHumanMove
  });
  experimentLab = Connect4ExperimentUi.createExperimentLab({
    getCurrentBoard: () => board,
    getCurrentPlayer: () => currentPlayer
  });
  replayController = Connect4ReplayUi.createReplayController({
    getGameOver: () => gameOver,
    setBoard: (nextBoard) => {
      board = nextBoard;
    },
    setWinningCells: (cells) => {
      winningCells = cells;
    },
    renderBoard,
    animateDrop,
    playDropSound,
    setStatus
  });

  boardUi.bindEvents();
  renderBoard();
  updateStats({
    algorithm: "Minimax + Alpha-Beta",
    depth: 4,
    nodes: 0,
    elapsed: 0,
    move: null,
    player: AI
  });

  document.addEventListener("keydown", handleExperimentKeydown);

  document.getElementById("resetButton").addEventListener("click", resetGame);
  document.getElementById("gameMode").addEventListener("change", handleGameModeChange);
  document.getElementById("redAiEnabled").addEventListener("change", handleRedAiToggle);
  document.getElementById("showStats").addEventListener("change", toggleStats);
  document.getElementById("dropSpeed").addEventListener("input", updateDropSpeedLabel);
  document.getElementById("dropSpeed").addEventListener("change", updateDropSpeedLabel);
  document.getElementById("dropSpeed").addEventListener("keydown", handleDropSpeedKeyboard);
  updateDropSpeedLabel();
  document.getElementById("createPdfButton").addEventListener("click", createReportPdf);
  document.getElementById("openWalkthroughButton").addEventListener("click", openWalkthrough);
  document.getElementById("closeWalkthroughButton").addEventListener("click", closeWalkthrough);
  experimentLab.bindEvents();
  replayController.bindEvents();
  document.getElementById("walkthroughOverlay").addEventListener("click", (event) => {
    if (event.target.id === "walkthroughOverlay") closeWalkthrough();
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
  updateModeControls();
}

if (typeof document !== "undefined") {
  initBrowserGame();
}

if (typeof module !== "undefined" && require.main === module) {
  require("./connect4-cli.js").runCli(process.argv.slice(2));
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
    getBenchmarkDepths,
    createPreparedExperimentBoard,
    createExperimentBoardSnapshot,
    withComputerMoveExplanation,
    buildExperimentResult,
    buildExperimentResultWithProgress,
    buildExperimentSummaryText,
    experimentToCsv
  };
}
