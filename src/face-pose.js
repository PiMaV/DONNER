/**
 * Face-AR pose math. Node tests do not need a camera or MediaPipe.
 * MediaPipe Face Landmarker matrices are row-major 4×4 (affine, cm).
 */

export const FACE_FREEZE_FRAMES = 4;
export const FACE_LOCK_MS = 700;
export const FACE_MIN_CONFIDENCE = 0.5;
export const FACE_DETECT_MS = 40;

const IDENTITY_Q = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function identityQuat() {
  return { x: 0, y: 0, z: 0, w: 1 };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function floats16(matrix) {
  if (!matrix) return null;
  if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) {
    return matrix.length >= 16 ? matrix : null;
  }
  const data = matrix.data;
  if (!data || data.length < 16) return null;
  return data;
}

/** Row-major 4×4 → column-major (Three.js / WebXR). */
export function rowMajorToColumnMajor(row) {
  const d = floats16(row);
  if (!d) return null;
  return [
    d[0], d[4], d[8], d[12],
    d[1], d[5], d[9], d[13],
    d[2], d[6], d[10], d[14],
    d[3], d[7], d[11], d[15],
  ];
}

/**
 * MediaPipe Tasks may pack the affine as row-major (last *row* is
 * translation) or column-major (last *column*). `rows: 4` is not a
 * layout signal. Prefer an explicit `layout` / `columnMajor` flag,
 * otherwise pick the packing whose translation vector is larger.
 */
export function isRowMajorFaceMatrix(matrix, data) {
  const layout = String(matrix?.layout || "").toUpperCase().replace(/-/g, "_");
  if (layout === "ROW_MAJOR" || matrix?.rowMajor) return true;
  if (layout === "COLUMN_MAJOR" || matrix?.columnMajor) return false;
  const d = data || floats16(matrix);
  if (!d) return false;
  const rowT = Math.hypot(num(d[3]), num(d[7]), num(d[11]));
  const colT = Math.hypot(num(d[12]), num(d[13]), num(d[14]));
  return rowT > colT;
}

export function columnMajorFromFaceMatrix(matrix) {
  const d = floats16(matrix);
  if (!d) return null;
  if (isRowMajorFaceMatrix(matrix, d)) return rowMajorToColumnMajor(d);
  return Array.from(d);
}

