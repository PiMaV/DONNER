/**
 * Encoding adapter: color LUT and fill for packed `k` / `s`.
 * Conway LUT still / osc / moving / unsettled / base; a count stack fills integer rungs.
 * Moving is a LUT index (Color coding off), not a motion gate.
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

/** LUT indexed by integer count `k` (0 unused / base gray). */
export function countKindHex(ceiling, cmap = DEFAULT_COUNT_CMAP) {
  const hi = Math.max(1, ceiling | 0);
  const stops = COUNT_CMAPS[normalizeCountCmap(cmap)].stops;
  const hex = new Array(hi + 1);
  hex[0] = COLOR.base;
  for (let k = 1; k <= hi; k++) {
    const t = hi === 1 ? 1 : (k - 1) / (hi - 1);
    hex[k] = sampleStops(stops, t);
  }
  return hex;
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
