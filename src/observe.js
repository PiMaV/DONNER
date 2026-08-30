/**
 * Isolation pick and on-volume time scrub — view helpers, no Three.js.
 */

import { ISOLATE_FIELD } from "./config.js";

export function cellFromWorldXZ(px, pz, width, height, cellSize) {
  const ox = (width - 1) * 0.5;
  const oz = (height - 1) * 0.5;
  const x = Math.round(px / cellSize + ox);
  const y = Math.round(pz / cellSize + oz);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

export function cellsEqual(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

export function isolationWeight(isolate, x, y) {
  if (!isolate) return 1;
  return isolate.x === x && isolate.y === y ? 1 : ISOLATE_FIELD;
}

/**
 * Map a vertical pointer drag to a new focusBack.
 * Screen up (negative dy) is world +Y: the volume rises, scrub into the past.
 */
export function dragFocusBack(startBack, dyClient, pxPerGen) {
  const scale = pxPerGen > 1e-3 ? pxPerGen : 16;
  return startBack + Math.round(-dyClient / scale);
}

export function screenPxPerWorldY(projectY0, projectY1, canvasHeight) {
  const h = Math.max(1, canvasHeight);
  const s0 = (1 - projectY0) * 0.5 * h;
  const s1 = (1 - projectY1) * 0.5 * h;
  return Math.max(8, Math.abs(s1 - s0));
}
