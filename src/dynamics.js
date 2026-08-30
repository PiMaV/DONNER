/**
 * Worldline dynamics class for a live cell at generation t.
 *
 * Time stays on the Y axis; color encodes still / oscillator / transit.
 * Oscillation is occupancy along Y (cubes appear / vanish), not extra hues.
 *
 * Occupancy alone is not enough: a glider crawls over the same cell for
 * several gens, which looks like still/osc on that pixel. Still and osc
 * require the neighborhood centroid to stay put (net shift over two
 * gens below MOTION_THRESH). Translating activity is always transit —
 * that trail is the space-time curve.
 *
 * Conway-only. Event-camera color is a later adapter; do not assume this
 * legend for polarity streams.
 *
 * Generations 0 .. CLASSIFY_AFTER-1 are warmup (too little past).
 */

export const KIND_STILL = 0;
export const KIND_OSC = 1;
export const KIND_TRANSIT = 2;
export const KIND_WARMUP = 3;

/** Generations 0 .. CLASSIFY_AFTER-1 are unclassified. */
export const CLASSIFY_AFTER = 2;

/** 5×5 window; net centroid shift over two gens above this → transit. */
export const MOTION_RADIUS = 2;
export const MOTION_THRESH = 0.3;

/** Consecutive still/osc gens mapped to cube fill; transit stays small. */
export const MAX_STAB_GENS = 16;
export const SCALE_UNIFORM = 0.86;
export const SCALE_TRANSIT = 0.52;
export const SCALE_STAB_MIN = 0.5;
export const SCALE_STAB_MAX = 0.94;

export function classifyWorldline(alive1, alive2, alive3) {
  if (alive1 && alive2) return KIND_STILL;
  if (!alive1 && alive2) return KIND_OSC;
  if (!alive1 && !alive2 && alive3) return KIND_OSC;
  return KIND_TRANSIT;
}

function wrapIndex(i, n) {
  return ((i % n) + n) % n;
}

function minImage(d, n) {
  const half = n * 0.5;
  if (d > half) return d - n;
  if (d < -half) return d + n;
  return d;
}

function neighborhoodCentroid(t, cx, cy, isLive, bounds) {
  const { width, height, wrap } = bounds;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let dy = -MOTION_RADIUS; dy <= MOTION_RADIUS; dy++) {
    for (let dx = -MOTION_RADIUS; dx <= MOTION_RADIUS; dx++) {
      let x = cx + dx;
      let y = cy + dy;
      if (wrap) {
        x = wrapIndex(x, width);
        y = wrapIndex(y, height);
      } else if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }
      if (!isLive(t, y * width + x)) continue;
      sx += wrap ? minImage(x - cx, width) : dx;
      sy += wrap ? minImage(y - cy, height) : dy;
      n += 1;
    }
  }
  if (n === 0) return null;
  return [sx / n, sy / n];
}

/** True when live activity around this cell translated (spaceship, debris). */
export function neighborhoodTranslated(t, packed, isLive, bounds) {
  if (!bounds || t < CLASSIFY_AFTER) return false;
  const cx = packed % bounds.width;
  const cy = (packed / bounds.width) | 0;
  const now = neighborhoodCentroid(t, cx, cy, isLive, bounds);
  const then = neighborhoodCentroid(t - 2, cx, cy, isLive, bounds);
  if (!now || !then) return true;
  const dx = now[0] - then[0];
  const dy = now[1] - then[1];
  return Math.hypot(dx, dy) > MOTION_THRESH;
}

export function kindAt(t, packed, isLive, bounds) {
  if (t < CLASSIFY_AFTER) return KIND_WARMUP;
  if (neighborhoodTranslated(t, packed, isLive, bounds)) return KIND_TRANSIT;
  return classifyWorldline(
    isLive(t - 1, packed),
    isLive(t - 2, packed),
    isLive(t - 3, packed),
  );
}

/** Run length of the same non-transit class ending at `t`. 0 if dead or transit. */
export function stabilityAge(t, packed, isLive, cap = MAX_STAB_GENS, bounds) {
  if (!isLive(t, packed)) return 0;
  const k0 = kindAt(t, packed, isLive, bounds);
  if (k0 === KIND_TRANSIT || k0 === KIND_WARMUP) return 0;
  let n = 1;
  while (n < cap) {
    const tp = t - n;
    if (!isLive(tp, packed)) break;
    if (kindAt(tp, packed, isLive, bounds) !== k0) break;
    n += 1;
  }
  return n;
}

export function stabilityScale(stab, cap = MAX_STAB_GENS) {
  if (stab <= 0) return SCALE_TRANSIT;
  const u = Math.min(stab, cap) / cap;
  return SCALE_STAB_MIN + (SCALE_STAB_MAX - SCALE_STAB_MIN) * u;
}
