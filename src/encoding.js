/**
 * Encoding adapter: color LUT and fill for packed `k` / `s`.
 * Conway LUT still / osc / moving / unsettled / base; a count stack maps a
 * value window onto Colormap rungs. Moving is a LUT index (Color coding off), not a motion gate.
 */

import { COLOR, hexCss } from "./config.js";
import { KIND_BASE, SCALE_UNIFORM, stabilityScale } from "./dynamics.js";

export const CONWAY_BASE_K = KIND_BASE;
/** @deprecated Use CONWAY_BASE_K. */
export const CONWAY_WARMUP_K = CONWAY_BASE_K;

/** Hex colors indexed by Conway `k` (still, osc, moving, base, unsettled). */
export const CONWAY_KIND_HEX = [
  COLOR.gold,
  COLOR.cyan,
  COLOR.blitz,
  COLOR.base,
  COLOR.unsettled,
];

/** Count rungs: 1 = cyan, mid = gold, max = BLITZ coral. Index 0 unused. */
export const COUNT_RAMP_HEX = [COLOR.cyan, COLOR.gold, COLOR.blitz];

/**
 * Integer-ramp palettes for count / MNI. Conway occupancy classes stay
 * categorical (Color coding checkbox).
 */
export const COUNT_CMAPS = {
  donner: { id: "donner", label: "DONNER", stops: COUNT_RAMP_HEX },
  gray: { id: "gray", label: "Gray", stops: [0x2a2e33, 0xf4f6f8] },
  inferno: {
    id: "inferno",
    label: "Inferno",
    stops: [
      0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60,
      0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4,
    ],
  },
  plasma: {
    id: "plasma",
    label: "Plasma",
    stops: [
      0x0d0887, 0x5302a3, 0x8b0aa5, 0xb83289,
      0xdb5c68, 0xf48849, 0xfebc2a, 0xf0f921,
    ],
  },
  turbo: {
    id: "turbo",
    label: "Turbo",
    stops: [
      0x30123b, 0x3c4cc0, 0x2196f3, 0x26c6da,
      0x66bb6a, 0xd4e157, 0xffca28, 0xff7043, 0xb71c1c,
    ],
  },
};

export const COUNT_CMAP_IDS = Object.keys(COUNT_CMAPS);
export const DEFAULT_COUNT_CMAP = "donner";
/** Display rungs for the count / MNI ramp. Not a data-max cap. */
export const COUNT_LUT_RUNGS = 256;
export const DEFAULT_COUNT_TRIM = 1;

export function normalizeCountCmap(id) {
  const key = String(id || "").toLowerCase();
  return COUNT_CMAPS[key] ? key : DEFAULT_COUNT_CMAP;
}

export function sampleStops(stops, t) {
  const ramp = stops && stops.length ? stops : COUNT_RAMP_HEX;
  if (ramp.length === 1) return ramp[0] | 0;
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  const scaled = u * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(scaled));
  return lerpHex(ramp[i], ramp[i + 1], scaled - i);
}

export function countCmapCss(id) {
  const stops = COUNT_CMAPS[normalizeCountCmap(id)].stops;
  return `linear-gradient(90deg, ${stops.map((h) => hexCss(h)).join(", ")})`;
}

export function lerpHex(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bc = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bc;
}

/** Stretch 0…255 gray to RGBA via a count cmap (ingest preview). */
export function grayToCmapRgba(gray, cmap = "plasma") {
  const src = gray || [];
  const stops = COUNT_CMAPS[normalizeCountCmap(cmap)].stops;
  const rgba = new Uint8ClampedArray(src.length * 4);
  for (let i = 0; i < src.length; i++) {
    const hex = sampleStops(stops, src[i] / 255);
    const o = i * 4;
    rgba[o] = (hex >> 16) & 255;
    rgba[o + 1] = (hex >> 8) & 255;
    rgba[o + 2] = hex & 255;
    rgba[o + 3] = 255;
  }
  return rgba;
}

