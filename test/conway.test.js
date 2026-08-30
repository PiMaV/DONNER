import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countLive,
  seedPattern,
  stepClassic,
} from "../src/conway.js";
import { mulberry32 } from "../src/rng.js";
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
  });
});
