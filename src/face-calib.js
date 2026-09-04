/**
 * Map a DONNER volume onto a tracked head. Affine/RAS is ignored in the
 * cube, so placement is head-local: Shift / Lift / Inset from the face
 * front, plus Flip L/R (selfie cameras mirror the image planes).
 */

import { rotateVecByQuat } from "./xr.js";

/** Target skull width in meters (longest volume edge). */
export const FACE_SKULL_M = 0.16;
export const FACE_MAG_MIN = 0.4;
export const FACE_MAG_MAX = 5;
export const FACE_MAG_DEFAULT = 1.2;
/**
 * MediaPipe facial transform translation is centimetres.
 * Convert to Three.js metres.
 */
export const FACE_CM_TO_M = 0.01;

/** Head-local Shift (m). +X is the subject's right before Flip L/R. */
export const FACE_FRONT_SHIFT_M = 0;
/** Head-local Lift (m). Positive is toward the forehead. */
export const FACE_FRONT_LIFT_M = 0.141;
/**
 * Distance behind the face front, along canonical −Z into the skull (m).
 * MediaPipe's metric camera looks down −Z; the face looks toward the
 * camera, so +Z is out of the nose and Inset is −Z.
 */
export const FACE_FRONT_INSET_M = 0.05;

export const FACE_SHIFT_MM_MIN = -80;
export const FACE_SHIFT_MM_MAX = 80;
export const FACE_LIFT_MM_MIN = -80;
export const FACE_LIFT_MM_MAX = 160;
export const FACE_INSET_MM_MIN = 0;
export const FACE_INSET_MM_MAX = 80;

function clampInt(n, lo, hi, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

function defaultShiftMm() {
  return Math.round(FACE_FRONT_SHIFT_M * 1000);
}

function defaultLiftMm() {
  return Math.round(FACE_FRONT_LIFT_M * 1000);
}

function defaultInsetMm() {
  return Math.round(FACE_FRONT_INSET_M * 1000);
}

/** Integer millimetres + Size, clamped to the Face AR sliders. */
export function facePlacementFromMm({
  shift,
  lift,
  inset,
  mag,
} = {}) {
  const size = Number(mag);
  return {
    shift: clampInt(shift, FACE_SHIFT_MM_MIN, FACE_SHIFT_MM_MAX, defaultShiftMm()),
    lift: clampInt(lift, FACE_LIFT_MM_MIN, FACE_LIFT_MM_MAX, defaultLiftMm()),
    inset: clampInt(inset, FACE_INSET_MM_MIN, FACE_INSET_MM_MAX, defaultInsetMm()),
    mag: clampFaceMag(Number.isFinite(size) ? size : FACE_MAG_DEFAULT),
  };
}

export function facePlacementFromCalib(calib = {}, mag = FACE_MAG_DEFAULT) {
  const off = calib.offset || FACE_DEFAULT_OFFSET;
  return facePlacementFromMm({
    shift: Number(off.x) * 1000,
    lift: Number(off.y) * 1000,
    inset: -Number(off.z) * 1000,
    mag,
  });
}

/** Write non-default placement onto a URLSearchParams (Face door only). */
export function writeFacePlacementParams(params, placement) {
  if (!params || !placement) return;
  const p = facePlacementFromMm(placement);
  if (p.shift !== defaultShiftMm()) params.set("shift", String(p.shift));
  if (p.lift !== defaultLiftMm()) params.set("lift", String(p.lift));
  if (p.inset !== defaultInsetMm()) params.set("inset", String(p.inset));
  if (p.mag !== FACE_MAG_DEFAULT) {
    params.set("size", String(Math.round(p.mag * 100) / 100));
  }
}

export function readFacePlacementParams(searchParams) {
  const q = searchParams;
  if (!q || typeof q.get !== "function") return facePlacementFromMm({});
  return facePlacementFromMm({
    shift: q.has("shift") ? q.get("shift") : defaultShiftMm(),
    lift: q.has("lift") ? q.get("lift") : defaultLiftMm(),
    inset: q.has("inset") ? q.get("inset") : defaultInsetMm(),
    mag: q.get("size") || q.get("mag") || FACE_MAG_DEFAULT,
  });
}

/** Head-local offset (metres) from Shift / Lift / Inset. */
export function offsetFromFaceFront({
  shift = FACE_FRONT_SHIFT_M,
  lift = FACE_FRONT_LIFT_M,
  inset = FACE_FRONT_INSET_M,
} = {}) {
  const s = Number(shift);
  const l = Number(lift);
  const i = Number(inset);
  return {
    x: Number.isFinite(s) ? s : FACE_FRONT_SHIFT_M,
    y: Number.isFinite(l) ? l : FACE_FRONT_LIFT_M,
    z: -(Number.isFinite(i) ? i : FACE_FRONT_INSET_M),
  };
}

/** Default local offset: toward the forehead and behind the face. */
export const FACE_DEFAULT_OFFSET = Object.freeze(offsetFromFaceFront());

export function clampFaceMag(mag) {
  const m = Number(mag);
  if (!Number.isFinite(m) || m <= 0) return FACE_MAG_DEFAULT;
  return Math.min(FACE_MAG_MAX, Math.max(FACE_MAG_MIN, m));
}

export function faceExtentCells(width = 32, height = 32, timeCells = 1) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const t = Math.max(1, timeCells | 0);
  return Math.max(w, h, t);
}

