/**
 * XR-A session helpers. Pose and scale are plain math so Node tests
 * do not need a WebXR device.
 */

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