function quatFromRotationCols(c0, c1, c2) {
  const m00 = c0[0];
  const m10 = c0[1];
  const m20 = c0[2];
  const m01 = c1[0];
  const m11 = c1[1];
  const m21 = c1[2];
  const m02 = c2[0];
  const m12 = c2[1];
  const m22 = c2[2];
  const trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

function colLen(m, i) {
  const x = num(m[i]);
  const y = num(m[i + 1]);
  const z = num(m[i + 2]);
  return Math.hypot(x, y, z);
}

/**
 * Decompose a column-major 4×4 into pose.
 * Scale is the mean of the 3×3 column lengths.
 */
export function poseFromColumnMajor(m, confidence = 1) {
  if (!m || m.length < 16) return null;
  const sx = colLen(m, 0) || 1;
  const sy = colLen(m, 4) || 1;
  const sz = colLen(m, 8) || 1;
  const c0 = [num(m[0]) / sx, num(m[1]) / sx, num(m[2]) / sx];
  const c1 = [num(m[4]) / sy, num(m[5]) / sy, num(m[6]) / sy];
  const c2 = [num(m[8]) / sz, num(m[9]) / sz, num(m[10]) / sz];
  const q = quatFromRotationCols(c0, c1, c2);
  const conf = num(confidence, 1);
  return {
    position: { x: num(m[12]), y: num(m[13]), z: num(m[14]) },
    quaternion: q,
    scale: (sx + sy + sz) / 3,
    confidence: conf > 0 ? conf : 0,
  };
}

export function poseFromFaceMatrix(matrix, confidence = 1) {
  const m = columnMajorFromFaceMatrix(matrix);
  if (!m) return null;
  return poseFromColumnMajor(m, confidence);
}

export function poseFromLandmarkerResult(result) {
  const faces = result?.facialTransformationMatrixes;
  if (!faces || !faces.length) return null;
  const landmarks = result.faceLandmarks;
  const conf = landmarks && landmarks[0] && landmarks[0].length ? 1 : 1;
  return poseFromFaceMatrix(faces[0], conf);
}

/** Reflect pose through the YZ plane so a CSS-unmirrored overlay matches a selfie video. */
export function mirrorPoseX(pose) {
  if (!pose) return null;
  const q = pose.quaternion || IDENTITY_Q;
  return {
    position: {
      x: -num(pose.position?.x),
      y: num(pose.position?.y),
      z: num(pose.position?.z),
    },
    quaternion: { x: num(q.x), y: -num(q.y), z: -num(q.z), w: num(q.w, 1) },
    scale: num(pose.scale, 1),
    confidence: num(pose.confidence, 1),
  };
}

function alphaFromCutoff(dt, cutoff) {
  const tau = 1 / (2 * Math.PI * Math.max(1e-6, cutoff));
  return 1 / (1 + tau / Math.max(1e-6, dt));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createOneEuro(minCutoff = 1, beta = 0, dCutoff = 1) {
  let xPrev = null;
  let dxPrev = 0;
  let tPrev = null;
  return {
    reset() {
      xPrev = null;
      dxPrev = 0;
      tPrev = null;
    },
    filter(x, tMs) {
      const xN = num(x);
      const t = num(tMs) / 1000;
      if (xPrev == null) {
        xPrev = xN;
        tPrev = t;
        return xN;
      }
      const dt = Math.max(1e-4, t - tPrev);
      tPrev = t;
      const dx = (xN - xPrev) / dt;
      const aD = alphaFromCutoff(dt, dCutoff);
      dxPrev = lerp(dxPrev, dx, aD);
      const cutoff = minCutoff + beta * Math.abs(dxPrev);
      const a = alphaFromCutoff(dt, cutoff);
      xPrev = lerp(xPrev, xN, a);
      return xPrev;
    },
  };
}

export function quatDot(a, b) {
  return num(a?.x) * num(b?.x) + num(a?.y) * num(b?.y) + num(a?.z) * num(b?.z) + num(a?.w, 1) * num(b?.w, 1);
}

export function quatNlerp(a, b, t) {
  const k = Math.min(1, Math.max(0, num(t)));
  let bx = num(b?.x);
  let by = num(b?.y);
  let bz = num(b?.z);
  let bw = num(b?.w, 1);
  if (quatDot(a, b) < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  const x = lerp(num(a?.x), bx, k);
  const y = lerp(num(a?.y), by, k);
  const z = lerp(num(a?.z), bz, k);
  const w = lerp(num(a?.w, 1), bw, k);
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

export function createPoseFilter({
  translate = { minCutoff: 0.7, beta: 0.04, dCutoff: 1 },
  rotate = { minCutoff: 1.4, beta: 0.08, dCutoff: 1 },
  scale = { minCutoff: 0.25, beta: 0.01, dCutoff: 1 },
} = {}) {
  const fx = createOneEuro(translate.minCutoff, translate.beta, translate.dCutoff);
  const fy = createOneEuro(translate.minCutoff, translate.beta, translate.dCutoff);
  const fz = createOneEuro(translate.minCutoff, translate.beta, translate.dCutoff);
  const fs = createOneEuro(scale.minCutoff, scale.beta, scale.dCutoff);
  let qPrev = null;
  let tPrev = null;
  const rotMin = rotate.minCutoff;
  const rotBeta = rotate.beta;
  return {
    reset() {
      fx.reset();
      fy.reset();
      fz.reset();
      fs.reset();
      qPrev = null;
      tPrev = null;
    },
    push(pose, tMs) {
      if (!pose) return null;
      const t = num(tMs);
      const px = fx.filter(pose.position.x, t);
      const py = fy.filter(pose.position.y, t);
      const pz = fz.filter(pose.position.z, t);
      const sc = fs.filter(pose.scale, t);
      let q = pose.quaternion || identityQuat();
      if (qPrev) {
        const dt = Math.max(1e-4, (t - (tPrev || t)) / 1000);
        const dot = Math.min(1, Math.abs(quatDot(qPrev, q)));
        const ang = Math.acos(dot) * 2;
        const speed = ang / dt;
        const cutoff = rotMin + rotBeta * speed;
        const a = alphaFromCutoff(dt, cutoff);
        q = quatNlerp(qPrev, q, a);
      }
      qPrev = q;
      tPrev = t;
      return {
        position: { x: px, y: py, z: pz },
        quaternion: q,
        scale: sc,
        confidence: num(pose.confidence, 1),
      };
    },
  };
}

function copyPose(pose) {
  if (!pose) return null;
  return {
    position: { x: pose.position.x, y: pose.position.y, z: pose.position.z },
    quaternion: {
      x: pose.quaternion.x,
      y: pose.quaternion.y,
      z: pose.quaternion.z,
      w: pose.quaternion.w,
    },
    scale: pose.scale,
    confidence: pose.confidence,
  };
}

/**
 * Confidence gate, One-Euro. Before lock: freeze a few missed frames, then drop.
 * After lock: keep the last pose until Recapture (no second tracker).
 */
export function createFaceTracker({
  freezeFrames = FACE_FREEZE_FRAMES,
  lockMs = FACE_LOCK_MS,
  minConfidence = FACE_MIN_CONFIDENCE,
} = {}) {
  const filter = createPoseFilter();
  let lost = 0;
  let last = null;
  let locked = false;
  let trackStart = null;
  return {
    get locked() {
      return locked;
    },
    reset() {
      filter.reset();
      lost = 0;
      last = null;
      locked = false;
      trackStart = null;
    },
    unlock() {
      locked = false;
      trackStart = null;
    },
    push(raw, tMs) {
      const t = num(tMs);
      const ok = Boolean(raw && num(raw.confidence, 1) >= minConfidence);
      if (!ok) {
        lost += 1;
        if (last && (locked || lost <= freezeFrames)) {
          return { pose: copyPose(last), locked, frozen: true, lost: false };
        }
        return { pose: null, locked, frozen: false, lost: true };
      }
      lost = 0;
      const smoothed = filter.push(raw, t);
      last = smoothed;
      if (!locked) {
        if (trackStart == null) trackStart = t;
        if (t - trackStart >= lockMs) locked = true;
      }
      return { pose: copyPose(smoothed), locked, frozen: false, lost: false };
    },
  };
}

