/**
 * View-locked key/fill (headlamp). Directional lights sit in camera space
 * so the facing side of the volume stays lit in orbit and in AR walk.
 * Hemisphere stays world sky-up as a dim ambient.
 */

import { rotateVecByQuat } from "./xr.js";

/** Camera space: +X right, +Y up, −Z look (Three.js). */
export const HEADLAMP_KEY_LOCAL = { x: 8, y: 12, z: 4 };
export const HEADLAMP_FILL_LOCAL = { x: -10, y: 2, z: 6 };
/** Face: lift the underside of the Z plane (camera −Y, a little in front). */
export const HEADLAMP_UNDER_LOCAL = { x: 2, y: -16, z: -8 };

export function offsetInView(camPos, camQuat, local) {
  const w = rotateVecByQuat(local, camQuat);
  const x = Number(camPos?.x) || 0;
  const y = Number(camPos?.y) || 0;
  const z = Number(camPos?.z) || 0;
  return { x: x + w.x, y: y + w.y, z: z + w.z };
}

/** Point along the camera look (−Z) at `dist`. */
export function viewLookTarget(camPos, camQuat, dist = 40) {
  const look = rotateVecByQuat({ x: 0, y: 0, z: -1 }, camQuat);
  const d = Number(dist);
  const span = Number.isFinite(d) && d > 0 ? d : 40;
  const x = Number(camPos?.x) || 0;
  const y = Number(camPos?.y) || 0;
  const z = Number(camPos?.z) || 0;
  return {
    x: x + look.x * span,
    y: y + look.y * span,
    z: z + look.z * span,
  };
}

export function headlampPose(camPos, camQuat, dist = 40, { under = false } = {}) {
  return {
    key: offsetInView(camPos, camQuat, HEADLAMP_KEY_LOCAL),
    fill: offsetInView(camPos, camQuat, under ? HEADLAMP_UNDER_LOCAL : HEADLAMP_FILL_LOCAL),
    target: viewLookTarget(camPos, camQuat, dist),
  };
}

/** Orbit can skip a light move when the camera pose (and Face-under flag) did not change. XR never skips. */
export const HEADLAMP_POSE_EPS = 1e-7;

export function snapshotHeadlampCam(pos, quat, under = false) {
  return {
    x: Number(pos?.x) || 0,
    y: Number(pos?.y) || 0,
    z: Number(pos?.z) || 0,
    qx: Number(quat?.x) || 0,
    qy: Number(quat?.y) || 0,
    qz: Number(quat?.z) || 0,
    qw: Number(quat?.w) || 1,
    under: Boolean(under),
  };
}

export function skipOrbitHeadlamp({ xr = false, under = false, pos, quat, prev, eps = HEADLAMP_POSE_EPS } = {}) {
  if (xr) return false;
  if (!prev) return false;
  if (Boolean(prev.under) !== Boolean(under)) return false;
  const next = snapshotHeadlampCam(pos, quat, under);
  const e = Number(eps);
  const lim = Number.isFinite(e) && e > 0 ? e : HEADLAMP_POSE_EPS;
  return (
    Math.abs(next.x - prev.x) <= lim &&
    Math.abs(next.y - prev.y) <= lim &&
    Math.abs(next.z - prev.z) <= lim &&
    Math.abs(next.qx - prev.qx) <= lim &&
    Math.abs(next.qy - prev.qy) <= lim &&
    Math.abs(next.qz - prev.qz) <= lim &&
    Math.abs(next.qw - prev.qw) <= lim
  );
}