/** LUT indexed by display rung `k` (0 unused / base gray). */
export function countKindHex(rungs, cmap = DEFAULT_COUNT_CMAP) {
  const hi = Math.max(1, rungs | 0);
  const stops = COUNT_CMAPS[normalizeCountCmap(cmap)].stops;
  const hex = new Array(hi + 1);
  hex[0] = COLOR.base;
  for (let k = 1; k <= hi; k++) {
    const t = hi === 1 ? 1 : (k - 1) / (hi - 1);
    hex[k] = sampleStops(stops, t);
  }
  return hex;
}

export function normalizeCountTrim(value) {
  const n = Number(value);
  if (n === -1) return -1;
  if (n === 2) return 2;
  if (n === 1) return 1;
  if (n === 0) return 0;
  return DEFAULT_COUNT_TRIM;
}

/** Position of `v` in [winLo, winHi], clamped to 0…1. */
export function countWindowT(v, winLo, winHi) {
  const x = Number(v);
  const lo = Number(winLo);
  const hi = Number(winHi);
  if (!Number.isFinite(x)) return 0;
  const span = hi - lo;
  if (!(span > 0)) return x >= hi ? 1 : 0;
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  return (x - lo) / span;
}

/** Map a raw count onto LUT rungs 1…rungs. */
export function countValueToRung(v, winLo, winHi, rungs = COUNT_LUT_RUNGS) {
  const n = Math.max(1, rungs | 0);
  const t = countWindowT(v, winLo, winHi);
  return 1 + Math.round(t * (n - 1));
}

export function percentileAt(sorted, p) {
  const n = sorted && sorted.length ? sorted.length | 0 : 0;
  if (n === 0) return 0;
  if (n === 1) return Number(sorted[0]) || 0;
  const u = Math.min(100, Math.max(0, Number(p) || 0));
  const idx = (u / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(n - 1, Math.ceil(idx));
  const a = Number(sorted[lo]) || 0;
  if (lo === hi) return a;
  const b = Number(sorted[hi]) || 0;
  return a + (b - a) * (idx - lo);
}

/**
 * Color-window from positive values. `percentile` 0 is min/max;
 * 1 clips p1…p99 (both tails).
 */
export function countTrimLevels(values, percentile = 0) {
  const src = values || [];
  const n = src.length | 0;
  if (n === 0) return { lo: 1, hi: 1 };
  let min = Number(src[0]) || 0;
  let max = min;
  for (let i = 1; i < n; i++) {
    const v = Number(src[i]) || 0;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max < min) max = min;
  const p = Number(percentile) || 0;
  if (p <= 0 || n < 2) return { lo: min, hi: max };
  const pct = Math.min(49, Math.max(0, p));
  const sorted = src instanceof Uint16Array ? Uint16Array.from(src) : Float64Array.from(src);
  sorted.sort();
  const lo = Math.round(percentileAt(sorted, pct));
  let hi = Math.round(percentileAt(sorted, 100 - pct));
  if (hi < lo) hi = lo;
  return { lo, hi };
}

export function clampCountWindow(lo, hi, dataMin, dataMax) {
  const dLo = Number.isFinite(Number(dataMin)) ? Number(dataMin) : 1;
  const dHi = Math.max(dLo, Number.isFinite(Number(dataMax)) ? Number(dataMax) : dLo);
  let a = Number(lo);
  let b = Number(hi);
  if (!Number.isFinite(a)) a = dLo;
  if (!Number.isFinite(b)) b = dHi;
  a = Math.min(dHi, Math.max(dLo, a));
  b = Math.min(dHi, Math.max(dLo, b));
  if (b < a) b = a;
  if (b === a && dHi > a) b = Math.min(dHi, a + 1);
  return { lo: a, hi: b };
}

export function encodingFill(k, s, stabMode, baseK = CONWAY_BASE_K, opts = {}) {
  if (stabMode === "none" || (k | 0) === baseK) return SCALE_UNIFORM;
  return stabilityScale(s, opts.cap, opts.start, opts.max);
}

/** Cube fill on the focus slice; 0 if there is no event. */
export function encodingCubeFill(event, stabMode, baseK = CONWAY_BASE_K, opts = {}) {
  if (!event) return 0;
  return encodingFill(event.k, event.s, stabMode, baseK, opts);
}
