/**
 * Playhead vs clip rings: insets, bar sizes, and which overlapping
 * edge the pointer meant. No Three.js — the renderer builds the meshes.
 */

import { normalizeSliceAxis } from "./axes.js";

/** Screen-space rim around a ring edge, in CSS pixels. */
export const FRAME_PICK_PX = 28;

/** Hits this close in pixels count as the same edge (stacked rings). */
export const FRAME_PICK_SLACK_PX = 8;

/**
 * Touch orbit: fingers rotate and pinch-zoom. Stack sliders move planes.
 * Mouse still grabs a frame edge.
 */
export function pointerGrabsFrames(pointerType) {
  return pointerType !== "touch";
}

/** Playhead is the true plane size. Clips sit clearly inside that rectangle. */
export function frameHandleInset(cellSize, handle, width = 16, height = 16, yMin = 0, yMax = 0) {
  const cs = Math.max(1e-6, Number(cellSize) || 1);
  if (handle !== "near" && handle !== "far") return 0;
  const hw = (Math.max(1, width) * cs) / 2;
  const hd = (Math.max(1, height) * cs) / 2;
  const hy = Math.max(cs, Math.abs((Number(yMax) || 0) - (Number(yMin) || 0)) / 2);
  const span = Math.min(hw, hd, hy);
  return Math.max(cs * 1.6, span * 0.22);
}

/** Playhead bar is thicker than a clip. Thickness follows the brick span. */
export function frameBarThickness(
  cellSize,
  handle = "focus",
  width = 16,
  height = 16,
  yMin = 0,
  yMax = 0,
) {
  const cs = Math.max(1e-6, Number(cellSize) || 1);
  const hw = (Math.max(1, width) * cs) / 2;
  const hd = (Math.max(1, height) * cs) / 2;
  const hy = Math.max(cs, Math.abs((Number(yMax) || 0) - (Number(yMin) || 0)) / 2);
  const span = Math.max(cs, Math.min(hw, hd, hy));
  const clip = handle === "near" || handle === "far";
  const frac = clip ? 0.007 : 0.014;
  const floor = clip ? cs * 0.045 : cs * 0.13;
  return { visual: Math.max(floor, Math.min(span * 0.05, span * frac)) };
}

/**
 * Rectangle for a ring in the slice plane. Playhead matches the AABB face;
 * clips are inset so they do not share a side with another axis.
 */
export function frameRingBox(width, height, cellSize, axis, yMin, yMax, inset) {
  const cs = Math.max(1e-6, Number(cellSize) || 1);
  const a = normalizeSliceAxis(axis);
  const hw0 = (Math.max(1, width) * cs) / 2;
  const hd0 = (Math.max(1, height) * cs) / 2;
  const y0 = Number(yMin) || 0;
  const y1 = Number(yMax) || 0;
  const hy0 = Math.max(cs, Math.abs(y1 - y0) / 2);
  const keep = cs * 0.35;
  const pad = Math.max(0, Number(inset) || 0);
  const px = Math.min(pad, Math.max(0, hw0 - keep));
  const pz = Math.min(pad, Math.max(0, hd0 - keep));
  const py = Math.min(pad, Math.max(0, hy0 - keep));
  const lo = Math.min(y0, y1) + py;
  const hi = Math.max(y0, y1) - py;
  return {
    axis: a,
    hw: hw0 - px,
    hd: hd0 - pz,
    yMin: lo,
    yMax: hi,
    yMid: (lo + hi) / 2,
  };
}

/**
 * Four edges of a ring in the frame group's local space (offset is on the group).
 */
export function frameRingWorldEdges(box, axis, origin = 0) {
  const a = normalizeSliceAxis(axis);
  const hw = Number(box?.hw) || 0;
  const hd = Number(box?.hd) || 0;
  const y0 = Number(box?.yMin) || 0;
  const y1 = Number(box?.yMax) || 0;
  const o = Number(origin) || 0;
  if (a === "x") {
    return [
      [
        { x: o, y: y0, z: -hd },
        { x: o, y: y1, z: -hd },
      ],
      [
        { x: o, y: y0, z: hd },
        { x: o, y: y1, z: hd },
      ],
      [
        { x: o, y: y0, z: -hd },
        { x: o, y: y0, z: hd },
      ],
      [
        { x: o, y: y1, z: -hd },
        { x: o, y: y1, z: hd },
      ],
    ];
  }
  if (a === "y") {
    return [
      [
        { x: -hw, y: y0, z: o },
        { x: hw, y: y0, z: o },
      ],
      [
        { x: -hw, y: y1, z: o },
        { x: hw, y: y1, z: o },
      ],
      [
        { x: -hw, y: y0, z: o },
        { x: -hw, y: y1, z: o },
      ],
      [
        { x: hw, y: y0, z: o },
        { x: hw, y: y1, z: o },
      ],
    ];
  }
  return [
    [
      { x: -hw, y: o, z: -hd },
      { x: hw, y: o, z: -hd },
    ],
    [
      { x: -hw, y: o, z: hd },
      { x: hw, y: o, z: hd },
    ],
    [
      { x: -hw, y: o, z: -hd },
      { x: -hw, y: o, z: hd },
    ],
    [
      { x: hw, y: o, z: -hd },
      { x: hw, y: o, z: hd },
    ],
  ];
}

