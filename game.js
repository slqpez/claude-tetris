'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const WILDCARD = 8;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f5f5f5', // wildcard - created by the DYE power-up
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---- Power-ups ----
const POWERUP_LINE_INTERVAL = 5; // lines cleared between special pieces
const FREEZE_DURATION = 5000;    // ms

const POWERUP_TYPES = {
  BOMB:      { letter: 'B', color: '#ff5252' },
  LIGHTNING: { letter: 'L', color: '#ffee58' },
  DYE:       { letter: 'D', color: '#ba68c8' },
  GRAVITY:   { letter: 'G', color: '#66bb6a' },
  FREEZE:    { letter: 'F', color: '#4fc3f7' },
};
const POWERUP_KEYS = Object.keys(POWERUP_TYPES);

// ---- Skins ----
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00e5ff', '#ffea00', '#e040fb', '#00e676', '#ff1744', '#40c4ff', '#ff9100', '#ffffff'],
    glow: true,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8dadc', '#ffe8a3', '#d8bfd8', '#b5e6b5', '#ffb3ab', '#b8d4f0', '#ffd4a3', '#fdfaf5'],
    rounded: true,
  },
  pixelart: {
    label: 'Pixel Art',
    colors: COLORS,
    texture: true,
  },
};
const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesSincePowerUp, powerUpQueued, freezeUntil;

const THEME_KEY = 'tetris-theme';

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeSwitch.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
}

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  if (current) draw();
  if (next) drawNext();
});

initTheme();

function applySkin(skin) {
  if (!SKINS[skin]) skin = 'retro';
  currentSkin = skin;
  document.body.classList.remove(...Object.keys(SKINS).map(k => `skin-${k}`));
  document.body.classList.add(`skin-${skin}`);
  skinSelect.value = skin;
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY) || 'retro';
  applySkin(saved);
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  localStorage.setItem(SKIN_KEY, skinSelect.value);
  if (current) draw();
  if (next) drawNext();
});

initSkin();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerUpPiece() {
  const powerUpType = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
  const shape = [[1]];
  return {
    type: 0,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
    isPowerUp: true,
    powerUpType,
  };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesSincePowerUp += cleared;
    if (linesSincePowerUp >= POWERUP_LINE_INTERVAL) {
      powerUpQueued = true;
      linesSincePowerUp -= POWERUP_LINE_INTERVAL;
    }
    updateHUD();
  }
}

// ---- PowerUps manager ----
// Each function mutates `board` directly, mirroring the merge()/clearLines() pattern.

function explodeBomb(x, y) {
  for (let r = y - 1; r <= y + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = x - 1; c <= x + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      board[r][c] = 0;
    }
  }
}

function strikeLightning(x, y) {
  if (y >= 0 && y < ROWS) board[y].fill(0);
  if (x >= 0 && x < COLS) {
    for (let r = 0; r < ROWS; r++) board[r][x] = 0;
  }
}

function applyDye() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v && v !== WILDCARD) counts[v]++;
    }
  let bestColor = 0, bestCount = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > bestCount) { bestCount = counts[i]; bestColor = i; }
  }
  if (!bestColor) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === bestColor) board[r][c] = WILDCARD;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const values = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) values.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = values.length ? values.pop() : 0;
    }
  }
}

function applyFreeze() {
  freezeUntil = performance.now() + FREEZE_DURATION;
}

// Returns true when the effect altered the grid and lines should be re-evaluated.
function applyPowerUp(type, x, y) {
  switch (type) {
    case 'BOMB': explodeBomb(x, y); return true;
    case 'LIGHTNING': strikeLightning(x, y); return true;
    case 'DYE': applyDye(); return true;
    case 'GRAVITY': applyGravity(); return true;
    case 'FREEZE': applyFreeze(); return false;
    default: return false;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.isPowerUp) {
    const gridChanged = applyPowerUp(current.powerUpType, current.x, current.y);
    if (gridChanged) clearLines();
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function spawn() {
  current = next;
  if (powerUpQueued) {
    next = randomPowerUpPiece();
    powerUpQueued = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function roundedRectPath(context, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, w, h, r);
  } else {
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }
}

function drawPixelTexture(context, px, py, s) {
  const sub = s / 4;
  context.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * sub, py + j * sub, sub, sub);
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

function paintSkinnedBlock(context, px, py, s, color, alpha) {
  const skin = SKINS[currentSkin];
  context.globalAlpha = alpha ?? 1;
  context.save();
  if (skin.glow) {
    context.shadowColor = color;
    context.shadowBlur = s * 0.6;
  }
  if (skin.rounded) {
    roundedRectPath(context, px, py, s, s, s * 0.25);
    context.fillStyle = color;
    context.fill();
  } else {
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
  }
  context.restore();
  // highlight
  if (skin.rounded) {
    roundedRectPath(context, px + 2, py + 2, s - 4, (s - 4) * 0.45, (s - 4) * 0.22);
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fill();
  } else {
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, s, 4);
  }
  if (skin.texture) drawPixelTexture(context, px, py, s);
  context.globalAlpha = 1;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  paintSkinnedBlock(context, x * size + 1, y * size + 1, size - 2, color, alpha);
}

function drawPowerUpBlock(context, x, y, powerUpType, size, alpha) {
  const info = POWERUP_TYPES[powerUpType];
  if (!info) return;
  paintSkinnedBlock(context, x * size + 1, y * size + 1, size - 2, info.color, alpha);
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = '#101018';
  context.font = `bold ${Math.floor(size * 0.55)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(info.letter, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function getGridColor() {
  return getComputedStyle(document.body).getPropertyValue('--grid-color').trim() || '#22222e';
}

function drawGrid() {
  ctx.strokeStyle = getGridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      if (current.isPowerUp) drawPowerUpBlock(ctx, current.x + c, gy + r, current.powerUpType, BLOCK, 0.2);
      else drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
    }

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      if (current.isPowerUp) drawPowerUpBlock(ctx, current.x + c, current.y + r, current.powerUpType, BLOCK);
      else drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
    }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      if (next.isPowerUp) drawPowerUpBlock(nextCtx, offX + c, offY + r, next.powerUpType, NB);
      else drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
    }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (ts >= freezeUntil) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  linesSincePowerUp = 0;
  powerUpQueued = false;
  freezeUntil = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
