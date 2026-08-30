/**
 * Encoding adapter: color LUT and fill for packed `k` / `s`.
 * Conway fills this slot today; an event source will supply another LUT.
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

export function encodingFill(k, s, stabMode, warmupK = CONWAY_WARMUP_K) {
  if (stabMode === "none" || (k | 0) === warmupK) return SCALE_UNIFORM;
  return stabilityScale(s);
}

/** Cube fill on the focus slice; 0 if there is no event. */
export function encodingCubeFill(event, stabMode, warmupK = CONWAY_WARMUP_K) {
  if (!event) return 0;
  return encodingFill(event.k, event.s, stabMode, warmupK);
}
