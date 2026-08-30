import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countLive,
  seedPattern,
  stepClassic,
} from "../src/conway.js";
import { mulberry32 } from "../src/rng.js";
import { KIND_OSC, KIND_STILL, KIND_TRANSIT, KIND_WARMUP, classifyWorldline, stabilityAge, stabilityScale, MAX_STAB_GENS } from "../src/dynamics.js";
import { clampFocusBack, focusGeneration } from "../src/focus.js";
import { EventSoA, GenerationRing } from "../src/spacetime.js";

describe("Conway B3/S23 (BLITZ parity)", () => {
  it("blinker oscillates with period 2 on a torus", () => {
    const rng = mulberry32(0);
    const g0 = seedPattern("Blinker", 9, 9, rng);
    const g1 = stepClassic(g0, 9, 9, true);
    const g2 = stepClassic(g1, 9, 9, true);
    assert.equal(countLive(g0), 3);
    assert.deepEqual(g0, g2);
  });

  it("glider has five live cells", () => {
    const g = seedPattern("Glider", 16, 16, mulberry32(0));
    assert.equal(countLive(g), 5);
  });

  it("random soup respects rectangular shape and density bounds", () => {
    const g = seedPattern("Random", 128, 64, mulberry32(7), 0.25);
    assert.equal(g.length, 128 * 64);
    const d = countLive(g) / g.length;
    assert.ok(d > 0.15 && d < 0.35);
  });

  it("Gosper gun falls back to glider on a small grid", () => {
    const g = seedPattern("Gosper gun", 16, 16, mulberry32(0));
    assert.equal(countLive(g), 5);
  });

  it("hard edges let a lone cell die", () => {
    const grid = new Uint8Array(5 * 5);
    grid[2 * 5 + 2] = 1;
    const next = stepClassic(grid, 5, 5, false);
    assert.equal(countLive(next), 0);
  });
});

describe("space-time ring", () => {
  it("fills newest generations first and can truncate", () => {
    const ring = new GenerationRing(8, 4);
    const soa = new EventSoA(3);
    for (let t = 0; t < 4; t++) {
      const grid = new Uint8Array([1, 1, 0, 0]);
      ring.pushGrid(grid, 2, 2, t);
    }
    ring.fillSoA(soa, 3, 8);
    assert.equal(soa.count, 3);
    assert.equal(soa.truncated, true);
    assert.equal(soa.t[0], 3);
    assert.equal(ring.liveAt(3), 2);
  });
});

describe("focus plane", () => {
  it("clamps scrub offset to stored history", () => {
    assert.equal(clampFocusBack(99, 10, 48), 10);
    assert.equal(clampFocusBack(99, 80, 48), 48);
    assert.equal(clampFocusBack(-3, 10, 48), 0);
    assert.equal(focusGeneration(40, 12), 28);
  });
});

describe("worldline color class", () => {
  it("classifies still, period-2, and transit occupancy", () => {
    assert.equal(classifyWorldline(true, true, true), KIND_STILL);
    assert.equal(classifyWorldline(false, true, false), KIND_OSC);
    assert.equal(classifyWorldline(false, false, false), KIND_TRANSIT);
  });

  it("tags the first two generations as warmup, not transit", () => {
    const rng = mulberry32(0);
    let grid = seedPattern("Blinker", 9, 9, rng);
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    ring.pushGrid(grid, 9, 9, 0);
    ring.fillSoA(soa, 0, 8, 9);
    assert.ok(soa.count >= 3);
    for (let i = 0; i < soa.count; i++) {
      assert.equal(soa.k[i], KIND_WARMUP);
    }
  });

  it("tags blinker tips as oscillators and the core as still", () => {
    const rng = mulberry32(0);
    let grid = seedPattern("Blinker", 9, 9, rng);
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    for (let t = 0; t <= 2; t++) {
      ring.pushGrid(grid, 9, 9, t);
      if (t < 2) grid = stepClassic(grid, 9, 9, true);
    }
    ring.fillSoA(soa, 2, 8, 9);
    const kindAt = (x, y) => {
      for (let i = 0; i < soa.count; i++) {
        if (soa.t[i] === 2 && soa.x[i] === x && soa.y[i] === y) return soa.k[i];
      }
      return -1;
    };
    assert.equal(kindAt(4, 4), KIND_STILL);
    assert.equal(kindAt(3, 4), KIND_OSC);
    assert.equal(kindAt(5, 4), KIND_OSC);
  });

  it("tags a glider as transit, not still or oscillator", () => {
    const n = 16;
    let grid = seedPattern("Glider", n, n, mulberry32(0));
    const ring = new GenerationRing(24, n * n);
    const soa = new EventSoA(n * n * 24);
    for (let t = 0; t < 16; t++) {
      ring.pushGrid(grid, n, n, t);
      grid = stepClassic(grid, n, n, true);
    }
    ring.fillSoA(soa, 15, 16, n, { height: n, wrap: true });
    let still = 0;
    let osc = 0;
    let transit = 0;
    let warmup = 0;
    for (let i = 0; i < soa.count; i++) {
      if (soa.t[i] < 8) continue;
      const k = soa.k[i];
      if (k === KIND_STILL) still += 1;
      else if (k === KIND_OSC) osc += 1;
      else if (k === KIND_TRANSIT) transit += 1;
      else if (k === KIND_WARMUP) warmup += 1;
    }
    assert.equal(still, 0);
    assert.equal(osc, 0);
    assert.equal(warmup, 0);
    assert.ok(transit > 0);
  });
});

describe("stability age", () => {
  it("counts consecutive still gens and caps", () => {
    const isLive = (t) => t >= 0 && t <= 40;
    assert.equal(stabilityAge(40, 0, isLive), MAX_STAB_GENS);
    assert.equal(stabilityAge(3, 0, isLive) >= 1, true);
    assert.equal(stabilityScale(0) < stabilityScale(8), true);
    assert.equal(stabilityScale(16), stabilityScale(99));
  });

  it("projects focus age onto earlier cubes when asked", () => {
    const rng = mulberry32(0);
    let grid = seedPattern("Blinker", 9, 9, rng);
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    for (let t = 0; t <= 2; t++) {
      ring.pushGrid(grid, 9, 9, t);
      if (t < 2) grid = stepClassic(grid, 9, 9, true);
    }
    ring.fillSoA(soa, 2, 8, 9, { tFocus: 2, stabMode: "focus" });
    const atCore = [];
    for (let i = 0; i < soa.count; i++) {
      if (soa.x[i] === 4 && soa.y[i] === 4) atCore.push(soa.s[i]);
    }
    assert.ok(atCore.length >= 2);
    assert.ok(atCore.every((s) => s === atCore[0]));
  });
});
