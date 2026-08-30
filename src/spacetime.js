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

export class EventSoA {
  constructor(capacity) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.t = new Float32Array(capacity);
    this.v = new Float32Array(capacity);
    this.count = 0;
    this.truncated = false;
  }
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
   * @returns {EventSoA}
   */
  fillSoA(soa, tRef, window) {
    const tMin = tRef - window;
    let n = 0;
    let truncated = false;
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const sl = this.slices[idx];
      if (sl.t < tMin) break;
      for (let k = 0; k < sl.count; k++) {
        if (n >= soa.capacity) {
          truncated = true;
          soa.count = n;
          soa.truncated = true;
          return soa;
        }
        soa.x[n] = sl.x[k];
        soa.y[n] = sl.y[k];
        soa.t[n] = sl.t;
        soa.v[n] = 1;
        n += 1;
      }
    }
    soa.count = n;
    soa.truncated = truncated;
    return soa;
  }
}
