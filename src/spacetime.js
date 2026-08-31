/**
 * Source-agnostic space-time event buffer.
 *
 * Events are a structure-of-arrays the renderer understands:
 *   x, y  spatial
 *   t     time (generation or timestamp)
 *   v     value (Conway: 1; later events: polarity)
 *
 * Conway writes generation slices into a wake ring (live view) and an
 * append-only RAM tape (proto-file). A later event-camera adapter can
 * fill the same SoA without touching the renderer.
 */

import { collectLive } from "./conway.js";
import { KIND_TRANSIT, kindAt, kindOptsRadius, stabilityAge } from "./dynamics.js";

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

/**
 * Contiguous generation span of at most `window` slices that includes
 * `tFocus`, clipped to [tOldest, tNow]. Stays anchored at Now while
 * the playhead still fits, then slides so the focus stays inside.
 */
export function visibleTimeSpan(tFocus, tNow, tOldest, window) {
  const w = Math.max(1, window | 0);
  const now = tNow | 0;
  const oldest = tOldest | 0;
  const focus = Math.min(now, Math.max(oldest, tFocus | 0));
  let tHi = now;
  let tLo = tHi - w + 1;
  if (focus < tLo) {
    tLo = focus;
    tHi = Math.min(now, tLo + w - 1);
  }
  if (tLo < oldest) {
    tLo = oldest;
    tHi = Math.min(now, tLo + w - 1);
  }
  return { tLo, tHi };
}

/** Live: Depth wake. Inspect: every cached slice (no sliding viewport). */
export function drawnWindow(inspect, tapeSize, depth) {
  if (inspect) return Math.max(1, tapeSize | 0);
  return Math.max(1, depth | 0);
}

