/**
 * XR-C-0 headset input math (stick yaw, grip pinch, optional HUD layout).
 * The in-world Play/stand/Exit plate is retired; keep the layout helpers
 * for a later readable wrist/hand chrome (XR-C-1).
 */

import { AXIS_COLOR, COLOR } from "./config.js";
import { XR_MAG_DEFAULT, clampArMag, rotateVecByQuat } from "./xr.js";

export const XR_HUD_SIDE_M = 0.45;
export const XR_YAW_STICK_DEADZONE = 0.18;
export const XR_YAW_STICK_RAD_PER_S = Math.PI;
export const XR_PINCH_MIN_M = 0.04;

/** Play, stand X/Y/Z, Exit. Origin at panel center, +Z toward the viewer. */
export const HUD_WIDGETS = [
  {
    id: "play",
    kind: "button",
    min: { x: -0.08, y: 0.062, z: -0.006 },
    max: { x: 0.08, y: 0.108, z: 0.014 },
  },
  {
    id: "stand-x",
    kind: "button",
    min: { x: -0.09, y: -0.012, z: -0.006 },
    max: { x: -0.028, y: 0.036, z: 0.014 },
  },
  {
    id: "stand-y",
    kind: "button",
    min: { x: -0.024, y: -0.012, z: -0.006 },
    max: { x: 0.024, y: 0.036, z: 0.014 },
  },
  {
    id: "stand-z",
    kind: "button",
    min: { x: 0.028, y: -0.012, z: -0.006 },
    max: { x: 0.09, y: 0.036, z: 0.014 },
  },
  {
    id: "exit",
    kind: "button",
    min: { x: -0.08, y: -0.108, z: -0.006 },
    max: { x: 0.08, y: -0.062, z: 0.014 },
  },
];

export const HUD_BACK = {
  min: { x: -0.105, y: -0.125, z: -0.012 },
  max: { x: 0.105, y: 0.125, z: -0.006 },
};

export function hudWidgetById(id) {
  return HUD_WIDGETS.find((w) => w.id === id) || null;
}

export function widgetCenter(w) {
  return {
    x: (w.min.x + w.max.x) * 0.5,
    y: (w.min.y + w.max.y) * 0.5,
    z: (w.min.z + w.max.z) * 0.5,
  };
}

export function widgetSize(w) {
  return {
    x: w.max.x - w.min.x,
    y: w.max.y - w.min.y,
    z: w.max.z - w.min.z,
  };
}

export function hudWidgetColor(id, playing = false, standAxis = "z") {
  if (id === "play") return playing ? COLOR.cyan : COLOR.gold;
  if (id === "exit") return COLOR.blitz;
  if (id === "stand-x") return standAxis === "x" ? COLOR.gold : AXIS_COLOR.x;
  if (id === "stand-y") return standAxis === "y" ? COLOR.gold : AXIS_COLOR.y;
  if (id === "stand-z") return standAxis === "z" ? COLOR.gold : AXIS_COLOR.z;
  return COLOR.gold;
}

