/**
 * Headset input math: stick yaw and layer scrub, grip pinch, face buttons,
 * the head-relative palette, plane-slide, and the floor ring.
 * The old table-side Play/stand/Exit plate stays as layout data for tests.
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

/** xr-standard: thumbstick click, A/X, B/Y. */
export const XR_BTN_STICK = 3;
export const XR_BTN_PRIMARY = 4;
export const XR_BTN_SECONDARY = 5;

/** Full-deflection layer steps per second (stick Y). */
export const XR_LAYER_STEPS_PER_S = 10;

/** Palette sits left of the view, in front of the head. Meters, camera space. */
export const XR_PALETTE_LEFT_M = 0.34;
export const XR_PALETTE_DROP_M = 0.06;
export const XR_PALETTE_DISTANCE_M = 0.72;

/** Floor ring grab rim, meters. */
export const XR_RING_PICK_M = 0.05;

const PALETTE_Z0 = -0.008;
const PALETTE_Z1 = 0.014;

function paletteButton(id, x0, y0, x1, y1) {
  return {
    id,
    kind: "button",
    min: { x: x0, y: y0, z: PALETTE_Z0 },
    max: { x: x1, y: y1, z: PALETTE_Z1 },
  };
}

function paletteRow(y, ids, x0 = -0.125, x1 = 0.125, gap = 0.008, h = 0.04) {
  const n = ids.length;
  const span = (x1 - x0 - gap * (n - 1)) / n;
  return ids.map((id, i) => {
    const a = x0 + i * (span + gap);
    return paletteButton(id, a, y, a + span, y + h);
  });
}

/** Head-relative inspect sheet. Origin at panel center, +Z toward the viewer. */
export const PALETTE_WIDGETS = [
  ...paletteRow(0.168, ["play"]),
  ...paletteRow(0.12, ["spin"]),
  ...paletteRow(0.072, ["axis-x", "axis-y", "axis-z"]),
  ...paletteRow(0.024, ["src-mni152-low", "src-mni152"]),
  ...paletteRow(-0.024, ["src-ignition", "src-conway"]),
  ...paletteRow(-0.072, ["shade-hull", "shade-ghost", "shade-triple"]),
  ...paletteRow(-0.12, ["hide-center", "hide-outer"]),
];

export function paletteWidgetById(id) {
  return PALETTE_WIDGETS.find((w) => w.id === id) || null;
}

export function buttonPressed(gamepad, index) {
  return Boolean(gamepad?.buttons?.[index]?.pressed);
}

/** True on the frame a button goes down. */
export function risingEdge(pressed, wasPressed) {
  return Boolean(pressed) && !wasPressed;
}

/** xr-standard: axes[3] is thumbstick Y; fallback to axes[1]. */
export function thumbstickYFromAxes(axes) {
  if (!axes || typeof axes.length !== "number" || axes.length < 1) return 0;
  const y = axes.length >= 4 ? Number(axes[3]) : Number(axes[1]);
  return Number.isFinite(y) ? y : 0;
}

export function strongestStickY(ys) {
  let best = 0;
  for (const y of ys || []) {
    const n = Number(y) || 0;
    if (Math.abs(n) > Math.abs(best)) best = n;
  }
  return best;
}

/**
 * Signed playhead steps from stick Y. Positive Y steps toward the high
 * end of the rail (back decreases). `acc` carries the fraction.
 */
export function layerStepsFromStick(axisY, dt, acc = 0, rate = XR_LAYER_STEPS_PER_S) {
  const y = Number(axisY);
  const step = Number(dt);
  let a = Number(acc);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(y) || !Number.isFinite(step) || step <= 0) return { steps: 0, acc: a };
  const abs = Math.abs(y);
  if (abs < XR_YAW_STICK_DEADZONE) return { steps: 0, acc: 0 };
  const mag = (abs - XR_YAW_STICK_DEADZONE) / (1 - XR_YAW_STICK_DEADZONE);
  a += Math.sign(y) * mag * rate * step;
  const steps = Math.trunc(a);
  return { steps, acc: a - steps };
}

export function nextSliceAxis(axis) {
  if (axis === "x") return "y";
  if (axis === "y") return "z";
  return "x";
}

export function paletteOffsetLocal() {
  return {
    x: -XR_PALETTE_LEFT_M,
    y: -XR_PALETTE_DROP_M,
    z: -XR_PALETTE_DISTANCE_M,
  };
}

/** Panel position in front-left of the head. `look*` is the camera, for billboard. */
export function paletteHeadPose(camPos, camQuat, offset = paletteOffsetLocal()) {
  const delta = rotateVecByQuat(offset, camQuat);
  return {
    x: (Number(camPos?.x) || 0) + delta.x,
    y: (Number(camPos?.y) || 0) + delta.y,
    z: (Number(camPos?.z) || 0) + delta.z,
    lookX: Number(camPos?.x) || 0,
    lookY: Number(camPos?.y) || 0,
    lookZ: Number(camPos?.z) || 0,
  };
}

export function pickPaletteWidget(localOrigin, localDir) {
  let best = null;
  for (const w of PALETTE_WIDGETS) {
    const t = rayAabb(localOrigin, localDir, w.min, w.max);
    if (t == null) continue;
    if (best && t >= best.t) continue;
    best = { id: w.id, kind: w.kind, t };
  }
  return best;
}