/** Scale so `extentCells` of `cellSize` span FACE_SKULL_M × mag. */
export function faceStageScale(
  cellSize = 1,
  mag = FACE_MAG_DEFAULT,
  extentCells = 32,
) {
  const cs = Number(cellSize);
  const size = Number.isFinite(cs) && cs > 0 ? cs : 1;
  const ext = Number(extentCells);
  const cells = Number.isFinite(ext) && ext > 0 ? ext : 32;
  return (FACE_SKULL_M / (cells * size)) * clampFaceMag(mag);
}

export function normalizeOffset(offset) {
  return {
    x: Number.isFinite(Number(offset?.x)) ? Number(offset.x) : FACE_DEFAULT_OFFSET.x,
    y: Number.isFinite(Number(offset?.y)) ? Number(offset.y) : FACE_DEFAULT_OFFSET.y,
    z: Number.isFinite(Number(offset?.z)) ? Number(offset.z) : FACE_DEFAULT_OFFSET.z,
  };
}

/**
 * Head pose (cm, camera space) × face-front offset (m, head local) × volume scale.
 * `flipLR` mirrors the local X offset and the stage X scale (selfie planes).
 */
export function composeFaceStage(headPose, calib = {}) {
  const q = headPose?.quaternion || { x: 0, y: 0, z: 0, w: 1 };
  const off = normalizeOffset(calib.offset);
  const flip = calib.flipLR ? -1 : 1;
  const local = { x: off.x * flip, y: off.y, z: off.z };
  const worldOff = rotateVecByQuat(local, q);
  const unit = Number.isFinite(Number(calib.unit)) ? Number(calib.unit) : FACE_CM_TO_M;
  const scale = Number(calib.scale);
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    position: {
      x: Number(headPose?.position?.x || 0) * unit + worldOff.x,
      y: Number(headPose?.position?.y || 0) * unit + worldOff.y,
      z: Number(headPose?.position?.z || 0) * unit + worldOff.z,
    },
    quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    scale: s,
    flipLR: flip,
  };
}

export const FACE_AR_SOURCE = "mni152-low";
export const FACE_AR_SOURCE_FALLBACK = "mni152";

export function isFaceProjectSource(kind) {
  return kind === FACE_AR_SOURCE || kind === FACE_AR_SOURCE_FALLBACK;
}

export function faceArSourceId(demos = {}) {
  if (demos[FACE_AR_SOURCE]) return FACE_AR_SOURCE;
  if (demos[FACE_AR_SOURCE_FALLBACK]) return FACE_AR_SOURCE_FALLBACK;
  return FACE_AR_SOURCE;
}
