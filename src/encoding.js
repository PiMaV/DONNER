/**
 * Encoding adapter: color LUT and fill for packed `k` / `s`.
 * Conway fills still/osc/transit; a count stack fills integer rungs.
 */

import { COLOR } from "./config.js";
import { KIND_WARMUP, SCALE_UNIFORM, stabilityScale } from "./dynamics.js";

export const CONWAY_WARMUP_K = KIND_WARMUP;

/** Hex colors indexed by Conway `k` (still, osc, transit, warmup). */
export const CONWAY_KIND_HEX = [
  COLOR.gold,
  COLOR.cyan,
  COLOR.blitz,
  COLOR.warmup,
];

/** Count rungs: 1 = cyan, mid = gold, max = BLITZ coral. Index 0 unused. */
export const COUNT_RAMP_HEX = [COLOR.cyan, COLOR.gold, COLOR.blitz];

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

/** LUT indexed by integer count `k` (0 unused / warmup gray). */
export function countKindHex(ceiling) {
  const hi = Math.max(1, ceiling | 0);
  const stops = COUNT_RAMP_HEX;
  const hex = new Array(hi + 1);
  hex[0] = COLOR.warmup;
  for (let k = 1; k <= hi; k++) {
    const t = hi === 1 ? 1 : (k - 1) / (hi - 1);
    const scaled = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    hex[k] = lerpHex(stops[i], stops[i + 1], scaled - i);
  }
  return hex;
}

export function encodingFill(k, s, stabMode, warmupK = CONWAY_WARMUP_K) {
  if (stabMode === "none" || (k | 0) === warmupK) return SCALE_UNIFORM;
  return stabilityScale(s);
}

/** Cube fill on the focus slice; 0 if there is no event. */
export function encodingCubeFill(event, stabMode, warmupK = CONWAY_WARMUP_K) {
  if (!event) return 0;
  return encodingFill(event.k, event.s, stabMode, warmupK);
}
