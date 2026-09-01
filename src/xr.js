/**
 * XR-A session helpers. Pose and scale are plain math so Node tests
 * do not need a WebXR device.
 */

import { productViewDir, normalizeSliceAxis } from "./axes.js";

export const XR_MODE = "immersive-ar";
export const XR_BOARD_CELLS = 32;
export const XR_BOARD_METERS = 0.4;
export const XR_VIEWER_DISTANCE_M = 0.8;
export const XR_HIT_TEST = "hit-test";
export const XR_MAG_MIN = 0.4;
export const XR_MAG_MAX = 2.5;
export const XR_MAG_DEFAULT = 1;

export function clampArMag(mag) {
  const m = Number(mag);
  if (!Number.isFinite(m) || m <= 0) return XR_MAG_DEFAULT;
  return Math.min(XR_MAG_MAX, Math.max(XR_MAG_MIN, m));
}

/** Scale so 32 cells of `cellSize` span 40 cm × `mag` in WebXR meters. */
export function xrStageScale(cellSize = 1, mag = XR_MAG_DEFAULT) {
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  return (XR_BOARD_METERS / (XR_BOARD_CELLS * size)) * clampArMag(mag);
}

/** World meters along the table normal so local `yMin` sits on the anchor. */
export function arBottomLift(yMin, scale) {
  const y = Number(yMin);
  const s = Number(scale);
  if (!Number.isFinite(y) || !Number.isFinite(s)) return 0;
  const lift = -y * s;
  return lift === 0 ? 0 : lift;
}

