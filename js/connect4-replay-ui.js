// Browser replay controller for move history, playback, and per-move AI explanations.
(function attachConnect4ReplayUi(root) {
  const engine = typeof module !== "undefined" && module.exports
    ? require("./connect4-engine.js")
    : root.Connect4Engine;

  const {
    HUMAN,
    AI,
    createBoard,
    dropPiece,
    getWinner,
    formatPlayer,
    formatNumber,
    formatSeconds
  } = engine;

  function createReplayController(options = {}) {
    let moveHistory = [];
    let replayStep = 0;
    let replayTimer = null;
    let playbackRunId = 0;
    let finalStatusMessage = "";
    let sidePanelView = "game";

    const getGameOver = options.getGameOver ?? (() => false);
    const setBoard = options.setBoard ?? (() => {});
    const setWinningCells = options.setWinningCells ?? (() => {});
    const renderBoard = options.renderBoard ?? (() => {});
    const animateDrop = options.animateDrop ?? (() => Promise.resolve());
    const setStatus = options.setStatus ?? (() => {});

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

    function stopPlayback() {
      if (replayTimer !== null) {
        window.clearTimeout(replayTimer);
        replayTimer = null;
      }
      playbackRunId += 1;
      const playButton = document.getElementById("replayPlayButton");
      if (playButton) playButton.textContent = "Play";
    }

    function getSpeedMs() {
      const speed = document.getElementById("replaySpeed");
      return speed ? Number(speed.value) : 700;
    }

    function updateSpeedLabel() {
      const label = document.getElementById("replaySpeedLabel");
      if (!label) return;
      label.textContent = `${(getSpeedMs() / 1000).toFixed(2)} s / move`;
    }

    function replayAnimationsEnabled() {
      const checkbox = document.getElementById("replayAnimations");
      return !checkbox || checkbox.checked;
    }

    function getDescription() {
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

    function updateMoveInsight() {
      const panel = document.getElementById("replayMoveInsight");
      if (!panel) return;

      const move = replayStep > 0 ? moveHistory[replayStep - 1] : null;
      if (!move || !move.search) {
        panel.hidden = true;
        return;
      }

      const search = move.search;
      panel.hidden = false;
      const replayReason = document.getElementById("replayMoveReason");
      replayReason.textContent = search.reason;
      replayReason.title = search.reason;
      document.getElementById("replayInsightPlayer").textContent = `${formatPlayer(search.player)} AI`;
      document.getElementById("replayInsightAlgorithm").textContent = search.algorithm;
      document.getElementById("replayInsightDepth").textContent = search.depth;
      document.getElementById("replayInsightNodes").textContent = formatNumber(search.nodes);
      document.getElementById("replayInsightTime").textContent = formatSeconds(search.elapsed);
      document.getElementById("replayInsightScore").textContent = search.scoreLabel;
      document.getElementById("replayInsightTies").textContent = search.tiedMovesLabel;
    }

    function canReplay() {
      return getGameOver() && moveHistory.length > 0;
    }

    function updateSidePanelView() {
      const sidePanel = document.getElementById("sidePanel");
      if (!sidePanel) return;

      if (!canReplay() && sidePanelView === "replay") {
        sidePanelView = "game";
      }

      sidePanel.dataset.activeView = sidePanelView;
      const controlsButton = document.getElementById("controlsTabButton");
      const replayButton = document.getElementById("replayTabButton");
      if (controlsButton) controlsButton.classList.toggle("active", sidePanelView === "game");
      if (replayButton) {
        replayButton.classList.toggle("active", sidePanelView === "replay");
        replayButton.disabled = !canReplay();
        replayButton.title = canReplay() ? "Review the completed game" : "Replay is available after a completed game";
      }
    }

    function setSidePanelView(view) {
      sidePanelView = view === "replay" && canReplay() ? "replay" : "game";
      updateSidePanelView();
    }

    function updateControls() {
      const panel = document.getElementById("replayPanel");
      if (!panel) return;
      const hasMoves = moveHistory.length > 0;
      panel.hidden = !getGameOver() || !hasMoves;
      updateSidePanelView();
      if (!getGameOver() || !hasMoves) {
        updateMoveInsight();
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
      description.textContent = getDescription();
      prevButton.disabled = replayStep <= 0;
      nextButton.disabled = replayStep >= moveHistory.length;
      updateMoveInsight();
      updateSpeedLabel();
    }

    async function showStep(step, options = {}) {
      if (!options.keepPlaying) {
        stopPlayback();
      }
      const targetStep = Math.min(Math.max(Number(step), 0), moveHistory.length);
      const previousStep = replayStep;
      const shouldAnimate = options.animate !== false
        && replayAnimationsEnabled()
        && targetStep === previousStep + 1
        && targetStep > 0;
      const replayBoard = buildBoardFromMoves(replayStep);
      const finalBoard = buildBoardFromMoves(targetStep);
      const outcome = getWinner(finalBoard);

      if (shouldAnimate) {
        const move = moveHistory[targetStep - 1];
        setBoard(replayBoard);
        setWinningCells([]);
        renderBoard();
        await animateDrop(move.row, move.col, move.player);
      }

      replayStep = targetStep;
      setBoard(finalBoard);
      setWinningCells(outcome.winner === HUMAN || outcome.winner === AI ? outcome.cells : []);
      renderBoard();
      updateControls();
      setStatus(`Replay: ${getDescription()}`);
    }

    function scheduleAdvance(runId) {
      replayTimer = window.setTimeout(async () => {
        replayTimer = null;
        if (runId !== playbackRunId) return;
        if (replayStep >= moveHistory.length) {
          stopPlayback();
          return;
        }
        await showStep(replayStep + 1, { keepPlaying: true });
        if (runId !== playbackRunId) return;
        if (replayStep >= moveHistory.length) {
          stopPlayback();
          return;
        }
        scheduleAdvance(runId);
      }, getSpeedMs());
    }

    function togglePlayback() {
      if (moveHistory.length === 0) return;
      if (replayTimer !== null) {
        stopPlayback();
        return;
      }
      if (replayStep >= moveHistory.length) {
        showStep(0, { keepPlaying: true, animate: false });
      }
      playbackRunId += 1;
      const runId = playbackRunId;
      document.getElementById("replayPlayButton").textContent = "Pause";
      scheduleAdvance(runId);
    }

    function finishGame(message) {
      finalStatusMessage = message;
      replayStep = moveHistory.length;
      stopPlayback();
      updateControls();
    }

    function reset() {
      stopPlayback();
      moveHistory = [];
      replayStep = 0;
      finalStatusMessage = "";
      sidePanelView = "game";
      updateControls();
    }

    function bindEvents() {
      document.getElementById("controlsTabButton").addEventListener("click", () => setSidePanelView("game"));
      document.getElementById("replayTabButton").addEventListener("click", () => setSidePanelView("replay"));
      document.getElementById("replaySlider").addEventListener("input", (event) => showStep(event.target.value));
      document.getElementById("replayPrevButton").addEventListener("click", () => showStep(replayStep - 1));
      document.getElementById("replayNextButton").addEventListener("click", () => showStep(replayStep + 1));
      document.getElementById("replayPlayButton").addEventListener("click", togglePlayback);
      document.getElementById("replaySpeed").addEventListener("input", updateSpeedLabel);
      updateControls();
    }

    return {
      recordMove,
      buildBoardFromMoves,
      stopPlayback,
      getSpeedMs,
      updateSpeedLabel,
      getDescription,
      updateMoveInsight,
      updateSidePanelView,
      setSidePanelView,
      updateControls,
      showStep,
      togglePlayback,
      finishGame,
      reset,
      bindEvents,
      getMoveCount: () => moveHistory.length,
      getStep: () => replayStep,
      getHistory: () => moveHistory.slice()
    };
  }

  const api = { createReplayController };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4ReplayUi = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
