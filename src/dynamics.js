/**
 * Worldline occupancy class for a live cell at generation t.
 *
 * Time stays on Z; color encodes still / oscillator / unsettled / base.
 * Oscillation is occupancy along Z (cubes appear / vanish), not extra
 * hues. Translating ships (gliders) read as still/osc on the cells they
 * cross — occupancy only, no motion gate.
 *
 * Conway-only. Event-camera color is a later adapter; do not assume this
 * legend for polarity streams.
 *
 * Gray **base**: generations 0 .. CLASSIFY_AFTER-1, and the first live cube
 * of each (x, y) worldline.
 * KIND_MOVING remains a LUT index (Color coding off copies this class).
 */

export const KIND_STILL = 0;
export const KIND_OSC = 1;
export const KIND_MOVING = 2;
export const KIND_BASE = 3;
export const KIND_UNSETTLED = 4;
/** @deprecated Use KIND_BASE. */
export const KIND_WARMUP = KIND_BASE;

/** Generations 0 .. CLASSIFY_AFTER-1 are unclassified (base gray). */
export const CLASSIFY_AFTER = 2;

/** Occupancy oscillator and board-ash cycle cap (pulsar / pentadecathlon). */
export const MAX_OSC_PERIOD = 15;

/** Consecutive still/osc gens mapped to cube fill; moving/unsettled stay at Start. */
export const MAX_STAB_GENS = 16;
/** Tape stamp cap so the Tail slider can stretch past the default 16. */
export const STAB_TAIL_MAX = 64;
export const STAB_TAIL_MIN = 2;
/** Occupancy fill. 1 packs faces at View Gap 0; open seams with Gap. */
export const SCALE_UNIFORM = 1;
export const SCALE_OPEN = 0.52;
export const SCALE_STAB_MIN = 0.5;
export const SCALE_STAB_MAX = 1;
export const STAB_START_MIN = 0.02;
export const STAB_START_MAX = 1;
export const STAB_START_STEP = 0.02;

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
 * Too little history returns 0 (unsettled), not base.
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

/** True when this live cell is the first cube on its (x, y) worldline. */
export function isWorldlineOrigin(t, packed, isLive) {
  const tt = t | 0;
  if (tt <= 0) return true;
  for (let g = 0; g < tt; g++) {
    if (isLive(g, packed)) return false;
  }
  return true;
}

export function kindAt(t, packed, isLive) {
  if (t < CLASSIFY_AFTER || isWorldlineOrigin(t, packed, isLive)) return KIND_BASE;
  if (isLive(t - 1, packed)) return KIND_STILL;
  if (occupancyPeriod(t, packed, isLive) >= 2) return KIND_OSC;
  return KIND_UNSETTLED;
}

/** Run length of the same still/osc class ending at `t`. 0 if dead or open. */
export function stabilityAge(t, packed, isLive, cap = STAB_TAIL_MAX) {
  if (!isLive(t, packed)) return 0;
  const k0 = kindAt(t, packed, isLive);
  if (k0 === KIND_MOVING || k0 === KIND_UNSETTLED || k0 === KIND_BASE) return 0;
  let n = 1;
  while (n < cap) {
    const tp = t - n;
    if (!isLive(tp, packed)) break;
    if (kindAt(tp, packed, isLive) !== k0) break;
    n += 1;
  }
  return n;
}

export function stabilityScale(
  stab,
  cap = MAX_STAB_GENS,
  minFill = SCALE_STAB_MIN,
  maxFill = SCALE_STAB_MAX,
) {
  const lo = Math.min(STAB_START_MAX, Math.max(STAB_START_MIN, Number(minFill) || 0));
  const hi = Math.min(1, Math.max(lo, Number(maxFill) || 1));
  const c = Math.max(1, cap | 0);
  if (stab <= 0) return lo;
  const u = Math.min(stab, c) / c;
  return lo + (hi - lo) * u;
}

/** Cube fill on the focus slice; 0 if there is no event. */
export function cubeFill(event, stabMode, opts = {}) {
  if (!event) return 0;
  if (stabMode === "none" || (event.k | 0) === KIND_BASE) return SCALE_UNIFORM;
  return stabilityScale(event.s, opts.cap, opts.start, opts.max);
}
