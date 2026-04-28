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

  const DROP_ANIMATION_MS = 300;

  function createBoardUi(options = {}) {
    // The board UI never owns rules; it asks the controller for current state.
    let hoverColumn = null;

    const getBoard = options.getBoard ?? (() => []);
    const getWinningCells = options.getWinningCells ?? (() => []);
    const getCurrentPlayer = options.getCurrentPlayer ?? (() => HUMAN);
    const getGameOver = options.getGameOver ?? (() => false);
    const getIsAiThinking = options.getIsAiThinking ?? (() => false);
    const isRedAiEnabled = options.isRedAiEnabled ?? (() => false);
    const isExperimentLabOpen = options.isExperimentLabOpen ?? (() => false);
    const isWalkthroughOpen = options.isWalkthroughOpen ?? (() => false);
    const onHumanMove = options.onHumanMove ?? (() => {});

    function isManualHumanTurn() {
      return !isRedAiEnabled() && getCurrentPlayer() === HUMAN && !getGameOver() && !getIsAiThinking();
    }

    function getGhostRow() {
      if (hoverColumn === null || !isManualHumanTurn()) return -1;
      return getOpenRow(getBoard(), hoverColumn);
    }

    function render(renderOptions = {}) {
      // Rebuild all 42 cells from state, then let CSS handle pieces and highlights.
      const board = getBoard();
      const boardElement = document.getElementById("board");
      boardElement.innerHTML = "";
      const winSet = new Set(getWinningCells().map(([row, col]) => `${row},${col}`));
      const hiddenCell = renderOptions.hiddenCell ? `${renderOptions.hiddenCell.row},${renderOptions.hiddenCell.col}` : null;
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
      // A temporary overlay piece animates into the hidden final cell to avoid overshoot.
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
      const board = getBoard();
      const buttons = document.querySelectorAll(".column-button");
      buttons.forEach((button, col) => {
        button.disabled = isRedAiEnabled() || getGameOver() || getIsAiThinking() || getCurrentPlayer() !== HUMAN || board[0][col] !== EMPTY;
        button.classList.toggle("hover-preview", hoverColumn === col && !button.disabled);
      });
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
      onHumanMove(Number(cell.dataset.col));
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
      handleBoardPointer,
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
