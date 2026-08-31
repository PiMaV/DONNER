/**
 * Classic Conway Game of Life (B3/S23).
 *
 * Ported from BLITZ `blitz/data/conway.py` (rules, seeds, wrap, patterns).
 * Grid is uint8 {0,1}, row-major: index = y * width + x.
 *
 * Ember decay in BLITZ is a 2D display trail. DONNER uses a separate
 * space-time decay in the renderer — do not mix the two.
 */

import { clamp } from "./rng.js";

export const PATTERN_NAMES = [
  "Blinker",
  "Toad",
  "Beacon",
  "Glider",
  "R-pentomino",
  "Gosper gun",
  "Random",
];

const GOSPER_COORDS = [
  [0, 24],
  [1, 22],
  [1, 24],
  [2, 12],
  [2, 13],
  [2, 20],
  [2, 21],
  [2, 34],
  [2, 35],
  [3, 11],
  [3, 15],
  [3, 20],
  [3, 21],
  [3, 34],
  [3, 35],
  [4, 0],
  [4, 1],
  [4, 10],
  [4, 16],
  [4, 20],
  [4, 21],
  [5, 0],
  [5, 1],
  [5, 10],
  [5, 14],
  [5, 16],
  [5, 17],
  [5, 22],
  [5, 24],
  [6, 10],
  [6, 16],
  [6, 24],
  [7, 11],
  [7, 15],
  [8, 12],
  [8, 13],
];

function wrapCoord(i, n) {
  return ((i % n) + n) % n;
}

function place(pattern, height, width, row, col) {
  const grid = new Uint8Array(height * width);
  const ph = pattern.length;
  const pw = pattern[0].length;
  const r0 = Math.max(0, row);
  const c0 = Math.max(0, col);
  const r1 = Math.min(height, row + ph);
  const c1 = Math.min(width, col + pw);
  const pr0 = r0 - row;
  const pc0 = c0 - col;
  for (let r = r0; r < r1; r++) {
    const src = pattern[pr0 + (r - r0)];
    const dstRow = r * width;
    for (let c = c0; c < c1; c++) {
      grid[dstRow + c] = src[pc0 + (c - c0)] ? 1 : 0;
    }
  }
  return grid;
}

function centerOffset(ph, pw, height, width) {
  return [Math.max(0, Math.floor((height - ph) / 2)), Math.max(0, Math.floor((width - pw) / 2))];
}

function normalizePatternKey(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/-/g, "_");
}

/**
 * One B3/S23 generation into `out` (may be the same buffer length as `grid`).
 * `grid` must not alias `out`.
 */
export function stepClassicInto(grid, out, width, height, wrap) {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          let nx = x + dx;
          let ny = y + dy;
          if (wrap) {
            nx = wrapCoord(nx, width);
            ny = wrapCoord(ny, height);
          } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          n += grid[ny * width + nx];
        }
      }
      const alive = grid[row + x];
      out[row + x] = (alive ? n === 2 || n === 3 : n === 3) ? 1 : 0;
    }
  }
}

export function stepClassic(grid, width, height, wrap = true) {
  const next = new Uint8Array(width * height);
  stepClassicInto(grid, next, width, height, wrap);
  return next;
}

export function seedPattern(name, height, width, rng, density = 0.28) {
  const h = Math.max(8, height | 0);
  const w = Math.max(8, width | 0);
  const key = normalizePatternKey(name);

  if (key === "random") {
    const dens = clamp(density, 0.01, 0.95);
    const grid = new Uint8Array(h * w);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = rng.random() < dens ? 1 : 0;
    }
    return grid;
  }

  if (key === "glider") {
    const pat = [
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 1],
    ];
    const [r, c] = centerOffset(3, 3, h, w);
    return place(pat, h, w, r, c);
  }

  if (key === "blinker") {
    const pat = [[1, 1, 1]];
    const [r, c] = centerOffset(1, 3, h, w);
    return place(pat, h, w, r, c);
  }

  if (key === "toad") {
    const pat = [
      [0, 1, 1, 1],
      [1, 1, 1, 0],
    ];
    const [r, c] = centerOffset(2, 4, h, w);
    return place(pat, h, w, r, c);
  }

  if (key === "beacon") {
    const pat = [
      [1, 1, 0, 0],
      [1, 1, 0, 0],
      [0, 0, 1, 1],
      [0, 0, 1, 1],
    ];
    const [r, c] = centerOffset(4, 4, h, w);
    return place(pat, h, w, r, c);
  }

  if (key === "r_pentomino" || key === "rpentomino") {
    const pat = [
      [0, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const [r, c] = centerOffset(3, 3, h, w);
    return place(pat, h, w, r, c);
  }

  if (key === "gosper_gun" || key === "gospergun") {
    if (h < 12 || w < 40) {
      return seedPattern("Glider", h, w, rng, density);
    }
    const pat = Array.from({ length: 9 }, () => Array(36).fill(0));
    for (const [r, c] of GOSPER_COORDS) {
      pat[r][c] = 1;
    }
    const [r0, c0] = centerOffset(9, 36, h, w);
    return place(pat, h, w, r0, c0);
  }

  return seedPattern("Random", h, w, rng, density);
}

export function gridsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function countLive(grid) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i];
  return n;
}

export function collectLive(grid, width, height, xs, ys) {
  let n = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (grid[row + x]) {
        xs[n] = x;
        ys[n] = y;
        n++;
      }
    }
  }
  return n;
}

export class ConwayWorld {
  constructor({ width, height, wrap = true }) {
    this.width = Math.max(8, width | 0);
    this.height = Math.max(8, height | 0);
    this.wrap = wrap;
    this.generation = 0;
    this._a = new Uint8Array(this.width * this.height);
    this._b = new Uint8Array(this.width * this.height);
    this.grid = this._a;
  }

  load(grid) {
    this._a.fill(0);
    this._b.fill(0);
    this.grid = this._a;
    if (grid && grid.length) {
      this.grid.set(grid.subarray(0, Math.min(grid.length, this.grid.length)));
    }
    this.generation = 0;
  }

  step() {
    const next = this.grid === this._a ? this._b : this._a;
    stepClassicInto(this.grid, next, this.width, this.height, this.wrap);
    const changed = !gridsEqual(this.grid, next);
    this.grid = next;
    this.generation += 1;
    return changed;
  }

  toggle(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = y * this.width + x;
    this.grid[i] = this.grid[i] ? 0 : 1;
    return true;
  }
}
