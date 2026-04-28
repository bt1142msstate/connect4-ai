(function attachConnect4ExperimentUi(root) {
  const engine = typeof module !== "undefined" && module.exports
    ? require("./connect4-engine.js")
    : root.Connect4Engine;
  const experiment = typeof module !== "undefined" && module.exports
    ? require("./connect4-experiment.js")
    : root.Connect4Experiment;

  const { ROWS, formatNumber, formatSeconds } = engine;
  const {
    buildExperimentResultWithProgress,
    buildExperimentSummaryText,
    experimentToCsv
  } = experiment;

  function yieldToBrowser() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
  }

  function getControlValue(id, fallback) {
    if (typeof document === "undefined") return fallback;
    const element = document.getElementById(id);
    return element ? element.value : fallback;
  }

  function getControlChecked(id, fallback) {
    if (typeof document === "undefined") return fallback;
    const element = document.getElementById(id);
    return element ? element.checked : fallback;
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

  function createExperimentLab(options = {}) {
    let latestExperimentResult = null;
    const getCurrentBoard = options.getCurrentBoard ?? (() => null);
    const getCurrentPlayer = options.getCurrentPlayer ?? (() => null);
    const waitForFrame = options.yieldToBrowser ?? yieldToBrowser;

    function open() {
      const overlay = document.getElementById("experimentOverlay");
      overlay.hidden = false;
      document.getElementById("runExperimentButton").focus();
    }

    function close() {
      document.getElementById("experimentOverlay").hidden = true;
    }

    function isOpen() {
      const overlay = document.getElementById("experimentOverlay");
      return Boolean(overlay && !overlay.hidden);
    }

    function getConfig(overrides = {}) {
      const maxDepth = Number(overrides.maxDepth ?? getControlValue("experimentMaxDepth", 5));
      const validationGames = Number(overrides.validationGames ?? getControlValue("experimentValidationGames", 2));
      return {
        boardSource: overrides.boardSource ?? getControlValue("experimentBoardSource", "empty"),
        maxDepth: Math.min(Math.max(maxDepth || 5, 3), 6),
        validationGames: Math.min(Math.max(validationGames || 2, 1), 6),
        tieVariation: overrides.tieVariation ?? getControlChecked("experimentTieVariation", true),
        includeMatchups: overrides.includeMatchups ?? getControlChecked("experimentMatchups", true)
      };
    }

    function setProgress(percent, label) {
      const progress = document.getElementById("experimentProgress");
      if (!progress) return;
      const clamped = Math.min(Math.max(percent, 0), 100);
      progress.hidden = false;
      document.getElementById("experimentProgressFill").style.width = `${clamped}%`;
      document.getElementById("experimentProgressPercent").textContent = `${Math.round(clamped)}%`;
      document.getElementById("experimentProgressLabel").textContent = label;
    }

    function hideProgress() {
      const progress = document.getElementById("experimentProgress");
      if (progress) progress.hidden = true;
    }

    function renderResult(result) {
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

    async function run() {
      const runButton = document.getElementById("runExperimentButton");
      const rowsElement = document.getElementById("benchmarkRows");
      const config = getConfig();
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
      setProgress(0, "Starting experiment...");

      try {
        await waitForFrame();
        latestExperimentResult = await buildExperimentResultWithProgress(config, {
          currentBoard: getCurrentBoard(),
          currentPlayer: getCurrentPlayer(),
          onProgress: async ({ percent, label }) => {
            setProgress(percent, label);
            await waitForFrame();
          }
        });
        renderResult(latestExperimentResult);
        setProgress(100, "Experiment complete.");
      } catch (error) {
        console.error(error);
        document.getElementById("experimentSummary").textContent = `Experiment failed: ${error.message}`;
        setProgress(100, "Experiment failed.");
      } finally {
        runButton.disabled = false;
        const hasResult = Boolean(latestExperimentResult);
        document.getElementById("downloadJsonButton").disabled = !hasResult;
        document.getElementById("downloadCsvButton").disabled = !hasResult;
        document.getElementById("downloadSummaryButton").disabled = !hasResult;
      }
    }

    function markControlsChanged() {
      latestExperimentResult = null;
      hideProgress();
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

    function downloadJson() {
      if (!latestExperimentResult) return;
      downloadText("connect4-ai-experiment-results.json", JSON.stringify(latestExperimentResult, null, 2), "application/json");
    }

    function downloadCsv() {
      if (!latestExperimentResult) return;
      downloadText("connect4-ai-experiment-results.csv", experimentToCsv(latestExperimentResult), "text/csv");
    }

    function downloadSummary() {
      if (!latestExperimentResult) return;
      downloadText("connect4-ai-experiment-summary.txt", buildExperimentSummaryText(latestExperimentResult), "text/plain");
    }

    function bindEvents() {
      document.getElementById("openExperimentButton").addEventListener("click", open);
      document.getElementById("closeExperimentButton").addEventListener("click", close);
      document.getElementById("runExperimentButton").addEventListener("click", run);
      document.getElementById("downloadJsonButton").addEventListener("click", downloadJson);
      document.getElementById("downloadCsvButton").addEventListener("click", downloadCsv);
      document.getElementById("downloadSummaryButton").addEventListener("click", downloadSummary);
      for (const id of [
        "experimentBoardSource",
        "experimentMaxDepth",
        "experimentValidationGames",
        "experimentTieVariation",
        "experimentMatchups"
      ]) {
        document.getElementById(id).addEventListener("change", markControlsChanged);
      }
      document.getElementById("experimentOverlay").addEventListener("click", (event) => {
        if (event.target.id === "experimentOverlay") close();
      });
    }

    return {
      open,
      close,
      isOpen,
      getConfig,
      setProgress,
      hideProgress,
      renderResult,
      run,
      markControlsChanged,
      downloadJson,
      downloadCsv,
      downloadSummary,
      bindEvents,
      getResult: () => latestExperimentResult
    };
  }

  const api = { createExperimentLab };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Connect4ExperimentUi = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
