/**
 * Object yaw around product Z (engine Y): AR table / cyan playfield.
 * Lighting is a view-locked headlamp (`src/headlamp.js`), not this yaw.
 */

const TWO_PI = Math.PI * 2;

export function wrapTurntableYaw(rad) {
  const t = Number(rad);
  if (!Number.isFinite(t)) return 0;
  let w = t % TWO_PI;
  if (w < 0) w += TWO_PI;
  return w;
}

export function yawDegrees(rad) {
  return wrapTurntableYaw(rad) * (180 / Math.PI);
}

export function yawFromDegrees(deg) {
  return wrapTurntableYaw(((Number(deg) || 0) * Math.PI) / 180);
}

/**
 * Horizontal drag → yaw. Mouse/finger right spins clockwise from above
 * (grab the disk).
 */
export function yawDeltaFromDrag(dx, widthPx) {
  const w = Math.max(1, Number(widthPx) || 1);
  return (-(Number(dx) || 0) / w) * TWO_PI;
}

export function yawQuatY(yaw) {
  const h = wrapTurntableYaw(yaw) * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

export function mulQuat(a, b) {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const aw = a.w;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  const bw = b.w;
  return {
    x: aw * bx + ax * bw + ay * bz - az * by,
    y: aw * by - ax * bz + ay * bw + az * bx,
    z: aw * bz + ax * by - ay * bx + az * bw,
    w: aw * bw - ax * bx - ay * by - az * bz,
  };
}

export function invertUnitQuat(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/**
 * Rotate a parent-space direction by yaw around product Z (engine Y).
 * Matches Three.js `rotation.y`. Used for AR object axes.
 */
export function yawProductDir(dir, yaw) {
  const c = Math.cos(wrapTurntableYaw(yaw));
  const s = Math.sin(wrapTurntableYaw(yaw));
  const x = Number(dir?.x) || 0;
  const y = Number(dir?.y) || 0;
  const z = Number(dir?.z) || 0;
  return { x: x * c + z * s, y, z: -x * s + z * c };
}

/** AR placement quat, then local yaw around table +Y. */
export function composeArYaw(anchor, yaw) {
  const a = anchor && Number.isFinite(anchor.w) ? anchor : { x: 0, y: 0, z: 0, w: 1 };
  return mulQuat(a, yawQuatY(yaw));
}

/**
 * Viewcube group quaternion: invert(camera) * yawY so the cube follows
 * a yawed volume. Desktop orbit passes yaw = 0 (object stays put).
 */
export function gizmoFollowYaw(camQuat, yaw) {
  const q = camQuat && Number.isFinite(camQuat.w) ? camQuat : { x: 0, y: 0, z: 0, w: 1 };
  return mulQuat(invertUnitQuat(q), yawQuatY(yaw));
}
