/**
 * Product axes (what the UI labels):
 *   X, Y — playfield / sensor
 *   Z    — time (vertical stack; focus plane is Z = 0)
 *
 * Three.js is Y-up. Engine mapping (do not use in UI copy):
 *   world.x = product X
 *   world.y = product Z  (time)
 *   world.z = product Y
 */

export function productToWorld(px, py, pz) {
  return { x: px, y: pz, z: py };
}

export function worldToProduct(wx, wy, wz) {
  return { x: wx, y: wz, z: wy };
}

/** Tick indices along a grid axis of length `n` (inclusive 0 .. n-1). */
export function spatialTicks(n) {
  const last = Math.max(0, n - 1);
  if (last <= 8) return uniqueSorted([0, last]);
  const step = last > 48 ? 16 : last > 24 ? 8 : 4;
  const out = [0];
  for (let i = step; i < last; i += step) out.push(i);
  out.push(last);
  return uniqueSorted(out);
}

/**
 * Relative Z ticks (generations from the focus plane).
 * relMin ≤ 0 ≤ relMax. Label 0 with the absolute generation separately.
 */
export function relativeTimeTicks(relMin, relMax) {
  const lo = Math.min(0, relMin | 0);
  const hi = Math.max(0, relMax | 0);
  const ticks = [lo, 0, hi];
  const span = Math.max(1, hi - lo);
  const step = span > 48 ? 16 : span > 24 ? 8 : 4;
  const start = Math.ceil(lo / step) * step;
  for (let r = start; r <= hi; r += step) ticks.push(r);
  return uniqueSorted(ticks);
}

export function formatZTick(rel, tFocus) {
  if (rel === 0) return `0 · ${tFocus}`;
  return rel > 0 ? `+${rel}` : `−${Math.abs(rel)}`;
}

export function visibleTimeRange(tNow, tFocus, history) {
  const hist = Math.max(1, history | 0);
  const now = tNow | 0;
  const foc = tFocus | 0;
  const tMin = Math.max(0, now - hist + 1);
  return {
    relMin: tMin - foc,
    relMax: now - foc,
  };
}

/** 0 = Now (top of the Z stack), 1 = deepest stored past (bottom). */
export function stackThumbFrac(back, maxBack) {
  const max = Math.max(0, maxBack | 0);
  if (max === 0) return 0;
  return Math.min(1, Math.max(0, (back | 0) / max));
}

/**
 * Tick marks along the Z stack. One mark per stored step; majors at
 * ends and a coarse stride so a 96-deep window stays readable.
 */
export function stackTickMarks(maxBack) {
  const max = Math.max(0, maxBack | 0);
  if (max === 0) return [{ frac: 0, major: true }];
  const stride = max > 48 ? 8 : max > 24 ? 4 : 1;
  const out = [];
  for (let i = 0; i <= max; i++) {
    const major = i === max || i % stride === 0;
    out.push({ frac: i / max, major });
  }
  return out;
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a - b);
}
