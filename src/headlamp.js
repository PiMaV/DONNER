/**
 * View-locked key/fill (headlamp). Directional lights sit in camera space
 * so the facing side of the volume stays lit in orbit and in AR walk.
 * Hemisphere stays world sky-up as a dim ambient.
 */

import { rotateVecByQuat } from "./xr.js";

/** Camera space: +X right, +Y up, −Z look (Three.js). */
export const HEADLAMP_KEY_LOCAL = { x: 8, y: 12, z: 4 };
export const HEADLAMP_FILL_LOCAL = { x: -10, y: 2, z: 6 };

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

export function headlampPose(camPos, camQuat, dist = 40) {
  return {
    key: offsetInView(camPos, camQuat, HEADLAMP_KEY_LOCAL),
    fill: offsetInView(camPos, camQuat, HEADLAMP_FILL_LOCAL),
    target: viewLookTarget(camPos, camQuat, dist),
  };
}