/** Decay spans the past under the plane, not ghost slices above it. */
export function fadePastSpan(tFocus, tLo) {
  return Math.max(1, (tFocus | 0) - (tLo | 0) + 1);
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
   * @param {number} capacity max stored generations (wake) or starting size (tape)
   * @param {number} maxCells live cells per generation (width * height)
   * @param {{ appendOnly?: boolean, maxCapacity?: number, maxEvents?: number }} [opts]
   */
  constructor(capacity, maxCells, opts = {}) {
    this.capacity = Math.max(1, capacity | 0);
    this.maxCells = maxCells;
    this.appendOnly = Boolean(opts.appendOnly);
    this.maxCapacity = Math.max(this.capacity, opts.maxCapacity ?? this.capacity);
    this.maxEvents = opts.maxEvents ?? Infinity;
    this.eventCount = 0;
    this.stopped = false;
    this.slices = Array.from({ length: this.capacity }, () => new Slice(maxCells));
    this.head = 0;
    this.size = 0;
    /** @type {Map<number, Set<number>>} */
    this.liveByGen = new Map();
    this._width = 0;
  }

  clear() {
    this.head = 0;
    this.size = 0;
    this.eventCount = 0;
    this.stopped = false;
    this.liveByGen.clear();
  }

  /**
   * Grow or shrink stored history without dropping the newest slices.
   * Everyday Depth changes must not reset Conway.
   */
  resize(capacity) {
    const cap = Math.max(1, capacity | 0);
    if (cap === this.capacity) return this;
    const keep = Math.min(this.size, cap);
    const next = Array.from({ length: cap }, () => new Slice(this.maxCells));
    for (let i = 0; i < keep; i++) {
      const srcIdx = (this.head - keep + i + this.capacity) % this.capacity;
      const src = this.slices[srcIdx];
      const dst = next[i];
      dst.t = src.t;
      dst.count = src.count;
      dst.x.set(src.x.subarray(0, src.count));
      dst.y.set(src.y.subarray(0, src.count));
    }
    this.slices = next;
    this.capacity = cap;
    this.size = keep;
    this.head = keep % cap;
    this.liveByGen.clear();
    if (this._width > 0) {
      for (let i = 0; i < keep; i++) this._indexSlice(this.slices[i], this._width);
    }
    return this;
  }

  oldestT() {
    if (!this.size) return 0;
    const idx = (this.head - this.size + this.capacity) % this.capacity;
    return this.slices[idx].t;
  }

  newestT() {
    if (!this.size) return 0;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.slices[idx].t;
  }

  _indexSlice(sl, width) {
    this._width = width;
    const set = new Set();
    for (let k = 0; k < sl.count; k++) set.add(sl.y[k] * width + sl.x[k]);
    this.liveByGen.set(sl.t, set);
  }

  pushGrid(grid, width, height, t) {
    if (this.appendOnly && this.stopped) return false;
    if (this.appendOnly && this.size === this.capacity) {
      const canGrow =
        this.capacity < this.maxCapacity && this.eventCount < this.maxEvents;
      if (!canGrow) {
        this.stopped = true;
        return false;
      }
      this.resize(Math.min(this.maxCapacity, this.capacity * 2));
    }
    if (!this.appendOnly && this.size === this.capacity) {
      this.liveByGen.delete(this.slices[this.head].t);
    }
    const sl = this.slices[this.head];
    sl.t = t;
    sl.count = collectLive(grid, width, height, sl.x, sl.y);
    this._indexSlice(sl, width);
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
    if (this.appendOnly) {
      this.eventCount += sl.count;
      if (this.eventCount >= this.maxEvents || this.size >= this.maxCapacity) {
        this.stopped = true;
      }
    }
    return true;
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
        const prev = sl.count;
        sl.count = collectLive(grid, width, height, sl.x, sl.y);
        if (this.appendOnly) this.eventCount += sl.count - prev;
        this._indexSlice(sl, width);
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
   *   dynamics?: boolean,
   *   neighborhood?: boolean,
   *   neighborhoodRadius?: number,
   *   stabScale?: boolean,
   *   tLo?: number,
   *   tHi?: number,
   * }} [opts]
   */
  fillSoA(soa, tRef, window, width = 0, opts = {}) {
    const tFocus = opts.tFocus ?? tRef;
    const span =
      opts.tLo != null && opts.tHi != null
        ? {
            tLo: Math.max(this.oldestT(), Math.min(opts.tLo | 0, opts.tHi | 0)),
            tHi: Math.min(tRef | 0, Math.max(opts.tLo | 0, opts.tHi | 0)),
          }
        : visibleTimeSpan(tFocus, tRef, this.oldestT(), window);
    const { tLo, tHi } = span;
    const stabMode = opts.stabMode || "none";
    const project = stabMode === "focus";
    const dynamics = opts.dynamics !== false;
    const useStab =
      opts.stabScale !== false && (stabMode === "time" || stabMode === "focus");
    const kindOpts = { neighborhoodRadius: kindOptsRadius(opts) };
    const bounds =
      width > 0
        ? {
            width,
            height: opts.height || width,
            wrap: opts.wrap !== false,
          }
        : null;
    const isLive = (t, packed) => {
      const set = this.liveByGen.get(t);
      return !!(set && set.has(packed));
    };
    const projCache = new Map();
    const stabAt = (t, packed) => {
      if (project) {
        if (!projCache.has(packed)) {
          projCache.set(
            packed,
            stabilityAge(tFocus, packed, isLive, undefined, bounds, kindOpts),
          );
        }
        return projCache.get(packed);
      }
      return stabilityAge(t, packed, isLive, undefined, bounds, kindOpts);
    };

    let n = 0;
    let truncated = false;
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const sl = this.slices[idx];
      if (sl.t > tHi) continue;
      if (sl.t < tLo) break;
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
        if (width > 0 && dynamics) {
          const packed = y * width + x;
          soa.k[n] = kindAt(sl.t, packed, isLive, bounds, kindOpts);
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

/** One-line RAM tape status for the View sheet. */
export function formatCacheStatus({ gens, events, full, tapeMode }) {
  const n = events | 0;
  const cells = n >= 10000 ? `${Math.round(n / 1000)}k` : String(n);
  const bits = [`Cache ${gens | 0} gen`, `${cells} cells`];
  if (full) bits.push("full");
  if (tapeMode) bits.push("inspect");
  return bits.join(" · ");
}
