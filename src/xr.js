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
/** Tabletop ~2.5× is comfortable; floor placement wants at least 2× that. */
export const XR_MAG_MAX = 5;
export const XR_MAG_DEFAULT = 1;
/** Hit pose Y (surface normal) must align with world +Y at least this much. */
export const XR_FLOOR_UP_DOT = 0.7;

export function clampArMag(mag) {
  const m = Number(mag);
  if (!Number.isFinite(m) || m <= 0) return XR_MAG_DEFAULT;
  return Math.min(XR_MAG_MAX, Math.max(XR_MAG_MIN, m));
}

/** Longest grid edge in cells (XY board or time tape). */
export function xrExtentCells(width = XR_BOARD_CELLS, height = XR_BOARD_CELLS, timeCells = 1) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const t = Math.max(1, timeCells | 0);
  return Math.max(w, h, t);
}

/**
 * Floor-plane span in cells: the two axes that lie on the table.
 * The standing axis is omitted so Play can grow up without shrinking the fit.
 */
export function xrFootprintCells(
  width = XR_BOARD_CELLS,
  height = XR_BOARD_CELLS,
  timeCells = 1,
  standAxis = "z",
) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const t = Math.max(1, timeCells | 0);
  const a = normalizeSliceAxis(standAxis);
  if (a === "x") return Math.max(h, t);
  if (a === "y") return Math.max(w, t);
  return Math.max(w, h);
}

/**
 * Scale so `extentCells` of `cellSize` span 40 cm × `mag` in WebXR meters.
 * Pass the table footprint (not the standing/time axis) so a growing
 * Conway tape stays the same cell size and only gets taller.
 */
