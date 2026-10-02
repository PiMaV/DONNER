/**
 * Headset input math: stick yaw (right) and layer scrub (left), grip pinch,
 * face buttons, plane-slide hover, and haptics.
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

/** Midpoint of two hands (for two-grip translate). */
export function midpoint3(a, b) {
  return {
    x: ((Number(a?.x) || 0) + (Number(b?.x) || 0)) * 0.5,
    y: ((Number(a?.y) || 0) + (Number(b?.y) || 0)) * 0.5,
    z: ((Number(a?.z) || 0) + (Number(b?.z) || 0)) * 0.5,
  };
}

/**
 * Yaw delta from twisting two hands in the floor plane (XZ).
 * Positive = counterclockwise when looking down +Y.
 */
export function yawDeltaFromPinchHands(a, b, prevA, prevB) {
  if (!a || !b || !prevA || !prevB) return 0;
  const a0 = Math.atan2(
    (Number(prevB.z) || 0) - (Number(prevA.z) || 0),
    (Number(prevB.x) || 0) - (Number(prevA.x) || 0),
  );
  const a1 = Math.atan2(
    (Number(b.z) || 0) - (Number(a.z) || 0),
    (Number(b.x) || 0) - (Number(a.x) || 0),
  );
  let d = a1 - a0;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Number.isFinite(d) ? d : 0;
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
/** Quest menu / Meta when the runtime exposes it (not always present). */
export const XR_BTN_MENU = 6;

/** Full-deflection layer steps per second (stick Y). */
export const XR_LAYER_STEPS_PER_S = 10;

/** Floor ring grab rim, meters (geometry helper; Quest no longer shows a ring). */
export const XR_RING_PICK_M = 0.05;

export function buttonPressed(gamepad, index) {
  const b = gamepad?.buttons?.[index];
  if (!b) return false;
  if (b.pressed) return true;
  // Quest sometimes reports analog value without `pressed`.
  const v = Number(b.value);
  return Number.isFinite(v) && v >= 0.5;
}

/** Face A/X B/Y — digital `pressed` only (analog noise sticks forever). */
export function faceButtonPressed(gamepad, index) {
  return Boolean(gamepad?.buttons?.[index]?.pressed);
}

/**
 * Thumbstick pressed in (click). Uses `pressed` or a high analog `value`.
 * This is the physical stick button — not tilting the stick.
 */
export function stickClickHeld(gamepad) {
  const b = gamepad?.buttons?.[XR_BTN_STICK];
  if (!b) return false;
  if (b.pressed === true) return true;
  const v = Number(b.value);
  // Idle Quest sticks can sit around 0.3–0.4 without a click.
  return Number.isFinite(v) && v >= 0.85;
}

/** Left stick click only — menu/Meta is not on the Touch gamepad in WebXR. */
export function exitHoldPressed(gamepad) {
  if (!gamepad) return false;
  return stickClickHeld(gamepad);
}

function inputSourceHand(src) {
  return String(src?.handedness || "").toLowerCase();
}

/**
 * True when the left Touch stick is clicked in (Exit hold).
 * One tracked source with no handedness → treat as left (solo controller).
 */
export function leftExitHoldPressed(sources) {
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (list.length === 1 && !inputSourceHand(list[0])) {
    return exitHoldPressed(list[0]?.gamepad);
  }
  for (const s of list) {
    if (inputSourceHand(s) === "left" && exitHoldPressed(s?.gamepad)) return true;
  }
  return false;
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

/** Showcase sources cycled on Quest left X (Examples / Online Demo). */
export const AR_SHOWCASE_KINDS = [
  "mni152-low",
  "mni152",
  "ignition",
  "conway",
  "stream",
];

/** Hull → Ghost → Cuts → Hull. */
export function nextShadeMode(mode) {
  if (mode === "hull") return "ghost";
  if (mode === "ghost") return "triple";
  return "hull";
}

/**
 * Next showcase source. Returns null when cycling is not allowed
 * (Local Viewer with Examples off).
 */
export function nextArSourceKind(kind, { allowCycle = true } = {}) {
  if (!allowCycle) return null;
  const list = AR_SHOWCASE_KINDS;
  const i = list.indexOf(String(kind || ""));
  return list[i < 0 ? 0 : (i + 1) % list.length];
}

/** Short controller label for a source kind. */
export function arSourceLabel(kind) {
  if (kind === "mni152-low") return "MRI Low";
  if (kind === "mni152") return "MRI High";
  if (kind === "ignition") return "Ignition";
  if (kind === "conway") return "Life";
  if (kind === "count") return "Own";
  if (kind === "stream") return "Stream";
  return "Source";
}

/** Short controller label for shade mode. */
export function arShadeLabel(mode) {
  if (mode === "hull") return "Hull";
  if (mode === "ghost") return "Ghost";
  if (mode === "triple") return "Cuts";
  return "Shade";
}

function emptyFacePad() {
  return { primary: false, secondary: false, stick: false };
}

function readFacePad(src) {
  const pad = src?.gamepad;
  return {
    primary: faceButtonPressed(pad, XR_BTN_PRIMARY),
    secondary: faceButtonPressed(pad, XR_BTN_SECONDARY),
    stick: stickClickHeld(pad),
  };
}

/**
 * Face pads split by hand. One tracked source → `solo` only.
 * Two without handedness → index 0 left, index 1 right.
 */
export function facePadsByHand(sources) {
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  const out = { left: emptyFacePad(), right: emptyFacePad(), solo: null };
  if (list.length === 0) return out;
  if (list.length === 1) {
    out.solo = readFacePad(list[0]);
    return out;
  }
  let right = null;
  let left = null;
  const unknown = [];
  for (const s of list) {
    const hand = sourceHandedness(s);
    if (hand === "right") right = s;
    else if (hand === "left") left = s;
    else unknown.push(s);
  }
  if (!right && !left) {
    left = unknown[0] || null;
    right = unknown[1] || null;
  } else {
    if (!left) left = unknown[0] || null;
    if (!right) right = unknown[left === unknown[0] ? 1 : 0] || null;
  }
  if (left) out.left = readFacePad(left);
  if (right) out.right = readFacePad(right);
  return out;
}

/**
 * True when hover should fire a one-shot haptic: entering a frame key
 * (including switching frames). Clearing hover never pulses.
 */
export function hoverEnterPulse(prevKey = "", nextKey = "") {
  const prev = String(prevKey || "");
  const next = String(nextKey || "");
  if (!next) return false;
  return prev !== next;
}

function sourceHandedness(src) {
  return String(src?.handedness || "").toLowerCase();
}

/**
 * Split Quest sticks by hand:
 * right X = yaw, right Y = zoom;
 * left X = layer scrub, left Y = axis cycle (accumulated steps).
 * One tracked source: X = yaw, Y = zoom.
 */
export function stickAxesForHeadset(sources) {
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  const empty = { yawX: 0, zoomY: 0, layerX: 0, axisY: 0 };
  if (list.length === 0) return empty;
  if (list.length === 1) {
    const axes = list[0].gamepad?.axes;
    return {
      yawX: thumbstickXFromAxes(axes),
      zoomY: thumbstickYFromAxes(axes),
      layerX: 0,
      axisY: 0,
    };
  }
  let right = null;
  let left = null;
  const unknown = [];
  for (const s of list) {
    const hand = sourceHandedness(s);
    if (hand === "right") right = s;
    else if (hand === "left") left = s;
    else unknown.push(s);
  }
  if (!right && !left) {
    left = unknown[0] || null;
    right = unknown[1] || null;
  } else {
    if (!left) left = unknown[0] || null;
    if (!right) right = unknown[left === unknown[0] ? 1 : 0] || null;
  }
  return {
    yawX: thumbstickXFromAxes(right?.gamepad?.axes),
    zoomY: thumbstickYFromAxes(right?.gamepad?.axes),
    layerX: thumbstickXFromAxes(left?.gamepad?.axes),
    axisY: thumbstickYFromAxes(left?.gamepad?.axes),
  };
}

/** Hold duration in seconds before Exit fires. */
export const XR_EXIT_HOLD_S = 0.7;

/** Right-stick Y must stay deflected this long (seconds) before zoom applies. */
export const XR_ZOOM_ARM_S = 0.2;

/** Right-stick Y → multiplicative size rate at full deflection (per second). */
export const XR_ZOOM_STICK_PER_S = 0.9;

/** Left-stick Y → axis steps per second at full deflection. */
export const XR_AXIS_STEPS_PER_S = 2.2;

/** Hold fraction 0…1 for progress bars (`heldS` / `needS`). */
export function holdProgress(heldS, needS) {
  const need = Number(needS);
  if (!(need > 0)) return 0;
  const h = Number(heldS) || 0;
  if (h <= 0) return 0;
  return Math.min(1, h / need);
}

/**
 * Accumulate a hold. Fires once when `held` stays true for `holdS` seconds.
 * `dt` is frame delta in seconds. `state` is `{ ms, armed }` (`ms` = seconds held).
 */
export function tickStickLongPress(held, dt, state, holdS = XR_EXIT_HOLD_S) {
  const step = Number(dt) || 0;
  let ms = Number(state?.ms) || 0;
  let armed = Boolean(state?.armed);
  let fired = false;
  if (held) {
    ms += step;
    if (!armed && ms >= holdS) {
      armed = true;
      fired = true;
    }
  } else {
    ms = 0;
    armed = false;
  }
  return { ms, armed, fired };
}

/** Mag multiplier delta from right stick Y (zoom). */
export function magDeltaFromStick(axisY, dt, rate = XR_ZOOM_STICK_PER_S) {
  const y = Number(axisY);
  const step = Number(dt);
  if (!Number.isFinite(y) || !Number.isFinite(step) || step <= 0) return 0;
  const abs = Math.abs(y);
  if (abs < XR_YAW_STICK_DEADZONE) return 0;
  const mag = (abs - XR_YAW_STICK_DEADZONE) / (1 - XR_YAW_STICK_DEADZONE);
  // Up (negative Y in xr-standard often) → larger; flip so up zooms in.
  return -Math.sign(y) * mag * rate * step;
}

/**
 * Axis cycle steps from left stick Y (same accumulator pattern as layers).
 * Positive Y → next axis.
 */
export function axisStepsFromStick(axisY, dt, acc = 0, rate = XR_AXIS_STEPS_PER_S) {
  return layerStepsFromStick(axisY, dt, acc, rate);
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