/** Rotate vector `v` by unit quaternion `q` (x, y, z, w). */
export function rotateVecByQuat(v, q) {
  const { x, y, z } = v;
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return {
    x: x + qw * tx + (qy * tz - qz * ty),
    y: y + qw * ty + (qz * tx - qx * tz),
    z: z + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * World position `distance` meters along the viewer forward axis (−Z).
 * Used when hit-test is missing. Stage rotation stays identity.
 */
export function viewerFrontPosition(position, quat, distance = XR_VIEWER_DISTANCE_M) {
  const raw = Number(distance);
  const dist = Number.isFinite(raw) && raw > 0 ? raw : XR_VIEWER_DISTANCE_M;
  const offset = rotateVecByQuat({ x: 0, y: 0, z: -dist }, quat);
  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
    z: position.z + offset.z,
  };
}

/** Translation of a column-major 4×4 (WebXR / Three.js). */
export function translationFromMatrix4(m) {
  if (!m || m.length < 15) return { x: 0, y: 0, z: 0 };
  return { x: m[12], y: m[13], z: m[14] };
}

export function immersiveArSessionInit(overlayRoot) {
  const optional = ["local-floor", XR_HIT_TEST];
  const init = {
    optionalFeatures: optional,
  };
  if (overlayRoot) {
    init.optionalFeatures = ["local-floor", XR_HIT_TEST, "dom-overlay"];
    init.domOverlay = { root: overlayRoot };
  }
  return init;
}

export async function isImmersiveArSupported(xr = globalThis.navigator?.xr) {
  if (!xr || typeof xr.isSessionSupported !== "function") return false;
  try {
    return Boolean(await xr.isSessionSupported(XR_MODE));
  } catch {
    return false;
  }
}

export async function requestImmersiveAr(xr, overlayRoot) {
  try {
    return await xr.requestSession(XR_MODE, immersiveArSessionInit(overlayRoot));
  } catch {
    return xr.requestSession(XR_MODE, immersiveArSessionInit(null));
  }
}

/** Viewer-space hit-test source, or null if the session did not grant it. */
export async function requestViewerHitTestSource(session) {
  if (!session || typeof session.requestHitTestSource !== "function") return null;
  if (typeof session.requestReferenceSpace !== "function") return null;
  try {
    const viewerSpace = await session.requestReferenceSpace("viewer");
    return await session.requestHitTestSource({ space: viewerSpace });
  } catch {
    return null;
  }
}

/** Place in front of the viewer if hit-test never arrives. */
export const AR_NO_HITTEST_MS = 400;
/** Place in front if a hit-test source never finds a plane. */
export const AR_HIT_FALLBACK_MS = 1600;

/**
 * True when AR should stop waiting for a table hit and lock in front
 * of the viewer. A granted hit-test that never returns planes used to
 * leave the stage hidden for the whole session.
 */
export function shouldFallbackArPlace({ locked = false, hasHitTest = false, waitedMs = 0 } = {}) {
  if (locked) return false;
  const t = Number(waitedMs);
  const waited = Number.isFinite(t) && t > 0 ? t : 0;
  if (!hasHitTest) return waited >= AR_NO_HITTEST_MS;
  return waited >= AR_HIT_FALLBACK_MS;
}

/** Unit quaternion taking direction `from` onto `to`. */
export function quatFromTo(from, to) {
  const ax = Number(from?.x) || 0;
  const ay = Number(from?.y) || 0;
  const az = Number(from?.z) || 0;
  const bx = Number(to?.x) || 0;
  const by = Number(to?.y) || 0;
  const bz = Number(to?.z) || 0;
  const al = Math.hypot(ax, ay, az) || 1;
  const bl = Math.hypot(bx, by, bz) || 1;
  const fx = ax / al;
  const fy = ay / al;
  const fz = az / al;
  const tx = bx / bl;
  const ty = by / bl;
  const tz = bz / bl;
  const dot = fx * tx + fy * ty + fz * tz;
  if (dot > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.999999) {
    const ux = Math.abs(fx) < 0.9 ? 0 : fy;
    const uy = Math.abs(fx) < 0.9 ? fz : 0;
    const uz = Math.abs(fx) < 0.9 ? -fy : -fx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    return { x: ux / ul, y: uy / ul, z: uz / ul, w: 0 };
  }
  const cx = fy * tz - fz * ty;
  const cy = fz * tx - fx * tz;
  const cz = fx * ty - fy * tx;
  const w = 1 + dot;
  const n = Math.hypot(cx, cy, cz, w) || 1;
  return { x: cx / n, y: cy / n, z: cz / n, w: w / n };
}

/** Rotate the volume so product `axis` stands on the table (world +Y). */
export function standQuatFromAxis(axis) {
  return quatFromTo(productViewDir(axis, 1), { x: 0, y: 1, z: 0 });
}

export function volumeLocalAabb(width, height, yMin, yMax, cellSize = 1) {
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  const hx = Math.max(0, (width | 0) - 1) * 0.5 * size;
  const hz = Math.max(0, (height | 0) - 1) * 0.5 * size;
  const y0 = Number(yMin);
  const y1 = Number(yMax);
  return {
    min: { x: -hx, y: Number.isFinite(y0) ? y0 : 0, z: -hz },
    max: { x: hx, y: Number.isFinite(y1) ? y1 : 0, z: hz },
  };
}

export function aabbCorners(box) {
  const min = box?.min || { x: 0, y: 0, z: 0 };
  const max = box?.max || { x: 0, y: 0, z: 0 };
  const out = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) out.push({ x, y, z });
    }
  }
  return out;
}

/** World meters along the table normal so the standing AABB sits on the anchor. */
export function arStandLift(axis, box, scale) {
  const q = standQuatFromAxis(axis);
  const s = Number(scale);
  if (!Number.isFinite(s)) return 0;
  let minY = Infinity;
  for (const p of aabbCorners(box)) {
    const r = rotateVecByQuat(p, q);
    if (r.y < minY) minY = r.y;
  }
  if (!Number.isFinite(minY)) return 0;
  const lift = -minY * s;
  return lift === 0 ? 0 : lift;
}

export function normalizeStandAxis(axis) {
  return normalizeSliceAxis(axis);
}
