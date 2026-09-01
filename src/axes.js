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

export function normalizeSliceAxis(axis) {
  const a = String(axis || "z").toLowerCase();
  return a === "x" || a === "y" ? a : "z";
}

/**
 * Camera sit direction for a product-axis view.
 * +Z is top-down (world +Y), +Y is a side (world +Z), +X is a side (world +X).
 */
export function productViewDir(axis, sign) {
  const s = sign < 0 ? -1 : 1;
  const a = normalizeSliceAxis(axis);
  if (a === "x") return { x: s, y: 0, z: 0 };
  if (a === "y") return { x: 0, y: 0, z: s };
  return { x: 0, y: s, z: 0 };
}

/** Stack max (back = 0 is the high end: Now, or max X/Y). */
export function sliceMaxBack(axis, width, height, timeMaxBack) {
  const a = normalizeSliceAxis(axis);
  if (a === "x") return Math.max(0, (width | 0) - 1);
  if (a === "y") return Math.max(0, (height | 0) - 1);
  return Math.max(0, timeMaxBack | 0);
}

/** High end of the rail is back = 0. */
export function axisIndexFromBack(back, maxBack) {
  return Math.max(0, (maxBack | 0) - (back | 0));
}

export function slabIndices(topBack, botBack, maxBack) {
  const hi = axisIndexFromBack(topBack, maxBack);
  const lo = axisIndexFromBack(botBack, maxBack);
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}

/**
 * Solid/ghost policy for the active stack axis.
 * Z (and dense count on X/Y) is one-sided: solid toward the past, ghost
 * toward Now. Sparse Conway/EVT X/Y still fades both ways to the gold grips.
 */
export function sliceViewMode(axis, { sliceOnly = false, sliceStackGhost = false } = {}) {
  const a = normalizeSliceAxis(axis);
  const stackGhost = a === "z" || Boolean(sliceStackGhost);
  const spatialFade = a !== "z" && !sliceOnly && !stackGhost;
  return { stackGhost, spatialFade };
}

/**
 * Whether an event sits on the current slice slab.
 * Time (Z) is already clipped in fillSoA unless sliceOnly.
 * Sparse X/Y gold grips still clip here; proximity fade inside that slab
 * is `sliceDistanceFade` in the renderer (ghost → gone), not this boolean.
 * Dense count X/Y clips in `fillSoA` and uses stack-axis ghost like Z.
 */
export function eventOnSlice(axis, x, y, t, { lo, hi, focus, sliceOnly }) {
  const a = normalizeSliceAxis(axis);
  const value = a === "x" ? x : a === "y" ? y : t;
  if (sliceOnly) return Math.abs(value - focus) < 0.5;
  if (a === "z") return true;
  return value >= lo && value <= hi;
}

export function lookAlignedWithAxis(cam, target, axis, cosMin = Math.cos((15 * Math.PI) / 180)) {
  const dir = productViewDir(axis, 1);
  let dx = target.x - cam.x;
  let dy = target.y - cam.y;
  let dz = target.z - cam.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  dx /= len;
  dy /= len;
  dz /= len;
  const dot = Math.abs(dx * dir.x + dy * dir.y + dz * dir.z);
  return dot >= cosMin;
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
 * Inspect Z slab. `dragged` is which handle moved:
 *   focus — playhead pushes the clips
 *   near / far — that clip pushes the playhead (and the other clip if needed)
 */
export function clampSlab(topBack, focusBack, botBack, maxBack, dragged = "focus") {
  const max = Math.max(0, maxBack | 0);
  const clamp = (v) => Math.min(max, Math.max(0, v | 0));
  let top = clamp(topBack);
  let foc = clamp(focusBack);
  let bot = clamp(botBack);
  if (bot < top) bot = top;
  if (dragged === "near") {
    if (top > foc) foc = top;
    if (foc > bot) bot = foc;
  } else if (dragged === "far") {
    if (bot < foc) foc = bot;
    if (foc < top) top = foc;
  } else {
    if (foc < top) top = foc;
    if (foc > bot) bot = foc;
  }
  return { topBack: top, focusBack: foc, botBack: bot };
}

/** Absolute generations for a slab given Now and back-offsets. */
export function slabGenerations(tNow, topBack, botBack) {
  const now = tNow | 0;
  const hi = now - (topBack | 0);
  const lo = now - (botBack | 0);
  return { tLo: Math.min(lo, hi), tHi: Math.max(lo, hi) };
}

/**
 * Tick marks along the Z stack. One mark per stored step; majors at
 * ends and a coarse stride so a 96-deep window stays readable.
 */
export function stackTickMarks(maxBack) {
  const max = Math.max(0, maxBack | 0);
  if (max === 0) return [{ frac: 0, major: true }];
  if (max > 128) {
    const stride = max > 512 ? 32 : 16;
    const out = [{ frac: 0, major: true }];
    for (let i = stride; i < max; i += stride) {
      out.push({ frac: i / max, major: i % (stride * 4) === 0 });
    }
    out.push({ frac: 1, major: true });
    return out;
  }
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