export function distPointToSegment2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function closestTOnSegment2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0;
  return Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
}

function planeNormal(axis) {
  const a = normalizeSliceAxis(axis);
  if (a === "x") return { x: 1, y: 0, z: 0 };
  if (a === "y") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

/** Larger = more face-on to the camera (a lid you are looking at). */
export function frameFaceOnScore(viewDir, axis) {
  const n = planeNormal(axis);
  const vx = Number(viewDir?.x) || 0;
  const vy = Number(viewDir?.y) || 0;
  const vz = Number(viewDir?.z) || 0;
  const len = Math.hypot(vx, vy, vz);
  if (len < 1e-8) return 0;
  return Math.abs((vx * n.x + vy * n.y + vz * n.z) / len);
}

/**
 * Screen-space pick: anything within FRAME_PICK_PX of an edge.
 * Closer pixel distance wins; when stacked, prefer the hovered ring,
 * then the playhead over a clip, then the more face-on plane.
 */
export function pickOverlappingFrameHit(
  candidates,
  stickyKey = "",
  maxPx = FRAME_PICK_PX,
  slackPx = FRAME_PICK_SLACK_PX,
) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const within = list.filter((c) => c.pixelDist <= maxPx);
  if (!within.length) return null;
  let closest = within[0].pixelDist;
  for (const c of within) {
    if (c.pixelDist < closest) closest = c.pixelDist;
  }
  const near = within.filter((c) => c.pixelDist <= closest + slackPx);
  let best = near[0];
  let bestScore = -Infinity;
  for (const c of near) {
    const key = `${c.axis}:${c.handle}`;
    const sticky = key === stickyKey ? 6 : 0;
    const focusBoost = c.handle === "focus" ? 2 : 0;
    const score =
      sticky + focusBoost + frameFaceOnScore(c.viewDir, c.axis) * 3 - c.pixelDist * 0.45;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Floor on pixels per index step so a grazing view cannot explode X/Y drags. */
export const SCREEN_AXIS_MIN_PX = 10;

/**
 * Map one world step along `axisDir` into a screen unit vector and pixel length.
 * `project` returns `{ x, y }` in CSS pixels or null if clipped.
 */
export function screenAxisDragMap(grab, axisDir, scale, project) {
  const s = Math.max(1e-6, Number(scale) || 1);
  const a = project(grab);
  const b = project({
    x: grab.x + axisDir.x * s,
    y: grab.y + axisDir.y * s,
    z: grab.z + axisDir.z * s,
  });
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { ux: dx / len, uy: dy / len, px: Math.max(len, SCREEN_AXIS_MIN_PX) };
}

export function screenAxisDragStep(dx, dy, mapped) {
  if (!mapped || !(mapped.px > 0)) return 0;
  return Math.round((dx * mapped.ux + dy * mapped.uy) / mapped.px);
}

/** World-meter rim around a ring edge for XR controller rays. */
export const FRAME_PICK_M = 0.08;

/**
 * Closest approach of a ray to a segment. `t` is along the ray (>= 0).
 */
export function distRayToSegment3(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz) {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const wx = ax - ox;
  const wy = ay - oy;
  const wz = az - oz;
  const uu = ux * ux + uy * uy + uz * uz;
  const vv = dx * dx + dy * dy + dz * dz;
  const uv = ux * dx + uy * dy + uz * dz;
  const uw = ux * wx + uy * wy + uz * wz;
  const vw = dx * wx + dy * wy + dz * wz;
  const denom = uu * vv - uv * uv;
  let s = 0;
  if (uu > 1e-12) {
    if (Math.abs(denom) >= 1e-12) s = (uv * vw - vv * uw) / denom;
    s = Math.min(1, Math.max(0, s));
  }
  const px = ax + s * ux;
  const py = ay + s * uy;
  const pz = az + s * uz;
  const t = vv > 1e-12
    ? Math.max(0, ((px - ox) * dx + (py - oy) * dy + (pz - oz) * dz) / vv)
    : 0;
  const qx = ox + t * dx;
  const qy = oy + t * dy;
  const qz = oz + t * dz;
  return { dist: Math.hypot(qx - px, qy - py, qz - pz), t, s, x: px, y: py, z: pz };
}

/**
 * Scalar along a turntable axis: X → x, Y → z, Z → y.
 * Ray in the same local space, unit-ish direction.
 */
export function closestAxisCoord(origin, dir, axis) {
  const a = normalizeSliceAxis(axis);
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const dx = dir.x / len;
  const dy = dir.y / len;
  const dz = dir.z / len;
  const ex = a === "x" ? 1 : 0;
  const ey = a === "z" ? 1 : 0;
  const ez = a === "y" ? 1 : 0;
  const de = dx * ex + dy * ey + dz * ez;
  const oe = origin.x * ex + origin.y * ey + origin.z * ez;
  const od = origin.x * dx + origin.y * dy + origin.z * dz;
  const denom = 1 - de * de;
  if (Math.abs(denom) < 1e-8) return oe;
  const t = Math.max(0, (oe * de - od) / denom);
  return oe + t * de;
}
