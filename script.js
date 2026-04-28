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

const DROP_ANIMATION_MS = 300;

let board = createBoard();
let gameOver = false;
let isAiThinking = false;
let winningCells = [];
let moveToken = 0;
let currentPlayer = HUMAN;
let pendingComputerTimeout = null;
let hoverColumn = null;
let experimentLab = null;
let replayController = null;

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
    const reasonText = result.reason ?? "Waiting for the next AI move.";
    reason.textContent = reasonText;
    reason.title = reasonText;
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
  if (isExperimentLabOpen() || isWalkthroughOpen()) return;
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

function initBrowserGame() {
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
    setStatus
  });

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
  document.getElementById("redAiEnabled").addEventListener("change", handleRedAiToggle);
  document.getElementById("showStats").addEventListener("change", toggleStats);
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
