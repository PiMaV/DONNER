/**
 * Event-camera count cube → EventSoA.
 *
 * EVT `counts` send-as is a gray `(T, H, W)` or `(T, H, W, 1)` uint16
 * stack: events per pixel per Δt. A trailing ON/OFF pair `(T, H, W, 2)`
 * is summed to activity. Zeros are empty (no cube). `v` is the integer
 * count; `k` is that count clipped to the volume ceiling (color rung).
 */

import { MAX_STAB_GENS } from "./dynamics.js";
import {
  inAabb,
  normalizeShadeMode,
  normalizeSliceAxis,
  shouldEmitVoxel,
} from "./axes.js";
import { parseNpy } from "./npy.js";
import { visibleTimeSpan } from "./spacetime.js";

export const COUNT_LUT_CAP = 32;

/** Occupancy above this is a dense brick (MRI), not a sparse event cloud. */
export const DENSE_OCCUPANCY = 0.15;

export function countOccupancy(vol) {
  const cells = (vol.width | 0) * (vol.height | 0) * (vol.nT | 0);
  if (cells <= 0) return 0;
  return vol.count / cells;
}

export function isDenseCount(vol) {
  return Boolean(vol) && countOccupancy(vol) > DENSE_OCCUPANCY;
}

/** True when the crop is the whole brick (idle Hull / Ghost, no clip). */
export function countAabbCoversVolume(aabb, width, height, nT) {
  if (!aabb) return true;
  const w = Math.max(0, (width | 0) - 1);
  const h = Math.max(0, (height | 0) - 1);
  const tLast = Math.max(0, (nT | 0) - 1);
  return (
    (aabb.xLo == null || (aabb.xLo | 0) <= 0) &&
    (aabb.xHi == null || (aabb.xHi | 0) >= w) &&
    (aabb.yLo == null || (aabb.yLo | 0) <= 0) &&
    (aabb.yHi == null || (aabb.yHi | 0) >= h) &&
    (aabb.tLo == null || (aabb.tLo | 0) <= 0) &&
    (aabb.tHi == null || (aabb.tHi | 0) >= tLast)
  );
}

/**
 * True when all six neighbors are occupied *and* inside the AABB crop.
 * A neighbor outside the crop or empty (air / OOB) means the voxel is on the hull.
 */