export function xrStageScale(
  cellSize = 1,
  mag = XR_MAG_DEFAULT,
  extentCells = XR_BOARD_CELLS,
) {
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  const ext = Number(extentCells);
  const cells = Number.isFinite(ext) && ext > 0 ? ext : XR_BOARD_CELLS;
  return (XR_BOARD_METERS / (cells * size)) * clampArMag(mag);
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

/** Hand-to-anchor offset when grabbing a frame to slide the volume. */
export function spaceDragOffset(anchor, controller) {
  return {
    x: (Number(anchor?.x) || 0) - (Number(controller?.x) || 0),
    y: (Number(anchor?.y) || 0) - (Number(controller?.y) || 0),
    z: (Number(anchor?.z) || 0) - (Number(controller?.z) || 0),
  };
}

/** New table anchor so the grabbed offset stays on the hand. */
export function spaceDragAnchor(controller, offset) {
  return {
    x: (Number(controller?.x) || 0) + (Number(offset?.x) || 0),
    y: (Number(controller?.y) || 0) + (Number(offset?.y) || 0),
    z: (Number(controller?.z) || 0) + (Number(offset?.z) || 0),
  };
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

/** Quest / Pico / Wolvic in-headset browsers (2D panel or immersive). */
export function isHeadsetBrowser(userAgent = "") {
  return /OculusBrowser|\bQuest\b|PicoBrowser|Wolvic|Meta Quest/i.test(String(userAgent || ""));
}

/**
 * Phone AR needs the HUD overlay. A fullscreen overlay on Quest covers
 * passthrough even when CSS is transparent — never `document.body`.
 */
export function overlayRootForAr(overlayEl, userAgent = "") {
  if (isHeadsetBrowser(userAgent)) return null;
  return overlayEl || null;
}

/** Three.js defaults to local-floor; Quest AR often only grants local. */
export async function preferredReferenceSpaceType(session) {
  if (!session || typeof session.requestReferenceSpace !== "function") return "local";
  for (const type of ["local-floor", "local", "viewer"]) {
    try {
      await session.requestReferenceSpace(type);
      return type;
    } catch {
      /* next */
    }
  }
  return "local";
}

/**
 * Quest immersive-ar + XRProjectionLayer often composites opaque and
 * hides passthrough. Force the classic XRWebGLLayer for that setSession.
 */
export async function withXrWebGLLayerOnly(run) {
  const Ctor = globalThis.XRWebGLBinding;
  const proto = Ctor && Ctor.prototype;
  if (!proto || !("createProjectionLayer" in proto)) return run();
  const prev = proto.createProjectionLayer;
  try {
    delete proto.createProjectionLayer;
    if ("createProjectionLayer" in proto) return run();
    return await run();
  } finally {
    if (typeof prev === "function") proto.createProjectionLayer = prev;
  }
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

/**
 * Ignore WebXR `select` for this long after an overlay button (Reset
 * Anchor). Phone overlay taps also fire `transient-pointer` select.
 */
export const AR_OVERLAY_SELECT_GUARD_MS = 450;

/** True while a DOM overlay click may still echo as a WebXR select. */
export function arSelectIsOverlayEcho(now, ignoreUntil) {
  const t = Number(now);
  const until = Number(ignoreUntil);
  if (!Number.isFinite(t) || !Number.isFinite(until)) return false;
  return t < until;
}

/**
 * Guard overlay chrome only. A tap on the overlay root (passthrough /
 * canvas) must still place. A capture listener on `#xr-overlay` used
 * to swallow every phone tap, so orbit never reached the canvas and
 * WebXR `select` never locked.
 */
export const AR_OVERLAY_GUARD_SEL =
  "button, input, select, textarea, label, .stack, .transport, .ar-size, .ar-yaw, .ar-stand, .gizmo-col, .inspect-transport, .loop-axes";

export function arOverlaySelectShouldGuard(target, overlayRoot) {
  if (!overlayRoot || target == null) return false;
  if (target === overlayRoot) return false;
  const node = target.nodeType === 1 ? target : target.parentElement;
  if (!node) return false;
  if (typeof overlayRoot.contains === "function" && !overlayRoot.contains(node)) {
    return false;
  }
  if (typeof node.closest !== "function") return false;
  return Boolean(node.closest(AR_OVERLAY_GUARD_SEL));
}

/**
 * User-confirmed place only. Search is armed on enter (and after Reset).
 * A visible reticle must not move the stage until confirm. Timeouts
 * never lock. Without hit-test, a tap may lock the viewer-front preview.
 */
export function canConfirmArPlace({
  locked = false,
  searching = false,
  reticleVisible = false,
  hasHitTest = false,
  hitTestResolved = true,
} = {}) {
  if (locked) return false;
  if (!searching) return false;
  if (!hitTestResolved) return false;
  if (hasHitTest) return Boolean(reticleVisible);
  return true;
}

/** Phone AR: no brick until lock. Headset may keep a viewer-front preview. */
export function arVolumeVisible({ locked = false, headset = false, anchored = false } = {}) {
  if (locked) return true;
  return Boolean(headset && anchored);
}

export function arReticleAllowed({
  presenting = false,
  searching = false,
  locked = false,
  hasHitTest = false,
} = {}) {
  return Boolean(presenting && searching && !locked && hasHitTest);
}

/** Pose Y axis (WebXR hit normal) from a column-major 4×4. */
export function matrix4YAxis(m) {
  if (!m || m.length < 7) return { x: 0, y: 1, z: 0 };
  return { x: Number(m[4]) || 0, y: Number(m[5]) || 0, z: Number(m[6]) || 0 };
}

/** Horizontal floor (or table): surface normal ≈ world +Y. Rejects walls. */
export function isFloorHitMatrix(m, minDot = XR_FLOOR_UP_DOT) {
  const { x, y, z } = matrix4YAxis(m);
  const len = Math.hypot(x, y, z);
  if (!(len > 0)) return false;
  const dot = Number(minDot);
  const need = Number.isFinite(dot) ? dot : XR_FLOOR_UP_DOT;
  return y / len >= need;
}

export function firstFloorHitMatrix(matrices, minDot = XR_FLOOR_UP_DOT) {
  if (!Array.isArray(matrices)) return null;
  for (const m of matrices) {
    if (isFloorHitMatrix(m, minDot)) return m;
  }
  return null;
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

/**
 * Local AABB for a voxel crop, origin at the full-grid center.
 * Sit-on-plane uses this so inspect clips shrink the brick on the table.
 */
export function volumeLocalAabbFromCrop(aabb, width, height, yMin, yMax, cellSize = 1) {
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  const w = Math.max(0, (width | 0) - 1);
  const h = Math.max(0, (height | 0) - 1);
  const ox = w * 0.5;
  const oz = h * 0.5;
  const xLo = aabb?.xLo == null ? 0 : aabb.xLo | 0;
  const xHi = aabb?.xHi == null ? w : aabb.xHi | 0;
  const yLo = aabb?.yLo == null ? 0 : aabb.yLo | 0;
  const yHi = aabb?.yHi == null ? h : aabb.yHi | 0;
  const y0 = Number(yMin);
  const y1 = Number(yMax);
  return {
    min: { x: (xLo - ox) * size, y: Number.isFinite(y0) ? y0 : 0, z: (yLo - oz) * size },
    max: { x: (xHi - ox) * size, y: Number.isFinite(y1) ? y1 : 0, z: (yHi - oz) * size },
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
