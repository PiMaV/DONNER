/**
 * Product axes (what the UI labels):
 *   X, Y — playfield / sensor
 *   Z    — time (vertical stack; Now is Z = 0, playhead scrubs along Z)
 *
 * Three.js is Y-up. Engine mapping (do not use in UI copy):
 *   world.x = product X
 *   world.y = product Z  (time)
 *   world.z = product Y
 */

export function productToWorld(px, py, pz) {
  return { x: px, y: pz, z: py };
}

/** World Y for a generation: Now sits at 0, older slices below. */
export function zWorldY(t, tNow, timeScale) {
  return ((t | 0) - (tNow | 0)) * (Number(timeScale) || 1);
}

/** World Y for a Z-rail back index (0 = Now). */
export function zBackWorldY(back, timeScale) {
  const y = -(back | 0) * (Number(timeScale) || 1);
  return y === 0 ? 0 : y;
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

/** Viewcube face lock: one ortho plane. Not inferred from ortho + look. */
export function sliceOnlyFromPlaneLock(planeLock) {
  return Boolean(planeLock);
}

/**
 * True when a 2D cut look has left the slice axis (about 2°).
 * The viewer no longer auto-exits on orbit; keep this for tests and B.
 */
export function planeLockShouldExit(planeLock, cam, target, axis) {
  return Boolean(planeLock) && !lookAlignedWithAxis(cam, target, axis, Math.cos((2 * Math.PI) / 180));
}

/** Inspect display: outer hull, peek (ghost), or three solid cuts. */
export function normalizeShadeMode(mode) {
  const m = String(mode || "hull").toLowerCase();
  return m === "ghost" || m === "triple" ? m : "hull";
}

/** Hull + pointer-down on a handle/plane becomes a temporary ghost peek. */
export function effectiveShade(mode, held = false) {
  const m = normalizeShadeMode(mode);
  if (m === "hull" && held) return "ghost";
  return m;
}

export function inAabb(x, y, t, aabb) {
  if (!aabb) return true;
  const px = Number(x);
  const py = Number(y);
  const pt = Number(t);
  if (aabb.xLo != null && px < aabb.xLo) return false;
  if (aabb.xHi != null && px > aabb.xHi) return false;
  if (aabb.yLo != null && py < aabb.yLo) return false;
  if (aabb.yHi != null && py > aabb.yHi) return false;
  if (aabb.tLo != null && pt < aabb.tLo) return false;
  if (aabb.tHi != null && pt > aabb.tHi) return false;
  return true;
}

export function onAxisPlane(x, y, t, axis, focus) {
  const a = normalizeSliceAxis(axis);
  const value = a === "x" ? x : a === "y" ? y : t;
  return Math.abs(value - focus) < 0.5;
}

export function onAnyPlane(x, y, t, foci) {
  const f = foci || {};
  return (
    onAxisPlane(x, y, t, "x", f.x) ||
    onAxisPlane(x, y, t, "y", f.y) ||
    onAxisPlane(x, y, t, "z", f.z)
  );
}

export function aabbFromSlabs(slabs, width, height, tNow, tOldest = 0) {
  const w = Math.max(0, (width | 0) - 1);
  const h = Math.max(0, (height | 0) - 1);
  const now = tNow | 0;
  const oldest = tOldest | 0;
  const sx = slabs?.x || { near: 0, far: w };
  const sy = slabs?.y || { near: 0, far: h };
  const sz = slabs?.z || { near: 0, far: Math.max(0, now - oldest) };
  const x = slabIndices(sx.near, sx.far, w);
  const y = slabIndices(sy.near, sy.far, h);
  const z = slabGenerations(now, sz.near, sz.far);
  return {
    xLo: x.lo,
    xHi: x.hi,
    yLo: y.lo,
    yHi: y.hi,
    tLo: Math.max(oldest, z.tLo),
    tHi: Math.min(now, z.tHi),
  };
}

export function fociFromSlabs(slabs, width, height, tNow) {
  const w = Math.max(0, (width | 0) - 1);
  const h = Math.max(0, (height | 0) - 1);
  const now = tNow | 0;
  return {
    x: axisIndexFromBack(slabs?.x?.focus ?? 0, w),
    y: axisIndexFromBack(slabs?.y?.focus ?? 0, h),
    z: now - (slabs?.z?.focus | 0),
  };
}

export function shouldEmitVoxel(
  x,
  y,
  t,
  { aabb, foci, shade, activeAxis = "z", isHull = true } = {},
) {
  if (!inAabb(x, y, t, aabb)) return false;
  if (isHull) return true;
  const mode = normalizeShadeMode(shade);
  if (mode === "hull") return false;
  const f = foci || {};
  if (mode === "ghost") {
    const axis = normalizeSliceAxis(activeAxis);
    return onAxisPlane(x, y, t, axis, f[axis]);
  }
  return onAnyPlane(x, y, t, f);
}

export function voxelShadeClass(
  x,
  y,
  t,
  { aabb, foci, activeAxis = "z", shade = "hull", isHull = true } = {},
) {
  if (!inAabb(x, y, t, aabb)) return "skip";
  const mode = normalizeShadeMode(shade);
  const axis = normalizeSliceAxis(activeAxis);
  const f = foci || {};
  const onActive = onAxisPlane(x, y, t, axis, f[axis]);
  const onAny = onAnyPlane(x, y, t, f);
  if (mode === "hull") return isHull ? "solid" : "skip";
  if (mode === "ghost") {
    if (onActive) return "solid";
    if (isHull) return "ghost";
    return "skip";
  }
  if (onAny) return "solid";
  if (isHull) return "ghost";
  return "skip";
}

export function stepFocusBack(focusBack, maxBack, step = -1) {
  const max = Math.max(0, maxBack | 0);
  if (max <= 0) return 0;
  let next = (focusBack | 0) + (step | 0);
  if (next < 0) return max;
  if (next > max) return 0;
  return next;
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
