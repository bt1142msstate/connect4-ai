# Connect 4 AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local browser-based Connect 4 game with a depth-limited minimax opponent, alpha-beta pruning, heuristic evaluation, AI move explanations, replay controls, and headless validation.

![Connect 4 AI full interface preview](assets/connect4-ai-full-preview.png)

## Run the Game

Open `index.html` in a browser. No server or package install is required for gameplay.
After a game ends, the side panel's Replay tab lets you scrub through every move, step backward or forward one move at a time, or play the whole game back at a selected speed. AI moves include the reason, depth, algorithm, nodes searched, score, and move time.
Use the How It Works button for an in-app walkthrough of the board model, rules, minimax search, pruning, heuristic, and validation flow.

## Report

Open `report.html` for a short technical write-up. Use the Create PDF button to save a PDF through the browser print dialog.

## Optional Headless Validation

If Node.js is available, run:

```bash
node headless-test.js
```

The headless runner checks Connect 4 rules, invalid and full-column rejection, move ordering, win/draw detection, red minimizer behavior, depth-adjusted terminal scoring, alpha-beta consistency, tie variation, and uneven-depth AI matchups.

Additional CLI evidence exports:

```bash
node script.js --headless --red-depth=2 --yellow-depth=6 --games=6 --format=summary
node script.js --experiment --board=midgame --max-depth=6 --format=csv --out=experiment.csv
node script.js --help
```

## Files

- `index.html` - local browser game
- `style.css` - dark responsive styling
- `script.js` - game logic, AI logic, Experiment Lab, and Node exports
- `report.html` - technical HTML report
- `headless-test.js` - optional Node-based validation runner
- `assets/connect4-ai-full-preview.png` - README preview image

## License

This project is open source under the [MIT License](LICENSE).

## Generated Support Assets

Generated PDFs, screenshots, videos, and packaged archives are intentionally ignored by Git so the repository stays focused on the runnable source.
