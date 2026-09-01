# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page vanilla Tetris implementation. No build step, no package manager, no dependencies — just `index.html`, `style.css`, and `game.js`. The README is in Spanish and describes the project the same way this file does.

## Running the game

Open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or: npx serve .
```

There is no test suite, linter, or build/bundle step — verify changes by loading the page and playing.

## Architecture

Everything lives in `game.js` (~300 lines), driven by a handful of module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) rather than a class or state object. Key pieces:

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces** (`PIECES`): defined as square matrices. `rotateCW` rotates by transposing + reversing rows — there is no per-piece rotation state, the shape matrix itself is mutated on rotate.
- **Collision** (`collide`): checks a shape against board bounds and existing locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` until one doesn't collide, else the rotation is discarded.
- **Game loop** (`loop`): `requestAnimationFrame`-driven, accumulates delta time and drops the piece one row once `dropAccum >= dropInterval`.
- **Locking** (`lockPiece` → `merge` + `clearLines` + `spawn`): merges the current piece into the board, clears completed rows (shifting from the bottom up), then spawns the next piece.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points/row dropped, soft drop adds 1 point/row.
- **Leveling/speed**: level increments every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.
- Game over is triggered inside `spawn()` when a freshly spawned piece immediately collides.

Rendering is plain Canvas 2D (`draw()` for the main board, `drawNext()` for the preview canvas) — no scene graph, everything is redrawn every frame from board + current-piece state.

## Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