/** Grip point in panel space. `padZ` thickens the thin plates. */
export function pickPalettePoint(p, padZ = 0.05) {
  if (!p) return null;
  const z0 = PALETTE_Z0 - padZ;
  const z1 = PALETTE_Z1 + padZ;
  for (const w of PALETTE_WIDGETS) {
    if (p.x < w.min.x || p.x > w.max.x || p.y < w.min.y || p.y > w.max.y) continue;
    if (p.z < z0 || p.z > z1) continue;
    return { id: w.id, kind: w.kind, t: 0 };
  }
  return null;
}

export function paletteActionFromHit(hit) {
  if (!hit) return null;
  const id = hit.id;
  if (id === "play") return { type: "play" };
  if (id === "spin") return { type: "spin" };
  if (id === "axis-x" || id === "axis-y" || id === "axis-z") {
    return { type: "axis", axis: id.slice(5) };
  }
  if (id === "hide-center") return { type: "hide-center" };
  if (id === "hide-outer") return { type: "hide-outer" };
  if (id === "shade-hull" || id === "shade-ghost" || id === "shade-triple") {
    return { type: "shade", mode: id.slice(6) };
  }
  if (id.startsWith("src-")) return { type: "source", kind: id.slice(4) };
  return null;
}

export function pointOnRay(origin, dir, t) {
  const s = Number(t) || 0;
  return {
    x: origin.x + dir.x * s,
    y: origin.y + dir.y * s,
    z: origin.z + dir.z * s,
  };
}

/**
 * Slab back index so the plane follows the hand.
 * `axisDir` is the world direction of decreasing back (the plane's +coord).
 * `metersPerStep` is world meters per back index along that direction.
 */
export function axisDragBack(hand, hand0, axisDir, metersPerStep, back0) {
  const m = Number(metersPerStep);
  if (!(Math.abs(m) > 1e-8) || !hand || !hand0 || !axisDir) return back0 | 0;
  const along =
    (hand.x - hand0.x) * axisDir.x +
    (hand.y - hand0.y) * axisDir.y +
    (hand.z - hand0.z) * axisDir.z;
  const step = Math.round(along / Math.abs(m));
  const sign = m < 0 ? -1 : 1;
  return (back0 | 0) - sign * step;
}

export function distPointToSegment3(px, py, pz, ax, ay, az, bx, by, bz) {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const uu = ux * ux + uy * uy + uz * uz;
  let s = 0;
  if (uu > 1e-12) {
    s = ((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / uu;
    s = Math.min(1, Math.max(0, s));
  }
  const qx = ax + s * ux;
  const qy = ay + s * uy;
  const qz = az + s * uz;
  return Math.hypot(px - qx, py - qy, pz - qz);
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecLen(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function vecNorm(a) {
  const n = vecLen(a);
  if (!(n > 1e-8)) return null;
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}

function vecCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function wrapPi(d) {
  let x = d;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** Yaw delta (radians) as the hand swings around `up` through `anchor`. */
export function yawGrabDelta(anchor, up, hand0, hand) {
  const n = vecNorm(up || { x: 0, y: 1, z: 0 });
  if (!n || !anchor || !hand0 || !hand) return 0;
  const ref = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tx = vecNorm(vecCross(ref, n));
  if (!tx) return 0;
  const tz = vecCross(n, tx);
  const coords = (p) => {
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    const dz = p.z - anchor.z;
    return {
      x: dx * tx.x + dy * tx.y + dz * tx.z,
      z: dx * tz.x + dy * tz.y + dz * tz.z,
    };
  };
  const a = coords(hand0);
  const b = coords(hand);
  if (a.x * a.x + a.z * a.z < 1e-8 || b.x * b.x + b.z * b.z < 1e-8) return 0;
  return wrapPi(Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z));
}

/**
 * Ray vs a world circle (the floor ring). Returns `{ t, dist }` when the
 * plane hit lands within `rim` of the radius, else null.
 */
export function rayCircleHit(origin, dir, center, normal, radius, rim = XR_RING_PICK_M) {
  const n = vecNorm(normal);
  const r = Number(radius);
  if (!n || !origin || !dir || !center || !(r > 0)) return null;
  const denom = vecDot(dir, n);
  if (Math.abs(denom) < 1e-6) return null;
  const rel = { x: center.x - origin.x, y: center.y - origin.y, z: center.z - origin.z };
  const t = vecDot(rel, n) / denom;
  if (!(t >= 0)) return null;
  const p = pointOnRay(origin, dir, t);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const dz = p.z - center.z;
  const radial = Math.hypot(dx, dy, dz);
  const err = Math.abs(radial - r);
  if (err > rim) return null;
  return { t, dist: err };
}

/** Distance from a point to the ring curve. */
export function pointCircleDist(point, center, normal, radius) {
  const n = vecNorm(normal);
  const r = Number(radius);
  if (!n || !point || !center || !(r > 0)) return Infinity;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const h = dx * n.x + dy * n.y + dz * n.z;
  const px = dx - n.x * h;
  const py = dy - n.y * h;
  const pz = dz - n.z * h;
  const radial = Math.abs(Math.hypot(px, py, pz) - r);
  return Math.hypot(radial, h);
}

/**
 * Short click via the WebXR haptic actuator. Returns false when the
 * device has no pulse. Swallows a rejected promise.
 */
export function pulseHaptic(gamepad, intensity = 0.45, durationMs = 32) {
  const list = gamepad?.hapticActuators;
  const actuator = (list && list[0]) || gamepad?.vibrationActuator;
  if (!actuator || typeof actuator.pulse !== "function") return false;
  const value = Math.min(1, Math.max(0, Number(intensity) || 0));
  const ms = Math.max(0, Number(durationMs) || 0);
  try {
    const result = actuator.pulse(value, ms);
    if (result && typeof result.catch === "function") result.catch(() => {});
    return true;
  } catch {
    return false;
  }
}
