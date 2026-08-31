/**
 * XR-A session helpers. Pose and scale are plain math so Node tests
 * do not need a WebXR device. Hit-test / tap-to-place is a later slice.
 */

export const XR_MODE = "immersive-ar";
export const XR_BOARD_CELLS = 32;
export const XR_BOARD_METERS = 0.4;
export const XR_VIEWER_DISTANCE_M = 0.8;

/** Scale so 32 cells of `cellSize` span 40 cm in WebXR meters. */
export function xrStageScale(cellSize = 1) {
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  return XR_BOARD_METERS / (XR_BOARD_CELLS * size);
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
 * Stage rotation stays identity (playfield world-up), not head-locked.
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

export function immersiveArSessionInit(overlayRoot) {
  const init = {
    optionalFeatures: ["local-floor"],
  };
  if (overlayRoot) {
    init.optionalFeatures = ["local-floor", "dom-overlay"];
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
