/**
 * Worldline dynamics class for a live cell at generation t.
 *
 * Time stays on Z; color encodes still / oscillator / moving / unsettled /
 * warmup. Oscillation is occupancy along Z (cubes appear / vanish), not extra
 * hues.
 *
 * Occupancy alone is not enough: a glider crawls over the same cell for
 * several gens, which looks like still/osc on that pixel. Still and osc
 * require a neighborhood centroid to stay put (net shift over two
 * gens below MOTION_THRESH). Default is occupancy only (radius 0).
 * 3×3 or 5×5 is a special case so gliders become moving tubes.
 *
 * Conway-only. Event-camera color is a later adapter; do not assume this
 * legend for polarity streams.
 *
 * Generations 0 .. CLASSIFY_AFTER-1 are warmup (too little past).
 */

export const KIND_STILL = 0;
export const KIND_OSC = 1;
export const KIND_MOVING = 2;
export const KIND_WARMUP = 3;
export const KIND_UNSETTLED = 4;

/** Generations 0 .. CLASSIFY_AFTER-1 are unclassified. */
export const CLASSIFY_AFTER = 2;

/** Occupancy oscillator and board-ash cycle cap (pulsar / pentadecathlon). */
export const MAX_OSC_PERIOD = 15;

/** Max motion window (5×5). 0 = occupancy only; 1 = 3×3; 2 = 5×5. */
export const MOTION_RADIUS = 2;
export const MOTION_THRESH = 0.3;

/** Consecutive still/osc gens mapped to cube fill; moving/unsettled stay small. */
export const MAX_STAB_GENS = 16;
export const SCALE_UNIFORM = 0.86;
export const SCALE_OPEN = 0.52;
export const SCALE_STAB_MIN = 0.5;
export const SCALE_STAB_MAX = 0.94;

export function classifyWorldline(alive1, alive2, alive3) {
  if (alive1 && alive2) return KIND_STILL;
  if (!alive1 && alive2) return KIND_OSC;
  if (!alive1 && !alive2 && alive3) return KIND_OSC;
  return KIND_UNSETTLED;
}

/**
 * Smallest occupancy period p in 2..maxP for a live cell at t.
 * Period 1 (always on) is Still — not returned here.
 * p=2 uses the short teaching window (from gen 2). p>=3 needs 2p samples.
 * Too little history returns 0 (unsettled), not warmup.
 */
export function occupancyPeriod(t, packed, isLive, maxP = MAX_OSC_PERIOD) {
  const live = (g) => !!isLive(g, packed);
  if (t >= CLASSIFY_AFTER && !live(t - 1) && live(t - 2)) return 2;
  const lim = Math.min(maxP | 0, t);
  for (let p = 3; p <= lim; p++) {
    if (t < 2 * p - 1) continue;
    let ok = true;
    let anyOff = false;
    for (let k = 0; k < p; k++) {
      const a = live(t - k);
      const b = live(t - k - p);
      if (a !== b) {
        ok = false;
        break;
      }
      if (!a) anyOff = true;
    }
    if (ok && anyOff) return p;
  }
  return 0;
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

function neighborhoodCentroid(t, cx, cy, isLive, bounds, radius) {
  const { width, height, wrap } = bounds;
  const r = radius | 0;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
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

/**
 * Motion-window radius from fill/bench opts. Default 0 (occupancy only).
 * `neighborhood: false` keeps older tests; `true` means 5×5.
 */
export function kindOptsRadius(opts = {}) {
  if (opts.neighborhoodRadius != null) return Math.max(0, opts.neighborhoodRadius | 0);
  if (opts.neighborhood === false) return 0;
  if (opts.neighborhood === true) return MOTION_RADIUS;
  return 0;
}

/** True when live activity around this cell translated (spaceship, debris). */
export function neighborhoodTranslated(t, packed, isLive, bounds, radius = MOTION_RADIUS) {
  if (!bounds || t < CLASSIFY_AFTER || radius < 1) return false;
  const cx = packed % bounds.width;
  const cy = (packed / bounds.width) | 0;
  const now = neighborhoodCentroid(t, cx, cy, isLive, bounds, radius);
  const then = neighborhoodCentroid(t - 2, cx, cy, isLive, bounds, radius);
  if (!now || !then) return true;
  const dx = now[0] - then[0];
  const dy = now[1] - then[1];
  return Math.hypot(dx, dy) > MOTION_THRESH;
}

/**
 * @param {{ neighborhood?: boolean, neighborhoodRadius?: number }} [opts]
 */
export function kindAt(t, packed, isLive, bounds, opts = {}) {
  if (t < CLASSIFY_AFTER) return KIND_WARMUP;
  const radius = kindOptsRadius(opts);
  if (radius > 0 && neighborhoodTranslated(t, packed, isLive, bounds, radius)) {
    return KIND_MOVING;
  }
  if (isLive(t - 1, packed)) return KIND_STILL;
  if (occupancyPeriod(t, packed, isLive) >= 2) return KIND_OSC;
  return KIND_UNSETTLED;
}

/** Run length of the same still/osc class ending at `t`. 0 if dead or open. */
export function stabilityAge(t, packed, isLive, cap = MAX_STAB_GENS, bounds, kindOpts = {}) {
  if (!isLive(t, packed)) return 0;
  const k0 = kindAt(t, packed, isLive, bounds, kindOpts);
  if (k0 === KIND_MOVING || k0 === KIND_UNSETTLED || k0 === KIND_WARMUP) return 0;
  let n = 1;
  while (n < cap) {
    const tp = t - n;
    if (!isLive(tp, packed)) break;
    if (kindAt(tp, packed, isLive, bounds, kindOpts) !== k0) break;
    n += 1;
  }
  return n;
}

export function stabilityScale(stab, cap = MAX_STAB_GENS) {
  if (stab <= 0) return SCALE_OPEN;
  const u = Math.min(stab, cap) / cap;
  return SCALE_STAB_MIN + (SCALE_STAB_MAX - SCALE_STAB_MIN) * u;
}

/** Cube fill on the focus slice; 0 if there is no event. */
export function cubeFill(event, stabMode) {
  if (!event) return 0;
  if (stabMode === "none" || (event.k | 0) === KIND_WARMUP) return SCALE_UNIFORM;
  return stabilityScale(event.s);
}
