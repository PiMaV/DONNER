/**
 * Event-camera count cube → EventSoA.
 *
 * EVT `counts` send-as is a gray `(T, H, W)` or `(T, H, W, 1)` uint16
 * stack: events per pixel per Δt. A trailing ON/OFF pair `(T, H, W, 2)`
 * is summed to activity. Zeros are empty (no cube). `v` is the integer
 * count; `k` is that count clipped to the volume ceiling (color rung).
 */

import { MAX_STAB_GENS } from "./dynamics.js";
import { parseNpy } from "./npy.js";
import { visibleTimeSpan } from "./spacetime.js";

export const COUNT_LUT_CAP = 32;

/** Occupancy above this is a dense brick (MRI), not a sparse event cloud. */
export const DENSE_OCCUPANCY = 0.15;

/** Inclusive slice count for the auto Inspect window on a dense cube. */
export const DENSE_SLAB_SLICES = 8;

export function countOccupancy(vol) {
  const cells = (vol.width | 0) * (vol.height | 0) * (vol.nT | 0);
  if (cells <= 0) return 0;
  return vol.count / cells;
}

export function isDenseCount(vol) {
  return Boolean(vol) && countOccupancy(vol) > DENSE_OCCUPANCY;
}

/**
 * Mid-volume Inspect slab as stack back-offsets (Now = 0).
 * `slices` is inclusive (8 → far-near = 7).
 */
export function denseSlabBacks(vol, slices = DENSE_SLAB_SLICES) {
  const max = Math.max(0, (vol.newestT() | 0) - (vol.oldestT() | 0));
  const thick = Math.min(max, Math.max(0, (slices | 0) - 1));
  const midT = ((vol.oldestT() | 0) + (vol.newestT() | 0)) >> 1;
  let foc = Math.min(max, Math.max(0, (vol.newestT() | 0) - midT));
  let near = Math.max(0, foc - (thick >> 1));
  let far = near + thick;
  if (far > max) {
    far = max;
    near = Math.max(0, far - thick);
  }
  if (foc < near) foc = near;
  if (foc > far) foc = far;
  return { nearBack: near, focusBack: foc, farBack: far };
}

/**
 * Translate a dense slab toward Now (`step` < 0) or the past. Wraps at 0
 * to the oldest window so Play walks through the brick.
 */
export function slideDenseSlabBacks(nearBack, focusBack, farBack, maxBack, step = -1) {
  const max = Math.max(0, maxBack | 0);
  const near0 = Math.min(max, Math.max(0, nearBack | 0));
  const far0 = Math.min(max, Math.max(near0, farBack | 0));
  const thick = far0 - near0;
  const focOff = Math.min(thick, Math.max(0, (focusBack | 0) - near0));
  const d = step | 0;
  if (d === 0) {
    return { nearBack: near0, focusBack: near0 + focOff, farBack: far0 };
  }
  let near = near0 + d;
  if (near < 0) near = Math.max(0, max - thick);
  else if (near + thick > max) near = 0;
  return { nearBack: near, focusBack: near + focOff, farBack: near + thick };
}

/**
 * True when all six neighbors are occupied *and* inside the drawn slab.
 * `slice` is `{ axis, lo, hi }` for an X/Y window; Z uses `[tLo, tHi]`.
 * A neighbor outside the slab or empty (air / OOB) means the voxel is visible.
 */
