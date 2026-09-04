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

/**
 * Lattice pitch for instance centers. Cube edge stays `cellSize`;
 * `voxelGap` 0 packs faces. Same pitch is used for X, Y, and time.
 */
export function voxelPitch(cellSize = 1, voxelGap = 0) {
  const cs = Number(cellSize);
  const cell = Number.isFinite(cs) && cs > 0 ? cs : 1;
  const g = Number(voxelGap);
  const gap = Number.isFinite(g) && g > 0 ? g : 0;
  return cell * (1 + gap);
}

/**
 * Turntable-local center of voxel `(x, y, t)`. Product Y maps to world Z.
 * Tests and picking use this; the instance hot path inlines the same math.
 */
export function voxelLocalCenter(x, y, t, width, height, cellSize, tNow, timeScale, voxelGap = 0) {
  const pitch = voxelPitch(cellSize, voxelGap);
  const ox = ((width | 0) - 1) * 0.5;
  const oz = ((height | 0) - 1) * 0.5;
  return {
    x: (x - ox) * pitch,
    y: zWorldY(t, tNow, voxelPitch(timeScale, voxelGap)),
    z: (y - oz) * pitch,
  };
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

/**
 * Same viewcube face again pages the cut (Shift+wheel). A new face enters.
 * Does not reset zoom/pan on the face you are already looking at.
 */
export function lockedFaceAction(planeLock, lockAxis, lockSign, hitAxis, hitSign) {
  if (!planeLock) return "enter";
  const a = normalizeSliceAxis(lockAxis);
  const b = normalizeSliceAxis(hitAxis);
  const s = lockSign >= 0 ? 1 : -1;
  const h = hitSign >= 0 ? 1 : -1;
  if (a === b && s === h) return "page";
  return "enter";
}

/** Page into the volume from the face you clicked. */
export function lockedFacePageStep(sign) {
  return sign >= 0 ? 1 : -1;
}

/** Inspect display: outer hull, ghost brick, three cuts, or one slice. */
export function normalizeShadeMode(mode) {
  const m = String(mode || "hull").toLowerCase();
  return m === "ghost" || m === "triple" || m === "slice" ? m : "hull";
}

/** Hull + pointer-down on a handle/plane becomes a temporary ghost peek. */
export function effectiveShade(mode, held = false) {
  const m = normalizeShadeMode(mode);
  if (m === "hull" && held) return "ghost";
  return m;
}

/**
 * HUD shade stays Hull / Ghost / Cuts. Peek stays Ghost.
 * A viewcube cut does not remap Hull to slice; fill/upload treat the cut
 * separately (glass hull + solid plane, potato AABB while looping).
 */
export function cutInspectShade(mode, { held = false, planeLock: _planeLock = false } = {}) {
  return effectiveShade(mode, held);
}

/**
 * Shade is source-agnostic. Dense MRI uses the same Ghost hull + solid
 * plane as sparse Ignition. Kept so older tests/callers still import it.
 */
export function denseGhostToSlice(mode, _dense = false) {
  return normalizeShadeMode(mode);
}

/** Mid-volume playhead (same index as Reset Planes). */
export function playheadMidBack(maxBack) {
  return Math.max(0, maxBack | 0) >> 1;
}

/** True when a playhead step crosses or lands on mid-volume. */
export function playheadCrossesMid(from, to, maxBack) {
  const max = Math.max(0, maxBack | 0);
  if (max < 2) return false;
  const mid = playheadMidBack(max);
  const a = from | 0;
  const b = to | 0;
  if (b === mid) return true;
  return (a < mid && b > mid) || (a > mid && b < mid);
}

/**
 * Keep the AABB from the axis origin through `focus` (inclusive).
 * Hull+Loop uses this so the potato grows and the +side stays hidden.
 */
export function aabbKeepUpToFocus(aabb, axis, focus) {
  if (!aabb) return null;
  const a = normalizeSliceAxis(axis);
  const f = focus | 0;
  const box = {
    xLo: aabb.xLo | 0,
    xHi: aabb.xHi | 0,
    yLo: aabb.yLo | 0,
    yHi: aabb.yHi | 0,
    tLo: aabb.tLo | 0,
    tHi: aabb.tHi | 0,
  };
  if (a === "x") box.xHi = Math.min(box.xHi, Math.max(box.xLo, f));
  else if (a === "y") box.yHi = Math.min(box.yHi, Math.max(box.yLo, f));
  else box.tHi = Math.min(box.tHi, Math.max(box.tLo, f));
  return box;
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

/** Rail back index for a voxel on the standing / active axis. */
export function focusBackFromVoxel(axis, x, y, t, width, height, tNow) {
  const a = normalizeSliceAxis(axis);
  if (a === "x") return Math.max(0, (width | 0) - 1 - (x | 0));
  if (a === "y") return Math.max(0, (height | 0) - 1 - (y | 0));
  return Math.max(0, (tNow | 0) - (t | 0));
}

/**
 * Inverse of the engine mapping: turntable-local axis coord → rail back.
 * X is world X, Y is world Z, Z/time is world Y.
 */
export function backFromWorldCoord(axis, coord, width, height, cellSize, timeScale) {
  const a = normalizeSliceAxis(axis);
  const c = Number(coord);
  if (!Number.isFinite(c)) return 0;
  if (a === "z") {
    const ts = Number(timeScale);
    const scale = Number.isFinite(ts) && ts > 0 ? ts : 1;
    return Math.max(0, Math.round(-c / scale));
  }
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  const max = a === "x" ? Math.max(0, (width | 0) - 1) : Math.max(0, (height | 0) - 1);
  const idx = Math.round(c / size + max * 0.5);
  const clamped = Math.min(max, Math.max(0, idx));
  return Math.max(0, max - clamped);
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

/** Compact AABB id for occupancy / plane-cache keys. */
export function aabbOccupancyKey(aabb) {
  return aabb
    ? `${aabb.xLo | 0}:${aabb.xHi | 0}:${aabb.yLo | 0}:${aabb.yHi | 0}:${aabb.tLo | 0}:${aabb.tHi | 0}`
    : "live";
}

/**
 * Combined occupancy key (tests / live span). Ghost still includes the
 * solid plane. Prefer `inspectHullOccupancyKey` + `inspectPlaneOccupancyKey`
 * on the inspect hot path so the glass hull is not rebuilt on scrub.
 */
export function inspectRebuildKey({
  shade,
  aabb,
  foci,
  activeAxis = "z",
} = {}) {
  const mode = normalizeShadeMode(shade);
  const box = aabbOccupancyKey(aabb);
  if (mode === "hull") return `${box}:hull`;
  const f = foci || {};
  if (mode === "ghost" || mode === "slice") {
    const axis = normalizeSliceAxis(activeAxis);
    return `${box}:${mode}:${axis}:${f[axis] | 0}`;
  }
  return `${box}:triple:${f.x | 0}:${f.y | 0}:${f.z | 0}`;
}

/**
 * Hull instance list. Playhead does not belong here. `glass` vs `solid`
 * is which InstancedMesh the hull is uploaded to (Ghost vs Hull).
 * Cuts / slice have no hull mesh. A viewcube cut still has a glass hull
 * (full brick in Ghost, potato AABB in Hull+Loop).
 */
export function inspectHullOccupancyKey({
  shade,
  aabb,
  sliceOnly = false,
} = {}) {
  const mode = normalizeShadeMode(shade);
  const box = aabbOccupancyKey(aabb);
  if (mode === "slice" || mode === "triple") return `${box}:hull:none`;
  if (sliceOnly) return `${box}:hull:glass`;
  return `${box}:hull:${mode === "ghost" ? "glass" : "solid"}`;
}

/**
 * Solid cut plane(s). Ghost / Slice follow the highlighted playhead;
 * Cuts follows all three (one axis in a viewcube cut). Hull idle in 3D
 * has no plane mesh; Hull in a cut follows the playhead like slice.
 */
export function inspectPlaneOccupancyKey({
  shade,
  aabb,
  foci,
  activeAxis = "z",
  sliceOnly = false,
} = {}) {
  const mode = normalizeShadeMode(shade);
  const box = aabbOccupancyKey(aabb);
  if (mode === "hull" && !sliceOnly) return `${box}:plane:none`;
  const f = foci || {};
  if (mode === "hull" || mode === "ghost" || mode === "slice") {
    const axis = normalizeSliceAxis(activeAxis);
    const planeMode = mode === "hull" ? "slice" : mode;
    return `${box}:plane:${planeMode}:${axis}:${f[axis] | 0}`;
  }
  if (sliceOnly) {
    const axis = normalizeSliceAxis(activeAxis);
    return `${box}:plane:triple:${axis}:${f[axis] | 0}`;
  }
  return `${box}:plane:triple:${f.x | 0}:${f.y | 0}:${f.z | 0}`;
}

export function shouldEmitVoxel(
  x,
  y,
  t,
  { aabb, foci, shade, activeAxis = "z", isHull = true } = {},
) {
  if (!inAabb(x, y, t, aabb)) return false;
  const mode = normalizeShadeMode(shade);
  const f = foci || {};
  if (mode === "hull") return Boolean(isHull);
  if (mode === "ghost") {
    if (isHull) return true;
    const axis = normalizeSliceAxis(activeAxis);
    return onAxisPlane(x, y, t, axis, f[axis]);
  }
  if (mode === "slice") {
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
  if (mode === "slice") return onActive ? "solid" : "skip";
  if (onAny) return "solid";
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

/** Wrap the playhead inside the inspect clip window (does not move clips). */
export function stepFocusBackClipped(focusBack, near, far, step = -1) {
  const lo = Math.min(near | 0, far | 0);
  const hi = Math.max(near | 0, far | 0);
  if (hi <= lo) return lo;
  const cur = Math.min(hi, Math.max(lo, focusBack | 0));
  return lo + stepFocusBack(cur - lo, hi - lo, step);
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

/** Open all three clip windows to the brick; keep each playhead. */
export function resetSlabClips(slabs, xMax, yMax, zMax) {
  const axis = (s, max) => {
    const m = Math.max(0, max | 0);
    const cur = s || { near: 0, focus: 0, far: m };
    const c = clampSlab(0, cur.focus, m, m, "near");
    return { near: c.topBack, focus: c.focusBack, far: c.botBack };
  };
  return {
    x: axis(slabs?.x, xMax),
    y: axis(slabs?.y, yMax),
    z: axis(slabs?.z, zMax),
  };
}

/** Open clips to the brick and put each playhead at mid-volume. */
export function resetPlanes(xMax, yMax, zMax) {
  const axis = (max) => {
    const m = Math.max(0, max | 0);
    return { near: 0, focus: m >> 1, far: m };
  };
  return {
    x: axis(xMax),
    y: axis(yMax),
    z: axis(zMax),
  };
}

/**
 * Default Inspect pose for a loaded volume: full clips, playheads at
 * mid-volume. Same numbers as Reset Planes. A 1-voxel-thick axis
 * (`max === 0`) still sits on both clips — that is expected.
 */
export function defaultInspectSlabs(width, height, tNewest, tOldest = 0) {
  return resetPlanes(
    Math.max(0, (width | 0) - 1),
    Math.max(0, (height | 0) - 1),
    Math.max(0, (tNewest | 0) - (tOldest | 0)),
  );
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
  if (max === 0) return [{ frac: 0, major: true, mid: true }];
  const mid = playheadMidBack(max);
  const markMid = (out) => {
    const frac = max === 0 ? 0 : mid / max;
    const hit = out.find((m) => Math.abs(m.frac - frac) < 1e-6);
    if (hit) hit.mid = true;
    else out.push({ frac, major: true, mid: true });
    out.sort((a, b) => a.frac - b.frac);
    return out;
  };
  if (max > 128) {
    const stride = max > 512 ? 32 : 16;
    const out = [{ frac: 0, major: true }];
    for (let i = stride; i < max; i += stride) {
      out.push({ frac: i / max, major: i % (stride * 4) === 0 });
    }
    out.push({ frac: 1, major: true });
    return markMid(out);
  }
  const stride = max > 48 ? 8 : max > 24 ? 4 : 1;
  const out = [];
  for (let i = 0; i <= max; i++) {
    const major = i === max || i % stride === 0;
    out.push({ frac: i / max, major });
  }
  return markMid(out);
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a - b);
}
