/**
 * Orbit around the volume: product Z (engine Y) through the playfield
 * origin. World Y is anchored at Now, not the playhead. Fit sets the
 * orbit height; Align to Z pins XY to that origin and still allows pan along Z.
 */

import { voxelPitch, zWorldY } from "./axes.js";

export function slabYRange(tNow, tLo, tHi, timeScale) {
  const a = zWorldY(tLo, tNow, timeScale);
  const b = zWorldY(tHi, tNow, timeScale);
  const yMin = Math.min(a, b);
  const yMax = Math.max(a, b);
  return { yMin, yMax, yMid: (yMin + yMax) / 2 };
}

export function playfieldHalfExtent(width, height, cellSize) {
  const cs = Number(cellSize) || 1;
  return {
    hx: Math.max(0.5, (width * cs) / 2),
    hz: Math.max(0.5, (height * cs) / 2),
  };
}

export function volumeRadius(hx, hz, yMin, yMax) {
  const hy = Math.max(0.5, (yMax - yMin) / 2);
  return Math.hypot(Math.max(0.5, hx), hy, Math.max(0.5, hz));
}

/** Ortho half-height that fits a rectangle of `width` × `height` in the view. */
export function orthoFitHalfHeight(width, height, aspect, pad = 1.12) {
  const w = Math.max(0.5, Number(width) || 0.5);
  const h = Math.max(0.5, Number(height) || 0.5);
  const a = Math.max(0.2, Number(aspect) || 1);
  const p = Number(pad) || 1.12;
  return Math.max(h / 2, w / (2 * a)) * p;
}

export function fitOrbitDistance(fovDeg, radius, pad = 1.28) {
  const vFov = (Number(fovDeg) * Math.PI) / 180;
  const s = Math.sin(vFov / 2);
  const r = Math.max(1, Number(radius) || 1);
  const p = Number(pad) || 1.28;
  if (s < 1e-6) return r * p * 3;
  return (r * p) / s;
}

/**
 * Dolly-out / far plane / ortho min-zoom sized for `gapMax`, not the
 * current Gap. Opening the slider must still leave room to frame the brick.
 */
export function gapLimitOrbitRange({
  width,
  height,
  aabb,
  tNow,
  cellSize = 1,
  timeScale = 1,
  gapMax = 0,
  fovDeg = 50,
} = {}) {
  const pitch = voxelPitch(cellSize, gapMax);
  const timePitch = voxelPitch(timeScale, gapMax);
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const box = aabb || {};
  const xLo = box.xLo == null ? 0 : box.xLo | 0;
  const xHi = box.xHi == null ? w - 1 : box.xHi | 0;
  const yLo = box.yLo == null ? 0 : box.yLo | 0;
  const yHi = box.yHi == null ? h - 1 : box.yHi | 0;
  const ox = (w - 1) * 0.5;
  const oz = (h - 1) * 0.5;
  const hx = Math.max(Math.abs(xLo - ox), Math.abs(xHi - ox)) * pitch;
  const hz = Math.max(Math.abs(yLo - oz), Math.abs(yHi - oz)) * pitch;
  const span = slabYRange(tNow, box.tLo, box.tHi, timePitch);
  const radius = volumeRadius(hx, hz, span.yMin, span.yMax);
  const dist = fitOrbitDistance(fovDeg, radius, 1.28);
  const maxDistance = Math.max(220, dist * 1.4);
  return {
    radius,
    maxDistance,
    far: Math.max(400, maxDistance * 2.4, dist + radius * 3),
    minZoom: Math.min(0.35, 1 / ((1 + Math.max(0, Number(gapMax) || 0)) * 1.2)),
  };
}

/**
 * No-op view offset. Kept exported so a cached main.js that still
 * imports this name does not fail to boot on the phone.
 */
export function phoneOrbitViewOffset(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  return {
    fullWidth: w,
    fullHeight: h,
    offsetX: 0,
    offsetY: 0,
    width: w,
    height: h,
  };
}

export function frustumFromDistance(distance, fovDeg) {
  const vFov = ((Number(fovDeg) || 50) * Math.PI) / 180;
  const d = Math.max(1, Number(distance) || 1);
  return Math.max(0.5, d * Math.tan(vFov / 2));
}

/**
 * Move camera with the orbit target so the look stays put while the
 * pivot jumps to `(0, yMid, 0)` (time axis through the brick center).
 * Fit uses this once; the animation loop does not.
 */
export function pinOrbitToAxis(cam, target, yMid) {
  const dy = yMid - target.y;
  const dx = -target.x;
  const dz = -target.z;
  return {
    cam: { x: cam.x + dx, y: cam.y + dy, z: cam.z + dz },
    target: { x: 0, y: yMid, z: 0 },
  };
}

/** Align to Z: lock orbit to the time axis without changing target.y. */
export function pinOrbitToOriginXY(cam, target) {
  const dx = -target.x;
  const dz = -target.z;
  return {
    cam: { x: cam.x + dx, y: cam.y, z: cam.z + dz },
    target: { x: 0, y: target.y, z: 0 },
  };
}

/** Keep the time-axis height centered without resetting XY pan. */
export function pinOrbitHeight(cam, target, yMid) {
  const dy = yMid - target.y;
  return {
    cam: { x: cam.x, y: cam.y + dy, z: cam.z },
    target: { x: target.x, y: yMid, z: target.z },
  };
}

/** Camera at `distance` along the current offset from the target. */
export function placeOnViewRay(cam, target, distance) {
  let dx = cam.x - target.x;
  let dy = cam.y - target.y;
  let dz = cam.z - target.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    dx = 0.55;
    dy = 0.4;
    dz = 0.7;
  } else {
    dx /= len;
    dy /= len;
    dz /= len;
  }
  const d = Math.max(1, Number(distance) || 1);
  return {
    x: target.x + dx * d,
    y: target.y + dy * d,
    z: target.z + dz * d,
  };
}

/** Place the camera on a product-axis view, keeping `distance` to `target`. */
export function snapPose(target, dir, distance, nudge = 0.05) {
  const d = Math.max(1, Number(distance) || 1);
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const nx = dir.x / len;
  const ny = dir.y / len;
  const nz = dir.z / len;
  const pos = {
    x: target.x + nx * d,
    y: target.y + ny * d,
    z: target.z + nz * d,
  };
  if (Math.abs(ny) > 0.92) pos.z += ny >= 0 ? nudge : -nudge;
  return pos;
}

export function offsetLength(cam, target) {
  return Math.hypot(cam.x - target.x, cam.y - target.y, cam.z - target.z);
}
