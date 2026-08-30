/**
 * Source-agnostic space-time event buffer.
 *
 * Events are a structure-of-arrays the renderer understands:
 *   x, y  spatial
 *   t     time (generation or timestamp)
 *   v     value (Conway: 1; later events: polarity)
 *
 * Conway writes generation slices into a ring. A later event-camera
 * adapter can fill the same SoA without touching the renderer.
 */

import { collectLive } from "./conway.js";
import { KIND_TRANSIT, kindAt, stabilityAge } from "./dynamics.js";

export class EventSoA {
  constructor(capacity) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.t = new Float32Array(capacity);
    this.v = new Float32Array(capacity);
    this.k = new Float32Array(capacity);
    this.s = new Float32Array(capacity);
    this.count = 0;
    this.truncated = false;
  }
}

/** First event at `(x, y, t)`, or null. */
export function eventAt(soa, x, y, t) {
  const n = soa.count;
  for (let i = 0; i < n; i++) {
    if (soa.x[i] === x && soa.y[i] === y && soa.t[i] === t) {
      return { k: soa.k[i] | 0, s: soa.s[i] };
    }
  }
  return null;
}

class Slice {
  constructor(maxCells) {
    this.t = 0;
    this.count = 0;
    this.x = new Uint16Array(maxCells);
    this.y = new Uint16Array(maxCells);
  }
}

export class GenerationRing {
  /**
   * @param {number} capacity max stored generations
   * @param {number} maxCells live cells per generation (width * height)
   */
  constructor(capacity, maxCells) {
    this.capacity = capacity;
    this.maxCells = maxCells;
    this.slices = Array.from({ length: capacity }, () => new Slice(maxCells));
    this.head = 0;
    this.size = 0;
  }

  clear() {
    this.head = 0;
    this.size = 0;
  }

  pushGrid(grid, width, height, t) {
    const sl = this.slices[this.head];
    sl.t = t;
    sl.count = collectLive(grid, width, height, sl.x, sl.y);
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  liveAt(t) {
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.slices[idx].t === t) return this.slices[idx].count;
    }
    return 0;
  }

  /** Overwrite the slice for generation `t` (paint on the now-plane). */
  replaceGrid(grid, width, height, t) {
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.slices[idx].t === t) {
        const sl = this.slices[idx];
        sl.count = collectLive(grid, width, height, sl.x, sl.y);
        return;
      }
    }
    this.pushGrid(grid, width, height, t);
  }

  /**
   * Newest-first fill so the present is never dropped when SoA capacity hits.
   * `width` is needed to classify (x, y) worldlines; omit to skip (k = transit).
   * @param {number} [width]
   * @param {{
   *   tFocus?: number,
   *   stabMode?: "none" | "time" | "focus",
   *   height?: number,
   *   wrap?: boolean,
   * }} [opts]
   */
  fillSoA(soa, tRef, window, width = 0, opts = {}) {
    const tMin = tRef - window;
    const tFocus = opts.tFocus ?? tRef;
    const stabMode = opts.stabMode || "none";
    const project = stabMode === "focus";
    const useStab = stabMode === "time" || stabMode === "focus";
    const bounds =
      width > 0
        ? {
            width,
            height: opts.height || width,
            wrap: opts.wrap !== false,
          }
        : null;
    const byGen = new Map();
    if (width > 0) {
      for (let i = 0; i < this.size; i++) {
        const idx = (this.head - 1 - i + this.capacity) % this.capacity;
        const sl = this.slices[idx];
        const set = new Set();
        for (let k = 0; k < sl.count; k++) {
          set.add(sl.y[k] * width + sl.x[k]);
        }
        byGen.set(sl.t, set);
      }
    }
    const isLive = (t, packed) => {
      const set = byGen.get(t);
      return !!(set && set.has(packed));
    };
    const projCache = new Map();
    const stabAt = (t, packed) => {
      if (project) {
        if (!projCache.has(packed)) {
          projCache.set(packed, stabilityAge(tFocus, packed, isLive, undefined, bounds));
        }
        return projCache.get(packed);
      }
      return stabilityAge(t, packed, isLive, undefined, bounds);
    };

    let n = 0;
    let truncated = false;
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const sl = this.slices[idx];
      if (sl.t < tMin) break;
      for (let c = 0; c < sl.count; c++) {
        if (n >= soa.capacity) {
          truncated = true;
          soa.count = n;
          soa.truncated = true;
          return soa;
        }
        const x = sl.x[c];
        const y = sl.y[c];
        soa.x[n] = x;
        soa.y[n] = y;
        soa.t[n] = sl.t;
        soa.v[n] = 1;
        if (width > 0) {
          const packed = y * width + x;
          soa.k[n] = kindAt(sl.t, packed, isLive, bounds);
          soa.s[n] = useStab ? stabAt(sl.t, packed) : 0;
        } else {
          soa.k[n] = KIND_TRANSIT;
          soa.s[n] = 0;
        }
        n += 1;
      }
    }
    soa.count = n;
    soa.truncated = truncated;
    return soa;
  }
}
