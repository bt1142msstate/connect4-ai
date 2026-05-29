// Browser board renderer and input layer for cells, column buttons, ghost preview, and drops.
(function attachConnect4BoardUi(root) {
  const engine = typeof module !== "undefined" && module.exports
    ? require("./connect4-engine.js")
    : root.Connect4Engine;

  const {
    ROWS,
    COLS,
    EMPTY,
    HUMAN,
    AI,
    getOpenRow
  } = engine;

  const DROP_GRAVITY_PX_PER_MS2 = 0.00528;
  const DROP_MOTION_EXPONENT = 1.45;
  const DROP_MIN_ANIMATION_MS = 165;
  const DROP_MAX_ANIMATION_MS = 500;

  function createBoardUi(options = {}) {
    // The board UI never owns rules; it asks the controller for current state.
    let hoverColumn = null;

    const getBoard = options.getBoard ?? (() => []);
    const getWinningCells = options.getWinningCells ?? (() => []);
    const getCurrentPlayer = options.getCurrentPlayer ?? (() => HUMAN);
    const getGameOver = options.getGameOver ?? (() => false);
    const getIsAiThinking = options.getIsAiThinking ?? (() => false);
    const isRedAiEnabled = options.isRedAiEnabled ?? (() => false);
    const isTwoPlayerMode = options.isTwoPlayerMode ?? (() => false);
    const isExperimentLabOpen = options.isExperimentLabOpen ?? (() => false);
    const isWalkthroughOpen = options.isWalkthroughOpen ?? (() => false);
    const getDropSpeedMultiplier = options.getDropSpeedMultiplier ?? (() => 1);
    const onHumanMove = options.onHumanMove ?? (() => {});
    let boardResizeObserver = null;

    function isManualHumanTurn() {
      if (getGameOver() || getIsAiThinking()) return false;
      if (isTwoPlayerMode()) return true;
      return !isRedAiEnabled() && getCurrentPlayer() === HUMAN;
    }

    function syncBoardFaceOverlay(boardElement) {
      const cells = Array.from(boardElement.children).filter((child) => child.classList.contains("cell"));
      if (cells.length !== ROWS * COLS) return;

      boardElement.querySelector(".board-face-overlay")?.remove();

      const boardRect = boardElement.getBoundingClientRect();
      if (boardRect.width <= 0 || boardRect.height <= 0) return;

      const styles = getComputedStyle(boardElement);
      const boardLight = styles.getPropertyValue("--board-light").trim() || "#4ba3ff";
      const boardColor = styles.getPropertyValue("--board").trim() || "#1d6fc5";
      const svgNamespace = "http://www.w3.org/2000/svg";
      const maskId = "board-face-mask";
      const gradientId = "board-face-gradient";

      const svg = document.createElementNS(svgNamespace, "svg");
      svg.classList.add("board-face-overlay");
      svg.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");

      const defs = document.createElementNS(svgNamespace, "defs");
      const gradient = document.createElementNS(svgNamespace, "linearGradient");
      gradient.setAttribute("id", gradientId);
      gradient.setAttribute("x1", "0");
      gradient.setAttribute("y1", "0");
      gradient.setAttribute("x2", "0");
      gradient.setAttribute("y2", "1");

      const topStop = document.createElementNS(svgNamespace, "stop");
      topStop.setAttribute("offset", "0%");
      topStop.setAttribute("stop-color", boardLight);
      const bottomStop = document.createElementNS(svgNamespace, "stop");
      bottomStop.setAttribute("offset", "100%");
      bottomStop.setAttribute("stop-color", boardColor);
      gradient.append(topStop, bottomStop);

      const mask = document.createElementNS(svgNamespace, "mask");
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      const maskBase = document.createElementNS(svgNamespace, "rect");
      maskBase.setAttribute("width", String(boardRect.width));
      maskBase.setAttribute("height", String(boardRect.height));
      maskBase.setAttribute("fill", "white");
      mask.appendChild(maskBase);

      cells.forEach((cell) => {
        const cellRect = cell.getBoundingClientRect();
        const hole = document.createElementNS(svgNamespace, "circle");
        hole.setAttribute("cx", String(cellRect.left - boardRect.left + cellRect.width / 2));
        hole.setAttribute("cy", String(cellRect.top - boardRect.top + cellRect.height / 2));
        hole.setAttribute("r", String(Math.min(cellRect.width, cellRect.height) * 0.43));
        hole.setAttribute("fill", "black");
        mask.appendChild(hole);
      });

      defs.append(gradient, mask);
      const face = document.createElementNS(svgNamespace, "rect");
      face.setAttribute("width", String(boardRect.width));
      face.setAttribute("height", String(boardRect.height));
      face.setAttribute("fill", `url(#${gradientId})`);
      face.setAttribute("mask", `url(#${maskId})`);
      svg.append(defs, face);
      boardElement.appendChild(svg);
    }

    function observeBoardFace(boardElement) {
      if (boardResizeObserver || typeof ResizeObserver !== "function") return;
      boardResizeObserver = new ResizeObserver(() => syncBoardFaceOverlay(boardElement));
      boardResizeObserver.observe(boardElement);
    }

    function getGhostRow() {
      if (hoverColumn === null || !isManualHumanTurn()) return -1;
      return getOpenRow(getBoard(), hoverColumn);
    }

    function syncBoardInteractivity() {
      const boardElement = document.getElementById("board");
      if (!boardElement) return;
      const manualTurn = isManualHumanTurn();
      boardElement.classList.toggle("manual-drop-turn", manualTurn);
      boardElement.classList.toggle("red-turn", manualTurn && getCurrentPlayer() === HUMAN);
      boardElement.classList.toggle("yellow-turn", manualTurn && getCurrentPlayer() === AI);
      document.querySelector(".game-panel")?.classList.toggle("manual-drop-turn", manualTurn);
      document.getElementById("columnControls")?.classList.toggle("manual-drop-turn", manualTurn);
    }

    function render(renderOptions = {}) {
      // Rebuild all 42 cells from state, then let CSS handle pieces and highlights.
      const board = getBoard();
      const boardElement = document.getElementById("board");
      boardElement.innerHTML = "";
      syncBoardInteractivity();
      const winSet = new Set(getWinningCells().map(([row, col]) => `${row},${col}`));
      const hiddenCell = renderOptions.hiddenCell ? `${renderOptions.hiddenCell.row},${renderOptions.hiddenCell.col}` : null;
      const ghostRow = getGhostRow();
      const manualTurn = isManualHumanTurn();
      const currentPlayer = getCurrentPlayer();
      const ghostColor = currentPlayer === HUMAN ? "red" : "yellow";
      const ghostLabel = currentPlayer === HUMAN ? "red" : "yellow";

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
              cell.classList.add("ghost", ghostColor);
              cell.setAttribute("aria-label", `Preview ${ghostLabel} piece in column ${col + 1}`);
            }
          }
          if (manualTurn && board[0][col] === EMPTY) {
            cell.classList.add("drop-target");
            if (hoverColumn === col && row < ghostRow && board[row][col] === EMPTY) {
              cell.classList.add("column-hover");
            }
          }
          if (winSet.has(`${row},${col}`)) cell.classList.add("win");
          boardElement.appendChild(cell);
        }
      }

      syncBoardFaceOverlay(boardElement);
      observeBoardFace(boardElement);
      updateColumnButtons();
    }

    function animateDrop(row, col, player) {
      // A temporary overlay piece animates into the hidden final cell to avoid overshoot.
      const boardElement = document.getElementById("board");
      const targetIndex = row * COLS + col;
      const targetCell = boardElement.children[targetIndex];

      const reduceMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!targetCell) {
        return Promise.resolve();
      }

      const boardRect = boardElement.getBoundingClientRect();
      const targetRect = targetCell.getBoundingClientRect();
      const fallingPiece = document.createElement("div");
      const finalX = targetRect.left - boardRect.left - boardElement.clientLeft;
      const finalY = targetRect.top - boardRect.top - boardElement.clientTop;
      const fullDropStart = -(finalY + targetRect.height + 18);
      const startOffset = reduceMotion ? -Math.min(18, targetRect.height * 0.35) : fullDropStart;
      const dropDistance = Math.abs(startOffset);
      const gravityDuration = Math.sqrt((2 * dropDistance) / DROP_GRAVITY_PX_PER_MS2);
      const rawSpeedMultiplier = Number(getDropSpeedMultiplier());
      const speedMultiplier = Number.isFinite(rawSpeedMultiplier)
        ? Math.max(0.5, Math.min(2, rawSpeedMultiplier))
        : 1;
      const baseDuration = Math.round(Math.max(DROP_MIN_ANIMATION_MS, Math.min(DROP_MAX_ANIMATION_MS, gravityDuration)));
      const duration = reduceMotion
        ? 140
        : Math.round(baseDuration / speedMultiplier);

      fallingPiece.className = `falling-piece ${player === HUMAN ? "red" : "yellow"}`;
      fallingPiece.style.width = `${targetRect.width}px`;
      fallingPiece.style.height = `${targetRect.height}px`;
      fallingPiece.style.left = `${finalX}px`;
      fallingPiece.style.top = `${finalY}px`;

      boardElement.appendChild(fallingPiece);

      return new Promise((resolve) => {
        let didFinish = false;
        let fallbackTimer = null;
        const finish = () => {
          if (didFinish) return;
          didFinish = true;
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
          fallingPiece.remove();
          resolve();
        };

        // Keep every browser on the CSS path so the drop feels consistent.
        const gravityStep = (timeRatio) => (
          `${startOffset * (1 - Math.pow(timeRatio, DROP_MOTION_EXPONENT))}px`
        );
        fallingPiece.style.setProperty("--drop-start", `${startOffset}px`);
        fallingPiece.style.setProperty("--drop-duration", `${duration}ms`);
        fallingPiece.style.setProperty("--drop-step-18", gravityStep(0.18));
        fallingPiece.style.setProperty("--drop-step-35", gravityStep(0.35));
        fallingPiece.style.setProperty("--drop-step-52", gravityStep(0.52));
        fallingPiece.style.setProperty("--drop-step-68", gravityStep(0.68));
        fallingPiece.style.setProperty("--drop-step-82", gravityStep(0.82));
        fallingPiece.style.setProperty("--drop-step-93", gravityStep(0.93));
        fallingPiece.style.setProperty("--drop-settle", `${-Math.max(2, Math.min(6, dropDistance * 0.012))}px`);
        fallingPiece.style.transform = `translate3d(0, ${startOffset}px, 0)`;
        fallingPiece.getBoundingClientRect();
        fallingPiece.addEventListener("animationend", finish, { once: true });
        fallingPiece.classList.add(reduceMotion ? "css-drop-reduced" : "css-drop");
        fallbackTimer = window.setTimeout(finish, duration + 90);
      });
    }

    function setHoverColumn(col) {
      // Hover and focus show a ghost piece in the row where the next red piece would land.
      const board = getBoard();
      if (!isManualHumanTurn() || board[0][col] !== EMPTY) {
        clearHoverColumn();
        return;
      }
      if (hoverColumn === col) return;
      hoverColumn = col;
      render();
    }

    function clearHoverColumn(options = {}) {
      if (hoverColumn === null) return;
      hoverColumn = null;
      if (options.render !== false) {
        render();
      }
    }

    function createColumnControls() {
      // Numbered buttons match the keyboard shortcuts, so columns can be played by click or key.
      const controls = document.getElementById("columnControls");
      controls.innerHTML = "";

      for (let col = 0; col < COLS; col += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "column-button";
        button.textContent = col + 1;
        button.setAttribute("aria-label", `Drop piece in column ${col + 1}`);
        button.addEventListener("click", () => onHumanMove(col));
        button.addEventListener("mouseenter", () => setHoverColumn(col));
        button.addEventListener("focus", () => setHoverColumn(col));
        button.addEventListener("mouseleave", clearHoverColumn);
        button.addEventListener("blur", clearHoverColumn);
        controls.appendChild(button);
      }
    }

    function updateColumnButtons() {
      syncBoardInteractivity();
      const board = getBoard();
      const buttons = document.querySelectorAll(".column-button");
      const manualTurn = isManualHumanTurn();
      buttons.forEach((button, col) => {
        button.disabled = !manualTurn || board[0][col] !== EMPTY;
        button.classList.toggle("hover-preview", hoverColumn === col && !button.disabled);
      });
    }

    function getClosestColumnFromPointer(event) {
      const boardElement = event.currentTarget || document.getElementById("board");
      if (!boardElement) return null;

      let closestColumn = null;
      let closestDistance = Infinity;
      for (let col = 0; col < COLS; col += 1) {
        const topCell = boardElement.children[col];
        if (!topCell) continue;
        const rect = topCell.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const distance = Math.abs(event.clientX - centerX);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestColumn = col;
        }
      }

      return closestColumn;
    }

    function handleBoardPointer(event) {
      const col = getClosestColumnFromPointer(event);
      if (col === null) {
        clearHoverColumn();
        return;
      }
      setHoverColumn(col);
    }

    function handleBoardTouch(event) {
      if (!event.touches || event.touches.length === 0) return;
      handleBoardPointer(event.touches[0]);
    }

    function handleBoardClick(event) {
      const col = getClosestColumnFromPointer(event);
      if (col !== null) {
        onHumanMove(col);
      }
    }

    function handleKeyboardDrop(event) {
      // Number keys 1-7 drop pieces unless the user is editing a form control or overlay.
      if (!/^[1-7]$/.test(event.key)) return;
      if (isExperimentLabOpen() || isWalkthroughOpen()) return;
      const activeTag = document.activeElement ? document.activeElement.tagName : "";
      if (activeTag === "INPUT" || activeTag === "SELECT" || activeTag === "TEXTAREA") return;
      const col = Number(event.key) - 1;
      const board = getBoard();
      if (!isManualHumanTurn() || board[0][col] !== EMPTY) return;
      event.preventDefault();
      onHumanMove(col);
    }

    function bindEvents() {
      createColumnControls();
      const boardElement = document.getElementById("board");
      boardElement.addEventListener("mousemove", handleBoardPointer);
      boardElement.addEventListener("touchstart", handleBoardTouch, { passive: true });
      boardElement.addEventListener("touchmove", handleBoardTouch, { passive: true });
      boardElement.addEventListener("touchend", () => clearHoverColumn());
      boardElement.addEventListener("touchcancel", () => clearHoverColumn());
      boardElement.addEventListener("click", handleBoardClick);
      boardElement.addEventListener("mouseleave", clearHoverColumn);
      document.addEventListener("keydown", handleKeyboardDrop);
    }

    return {
      render,
      animateDrop,
      createColumnControls,
      updateColumnButtons,
      getGhostRow,
      setHoverColumn,
      clearHoverColumn,
      getClosestColumnFromPointer,
      handleBoardPointer,
      handleBoardTouch,
      handleBoardClick,
      handleKeyboardDrop,
      bindEvents
    };
  }

  const api = { createBoardUi };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4BoardUi = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