export function countIsEnclosed(occ, width, height, nT, x, y, t, aabb) {
  const w = width | 0;
  const h = height | 0;
  const nt = nT | 0;
  const box = aabb || {};
  const occAt = (nx, ny, tt) => {
    if (!inAabb(nx, ny, tt, box)) return false;
    if (tt < 0 || tt >= nt || nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
    return occ[(tt * h + ny) * w + nx] !== 0;
  };
  return (
    occAt(x - 1, y, t) &&
    occAt(x + 1, y, t) &&
    occAt(x, y - 1, t) &&
    occAt(x, y + 1, t) &&
    occAt(x, y, t + 1) &&
    occAt(x, y, t - 1)
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
    const full = {
      xLo: 0,
      xHi: this.width - 1,
      yLo: 0,
      yHi: this.height - 1,
      tLo: 0,
      tHi: this.nT - 1,
    };
    const hull = [];
    for (let i = 0; i < this.count; i++) {
      if (
        !countIsEnclosed(
          this._occ,
          this.width,
          this.height,
          this.nT,
          this.x[i],
          this.y[i],
          this.t[i],
          full,
        )
      ) {
        hull.push(i);
      }
    }
    this._hull = Int32Array.from(hull);
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
   * Event index at (x, y, t). Slices are t-major, then y, then x
   * (countVolumeFromDense raster).
   */
  eventIndexAt(x, y, t) {
    const tt = t | 0;
    if (tt < 0 || tt >= this.nT) return -1;
    const packed = (y | 0) * this.width + (x | 0);
    let lo = this._off[tt];
    let hi = this._off[tt + 1] - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const mp = this.y[mid] * this.width + this.x[mid];
      if (mp === packed) return mid;
      if (mp < packed) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /**
   * Occupied event indices on one playhead plane. When `enclosedOnly`,
   * hull voxels on that plane are omitted (Ghost extras).
   */
  _planeIndices(aabb, axis, focus, into, enclosedOnly = false) {
    const a = normalizeSliceAxis(axis);
    const f = focus | 0;
    const w = this.width;
    const h = this.height;
    const occ = this._occ;
    const tLo = aabb.tLo | 0;
    const tHi = aabb.tHi | 0;
    const yLo = aabb.yLo | 0;
    const yHi = aabb.yHi | 0;
    const xLo = aabb.xLo | 0;
    const xHi = aabb.xHi | 0;
    const keep = (x, y, t) =>
      !enclosedOnly || countIsEnclosed(occ, w, h, this.nT, x, y, t, aabb);
    if (a === "z") {
      if (f < tLo || f > tHi) return;
      const begin = this._off[f];
      const end = this._off[f + 1];
      for (let i = begin; i < end; i++) {
        const vx = this.x[i];
        const vy = this.y[i];
        if (vx < xLo || vx > xHi || vy < yLo || vy > yHi) continue;
        if (keep(vx, vy, f)) into.push(i);
      }
      return;
    }
    if (a === "x") {
      if (f < xLo || f > xHi) return;
      for (let t = tHi; t >= tLo; t--) {
        for (let y = yLo; y <= yHi; y++) {
          if (occ[(t * h + y) * w + f] === 0) continue;
          if (!keep(f, y, t)) continue;
          const i = this.eventIndexAt(f, y, t);
          if (i >= 0) into.push(i);
        }
      }
      return;
    }
    if (f < yLo || f > yHi) return;
    for (let t = tHi; t >= tLo; t--) {
      for (let x = xLo; x <= xHi; x++) {
        if (occ[(t * h + f) * w + x] === 0) continue;
        if (!keep(x, f, t)) continue;
        const i = this.eventIndexAt(x, f, t);
        if (i >= 0) into.push(i);
      }
    }
  }

  _enclosedOnAxis(aabb, axis, focus, into) {
    this._planeIndices(aabb, axis, focus, into, true);
  }

  _hullHas(index) {
    const hull = this._hull;
    if (!hull || hull.length === 0) return false;
    const i = index | 0;
    let lo = 0;
    let hi = hull.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = hull[mid];
      if (v === i) return true;
      if (v < i) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  }

  /**
   * Occupied voxels on the AABB faces that were interior in the full brick.
   * Together with `_hull ∩ aabb` this is the crop hull, without scanning
   * the enclosed interior.
   */
  _emitAabbFaceCuts(aabb, emit) {
    const xLo = aabb.xLo | 0;
    const xHi = aabb.xHi | 0;
    const yLo = aabb.yLo | 0;
    const yHi = aabb.yHi | 0;
    const tLo = aabb.tLo | 0;
    const tHi = aabb.tHi | 0;
    const w = this.width;
    const h = this.height;
    const occ = this._occ;
    let ok = true;
    const visit = (x, y, t) => {
      if (!ok) return;
      if (x < xLo || x > xHi || y < yLo || y > yHi || t < tLo || t > tHi) return;
      if (x < 0 || y < 0 || t < 0 || x >= w || y >= h || t >= this.nT) return;
      if (occ[(t * h + y) * w + x] === 0) return;
      const i = this.eventIndexAt(x, y, t);
      if (i < 0 || this._hullHas(i)) return;
      if (!emit(i)) ok = false;
    };
    const xs = xLo === xHi ? [xLo] : [xLo, xHi];
    for (let k = 0; k < xs.length; k++) {
      const x = xs[k];
      for (let t = tHi; t >= tLo; t--) {
        for (let y = yLo; y <= yHi; y++) visit(x, y, t);
      }
    }
    const ys = yLo === yHi ? [yLo] : [yLo, yHi];
    for (let k = 0; k < ys.length; k++) {
      const y = ys[k];
      for (let t = tHi; t >= tLo; t--) {
        for (let x = xLo; x <= xHi; x++) {
          if (x === xLo || x === xHi) continue;
          visit(x, y, t);
        }
      }
    }
    const ts = tLo === tHi ? [tLo] : [tLo, tHi];
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k];
      for (let y = yLo; y <= yHi; y++) {
        if (y === yLo || y === yHi) continue;
        for (let x = xLo; x <= xHi; x++) {
          if (x === xLo || x === xHi) continue;
          visit(x, y, t);
        }
      }
    }
    return ok;
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
    const src = opts.aabb || {};
    const aabb = {
      xLo: src.xLo == null ? (opts.xLo == null ? 0 : opts.xLo | 0) : src.xLo | 0,
      xHi: src.xHi == null ? (opts.xHi == null ? this.width - 1 : opts.xHi | 0) : src.xHi | 0,
      yLo: src.yLo == null ? (opts.yLo == null ? 0 : opts.yLo | 0) : src.yLo | 0,
      yHi: src.yHi == null ? (opts.yHi == null ? this.height - 1 : opts.yHi | 0) : src.yHi | 0,
      tLo: Math.max(tLo, src.tLo == null ? tLo : src.tLo | 0),
      tHi: Math.min(tHi, src.tHi == null ? tHi : src.tHi | 0),
    };
    const foci = opts.foci || { x: -1, y: -1, z: tFocus };
    const shade = normalizeShadeMode(opts.shade || "hull");
    const activeAxis = opts.activeAxis || "z";
    const useStab = opts.stabScale !== false && (opts.stabMode === "time" || opts.stabMode === "focus");
    const hi = Math.max(1, this.ceiling);
    let n = 0;
    let truncated = false;
    const emit = (i) => {
      if (n >= soa.capacity) {
        truncated = true;
        return false;
      }
      const v = this.v[i];
      soa.x[n] = this.x[i];
      soa.y[n] = this.y[i];
      soa.t[n] = this.t[i];
      soa.v[n] = v;
      soa.k[n] = Math.min(hi, v);
      soa.s[n] = useStab ? (v / hi) * MAX_STAB_GENS : 0;
      n += 1;
      return true;
    };

    const finish = () => {
      soa.count = n;
      soa.truncated = truncated;
      return soa;
    };

    if (this._hull) {
      const cutsOnly = shade === "slice" || shade === "triple";
      if (!cutsOnly) {
        for (let h = this._hull.length - 1; h >= 0; h--) {
          const i = this._hull[h];
          if (!inAabb(this.x[i], this.y[i], this.t[i], aabb)) continue;
          if (!emit(i)) return finish();
        }
        if (!countAabbCoversVolume(aabb, this.width, this.height, this.nT)) {
          if (!this._emitAabbFaceCuts(aabb, emit)) return finish();
        }
        if (shade === "hull") return finish();
      }
      const extra = [];
      if (shade === "ghost") {
        this._enclosedOnAxis(aabb, activeAxis, foci[normalizeSliceAxis(activeAxis)], extra);
      } else if (shade === "slice") {
        this._planeIndices(aabb, activeAxis, foci[normalizeSliceAxis(activeAxis)], extra, false);
      } else {
        const seen = new Set();
        const tmp = [];
        this._planeIndices(aabb, "x", foci.x, tmp, false);
        this._planeIndices(aabb, "y", foci.y, tmp, false);
        this._planeIndices(aabb, "z", foci.z, tmp, false);
        for (const i of tmp) {
          if (seen.has(i)) continue;
          seen.add(i);
          extra.push(i);
        }
      }
      for (const i of extra) {
        if (!emit(i)) return finish();
      }
      return finish();
    }

    for (let t = aabb.tHi; t >= aabb.tLo; t--) {
      const a = this._off[t];
      const b = this._off[t + 1];
      if (a == null || b == null) continue;
      for (let i = a; i < b; i++) {
        const vx = this.x[i];
        const vy = this.y[i];
        const vt = this.t[i];
        if (!inAabb(vx, vy, vt, aabb)) continue;
        const enclosed = countIsEnclosed(
          this._occ,
          this.width,
          this.height,
          this.nT,
          vx,
          vy,
          vt,
          aabb,
        );
        if (
          !shouldEmitVoxel(vx, vy, vt, {
            aabb,
            foci,
            shade,
            activeAxis,
            isHull: !enclosed,
          })
        ) {
          continue;
        }
        if (!emit(i)) return finish();
      }
    }
    return finish();
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