export function inverseQuat(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/**
 * Park pose: eye-height, to the viewer's right of the **table anchor**.
 * Call once at lock. Do not follow the growing stage.
 */
export function parkHudPose(anchor, camera, side = XR_HUD_SIDE_M) {
  const dx = camera.x - anchor.x;
  const dz = camera.z - anchor.z;
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len;
  const fz = dz / len;
  return {
    x: anchor.x + fz * side,
    y: camera.y,
    z: anchor.z + -fx * side,
    lookX: camera.x,
    lookY: camera.y,
    lookZ: camera.z,
  };
}

/** @deprecated Use parkHudPose. Kept as an alias for older tests. */
export const hoverHudPose = parkHudPose;

export function rayFromPose(position, quat) {
  const dir = rotateVecByQuat({ x: 0, y: 0, z: -1 }, quat);
  return { origin: { x: position.x, y: position.y, z: position.z }, dir };
}

export function worldRayToLocal(origin, dir, hudPos, hudQuat) {
  const inv = inverseQuat(hudQuat);
  const rel = {
    x: origin.x - hudPos.x,
    y: origin.y - hudPos.y,
    z: origin.z - hudPos.z,
  };
  return {
    origin: rotateVecByQuat(rel, inv),
    dir: rotateVecByQuat(dir, inv),
  };
}

/** Slab AABB ray hit. Returns t >= 0 or null. */
export function rayAabb(origin, dir, min, max) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"]) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - o) / d;
    let t2 = (max[axis] - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = tmin >= 0 ? tmin : tmax;
  return t < 0 ? null : t;
}

export function pickHudWidget(localOrigin, localDir) {
  let best = null;
  for (const w of HUD_WIDGETS) {
    const t = rayAabb(localOrigin, localDir, w.min, w.max);
    if (t == null) continue;
    if (best && t >= best.t) continue;
    best = { id: w.id, kind: w.kind, t };
  }
  return best;
}

export function hudActionFromHit(hit) {
  if (!hit) return null;
  if (hit.id === "play") return { type: "play" };
  if (hit.id === "exit") return { type: "exit" };
  if (hit.id === "stand-x") return { type: "stand", axis: "x" };
  if (hit.id === "stand-y") return { type: "stand", axis: "y" };
  if (hit.id === "stand-z") return { type: "stand", axis: "z" };
  return null;
}

/** xr-standard: axes[2] is thumbstick X; fallback to axes[0]. */
export function thumbstickXFromAxes(axes) {
  if (!axes || typeof axes.length !== "number" || axes.length < 1) return 0;
  const x = axes.length >= 4 ? Number(axes[2]) : Number(axes[0]);
  return Number.isFinite(x) ? x : 0;
}

export function yawDeltaFromStick(axisX, dt, rate = XR_YAW_STICK_RAD_PER_S) {
  const x = Number(axisX);
  const step = Number(dt);
  if (!Number.isFinite(x) || !Number.isFinite(step) || step <= 0) return 0;
  const abs = Math.abs(x);
  if (abs < XR_YAW_STICK_DEADZONE) return 0;
  const mag = (abs - XR_YAW_STICK_DEADZONE) / (1 - XR_YAW_STICK_DEADZONE);
  return Math.sign(x) * mag * rate * step;
}

export function strongestStickX(xs) {
  let best = 0;
  for (const x of xs || []) {
    const n = Number(x) || 0;
    if (Math.abs(n) > Math.abs(best)) best = n;
  }
  return best;
}

/** xr-standard squeeze is button index 1 (grip). */
export function gripPressed(gamepad) {
  return Boolean(gamepad?.buttons?.[1]?.pressed);
}

export function magFromPinch(startMag, startDist, dist) {
  const d0 = Number(startDist);
  const d = Number(dist);
  if (!(d0 >= XR_PINCH_MIN_M) || !(d > 0)) return clampArMag(startMag);
  return clampArMag((Number(startMag) || XR_MAG_DEFAULT) * (d / d0));
}

export function distance3(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.hypot(dx, dy, dz);
}

/**
 * Phone `screen` overlay never gets a world HUD. Headset if floating overlay,
 * tracked-pointer / hand, or Quest UA when overlay is not `screen`.
 */
export function isHeadsetArSession(session, userAgent = "") {
  if (!session) return false;
  const overlay = session.domOverlayState?.type;
  if (overlay === "screen") return false;
  if (overlay === "floating") return true;
  const ua = String(userAgent || "");
  if (/OculusBrowser|\bQuest\b/i.test(ua)) return true;
  const list = session.inputSources;
  const n = list && typeof list.length === "number" ? list.length : 0;
  for (let i = 0; i < n; i += 1) {
    const src = list[i];
    if (!src) continue;
    if (src.hand) return true;
    if (src.targetRayMode === "tracked-pointer") return true;
    const profiles = src.profiles || [];
    for (const p of profiles) {
      if (/oculus|quest|meta-quest/i.test(String(p))) return true;
    }
  }
  return false;
}

export function trackedInputSources(session) {
  const list = session?.inputSources;
  const n = list && typeof list.length === "number" ? list.length : 0;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const src = list[i];
    if (src && src.targetRayMode === "tracked-pointer") out.push(src);
  }
  return out;
}