export function countIsEnclosed(occ, width, height, nT, x, y, t, tLo, tHi, slice = null) {
  const w = width | 0;
  const h = height | 0;
  const nt = nT | 0;
  const axis = slice && (slice.axis === "x" || slice.axis === "y") ? slice.axis : "z";
  const sLo = axis === "z" ? tLo : slice.lo | 0;
  const sHi = axis === "z" ? tHi : slice.hi | 0;
  const occAt = (nx, ny, tt) => {
    if (tt < tLo || tt > tHi) return false;
    if (tt < 0 || tt >= nt || nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
    const v = axis === "x" ? nx : axis === "y" ? ny : tt;
    if (v < sLo || v > sHi) return false;
    return occ[(tt * h + ny) * w + nx] !== 0;
  };
  return (
    occAt(x - 1, y, t) &&
    occAt(x + 1, y, t) &&
    occAt(x, y - 1, t) &&
    occAt(x, y + 1, t) &&
    occAt(x, y, t - 1) &&
    occAt(x, y, t + 1)
  );
}

function product(shape) {
  let n = 1;
  for (let i = 0; i < shape.length; i++) n *= shape[i];
  return n;
}

/**
 * Normalize EVT count cubes to `(T, H, W)` with optional channel sum.
 * @param {number[]} shape
 * @returns {{ t: number, h: number, w: number, c: number }}
 */
export function countAxes(shape) {
  if (!shape || shape.length < 3 || shape.length > 4) {
    throw new Error(`count stack must be (T, H, W) or (T, H, W, C), got ${JSON.stringify(shape)}`);
  }
  const t = shape[0] | 0;
  const h = shape[1] | 0;
  const w = shape[2] | 0;
  const c = shape.length === 4 ? shape[3] | 0 : 1;
  if (t < 1 || h < 1 || w < 1 || c < 1) {
    throw new Error(`count stack has an empty axis ${JSON.stringify(shape)}`);
  }
  if (c > 2) {
    throw new Error(`count stack last axis must be 1 or 2 (got ${c})`);
  }
  return { t, h, w, c };
}

export function countCeiling(maxValue) {
  const hi = Math.max(1, maxValue | 0);
  return Math.min(COUNT_LUT_CAP, hi);
}

/**
 * Sparse count volume. Events are stored t-major so a time window is a
 * pair of slice offsets, not a scan of the cube.
 */
export class CountVolume {
  /**
   * @param {{
   *   width: number,
   *   height: number,
   *   nT: number,
   *   x: Uint16Array,
   *   y: Uint16Array,
   *   t: Uint16Array,
   *   v: Uint16Array,
   *   ceiling: number,
   *   name?: string,
   * }} spec
   */
  constructor(spec) {
    this.width = spec.width | 0;
    this.height = spec.height | 0;
    this.nT = spec.nT | 0;
    this.x = spec.x;
    this.y = spec.y;
    this.t = spec.t;
    this.v = spec.v;
    this.count = spec.x.length;
    this.eventCount = this.count;
    this.size = this.nT;
    this.stopped = true;
    this.ceiling = countCeiling(spec.ceiling);
    this.name = spec.name || "count";
    this._off = new Int32Array(this.nT + 1);
    this._live = new Uint32Array(this.nT);
    this._sum = new Float64Array(this.nT);
    let i = 0;
    for (let t = 0; t < this.nT; t++) {
      this._off[t] = i;
      while (i < this.count && this.t[i] === t) {
        this._live[t] += 1;
        this._sum[t] += this.v[i];
        i += 1;
      }
    }
    this._off[this.nT] = this.count;
    const cells = this.nT * this.height * this.width;
    this._occ = new Uint8Array(cells);
    for (let i = 0; i < this.count; i++) {
      const t = this.t[i];
      const y = this.y[i];
      const x = this.x[i];
      this._occ[(t * this.height + y) * this.width + x] = 1;
    }
  }

  oldestT() {
    return 0;
  }

  newestT() {
    return Math.max(0, this.nT - 1);
  }

  liveAt(t) {
    const i = t | 0;
    if (i < 0 || i >= this.nT) return 0;
    return this._live[i];
  }

  sumAt(t) {
    const i = t | 0;
    if (i < 0 || i >= this.nT) return 0;
    return this._sum[i];
  }

  /**
   * Newest-first fill, same windowing as the Conway ring.
   * `s` is a 0…MAX_STAB_GENS stand-in so Stability Time scales with count.
   */
  fillSoA(soa, tRef, window, _width = 0, opts = {}) {
    const tFocus = opts.tFocus ?? tRef;
    const span =
      opts.tLo != null && opts.tHi != null
        ? {
            tLo: Math.max(this.oldestT(), Math.min(opts.tLo | 0, opts.tHi | 0)),
            tHi: Math.min(tRef | 0, Math.max(opts.tLo | 0, opts.tHi | 0)),
          }
        : visibleTimeSpan(tFocus, tRef, this.oldestT(), window);
    const { tLo, tHi } = span;
    const axis = opts.sliceAxis === "x" || opts.sliceAxis === "y" ? opts.sliceAxis : "z";
    const sliceLo = opts.sliceLo == null ? 0 : opts.sliceLo | 0;
    const sliceHi = opts.sliceHi == null
      ? (axis === "x" ? this.width - 1 : axis === "y" ? this.height - 1 : tHi)
      : opts.sliceHi | 0;
    const slice = axis === "z" ? null : { axis, lo: sliceLo, hi: sliceHi };
    const useStab = opts.stabScale !== false && (opts.stabMode === "time" || opts.stabMode === "focus");
    const hi = Math.max(1, this.ceiling);
    let n = 0;
    let truncated = false;
    for (let t = tHi; t >= tLo; t--) {
      const a = this._off[t];
      const b = this._off[t + 1];
      if (a == null || b == null) continue;
      for (let i = a; i < b; i++) {
        const vx = this.x[i];
        const vy = this.y[i];
        if (axis === "x" && (vx < sliceLo || vx > sliceHi)) continue;
        if (axis === "y" && (vy < sliceLo || vy > sliceHi)) continue;
        if (countIsEnclosed(this._occ, this.width, this.height, this.nT, vx, vy, this.t[i], tLo, tHi, slice)) {
          continue;
        }
        if (n >= soa.capacity) {
          truncated = true;
          soa.count = n;
          soa.truncated = true;
          return soa;
        }
        const v = this.v[i];
        soa.x[n] = vx;
        soa.y[n] = vy;
        soa.t[n] = this.t[i];
        soa.v[n] = v;
        soa.k[n] = Math.min(hi, v);
        soa.s[n] = useStab ? (v / hi) * MAX_STAB_GENS : 0;
        n += 1;
      }
    }
    soa.count = n;
    soa.truncated = truncated;
    return soa;
  }
}

/**
 * @param {ArrayLike<number>} data
 * @param {number[]} shape
 * @param {string} [name]
 */
export function countVolumeFromDense(data, shape, name = "count") {
  const { t: nT, h, w, c } = countAxes(shape);
  if (data.length !== product(shape)) {
    throw new Error("count stack length does not match shape");
  }
  const hw = h * w;
  const frame = hw * c;
  let nz = 0;
  let maxV = 0;
  for (let ti = 0; ti < nT; ti++) {
    const base = ti * frame;
    for (let p = 0; p < hw; p++) {
      let v = 0;
      const off = base + p * c;
      for (let ch = 0; ch < c; ch++) {
        const raw = data[off + ch];
        v += raw > 0 ? raw : 0;
      }
      if (v > 0) {
        nz += 1;
        if (v > maxV) maxV = v;
      }
    }
  }
  const x = new Uint16Array(nz);
  const y = new Uint16Array(nz);
  const t = new Uint16Array(nz);
  const vArr = new Uint16Array(nz);
  let n = 0;
  for (let ti = 0; ti < nT; ti++) {
    const base = ti * frame;
    for (let yi = 0; yi < h; yi++) {
      const row = base + yi * w * c;
      for (let xi = 0; xi < w; xi++) {
        let v = 0;
        const off = row + xi * c;
        for (let ch = 0; ch < c; ch++) {
          const raw = data[off + ch];
          v += raw > 0 ? raw : 0;
        }
        if (v <= 0) continue;
        x[n] = xi;
        y[n] = yi;
        t[n] = ti;
        vArr[n] = v > 0xffff ? 0xffff : v;
        n += 1;
      }
    }
  }
  return new CountVolume({
    width: w,
    height: h,
    nT,
    x,
    y,
    t,
    v: vArr,
    ceiling: maxV,
    name,
  });
}

/**
 * @param {ArrayBuffer | Uint8Array} raw
 * @param {string} [name]
 */
export function countVolumeFromNpy(raw, name = "count") {
  const parsed = parseNpy(raw);
  return countVolumeFromDense(parsed.data, parsed.shape, name);
}
