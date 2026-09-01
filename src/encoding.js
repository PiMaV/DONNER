/**
 * Encoding adapter: color LUT and fill for packed `k` / `s`.
 * Conway fills still/osc/moving/unsettled/base; a count stack fills integer rungs.
 */

import { COLOR } from "./config.js";
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

/** LUT indexed by integer count `k` (0 unused / base gray). */
export function countKindHex(ceiling) {
  const hi = Math.max(1, ceiling | 0);
  const stops = COUNT_RAMP_HEX;
  const hex = new Array(hi + 1);
  hex[0] = COLOR.base;
  for (let k = 1; k <= hi; k++) {
    const t = hi === 1 ? 1 : (k - 1) / (hi - 1);
    const scaled = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    hex[k] = lerpHex(stops[i], stops[i + 1], scaled - i);
  }
  return hex;
}

export function encodingFill(k, s, stabMode, baseK = CONWAY_BASE_K) {
  if (stabMode === "none" || (k | 0) === baseK) return SCALE_UNIFORM;
  return stabilityScale(s);
}

/** Cube fill on the focus slice; 0 if there is no event. */
export function encodingCubeFill(event, stabMode, baseK = CONWAY_BASE_K) {
  if (!event) return 0;
  return encodingFill(event.k, event.s, stabMode, baseK);
}
