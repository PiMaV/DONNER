import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatZTick,
  productToWorld,
  relativeTimeTicks,
  spatialTicks,
  stackThumbFrac,
  visibleTimeRange,
  worldToProduct,
} from "../src/axes.js";

describe("product vs engine axes", () => {
  it("maps X Y playfield and Z time onto Three.js Y-up", () => {
    assert.deepEqual(productToWorld(3, 5, 8), { x: 3, y: 8, z: 5 });
    assert.deepEqual(worldToProduct(3, 8, 5), { x: 3, y: 5, z: 8 });
  });
});

describe("axis ticks", () => {
  it("includes both ends of a 32-wide grid", () => {
    const t = spatialTicks(32);
    assert.equal(t[0], 0);
    assert.equal(t[t.length - 1], 31);
    assert.ok(t.includes(16) || t.includes(8));
  });

  it("labels relative Z with absolute generation at the plane", () => {
    assert.equal(formatZTick(0, 42), "0 · 42");
    assert.equal(formatZTick(-8, 42), "−8");
    assert.equal(formatZTick(3, 42), "+3");
  });

  it("spans past below the plane and ghost above", () => {
    const { relMin, relMax } = visibleTimeRange(50, 40, 48);
    assert.ok(relMin < 0);
    assert.equal(relMax, 10);
    const ticks = relativeTimeTicks(relMin, relMax);
    assert.ok(ticks.includes(0));
    assert.equal(ticks[0], relMin);
    assert.equal(ticks[ticks.length - 1], relMax);
  });

  it("maps Now to the top of the Z stack", () => {
    assert.equal(stackThumbFrac(0, 12), 0);
    assert.equal(stackThumbFrac(12, 12), 1);
    assert.equal(stackThumbFrac(6, 12), 0.5);
    assert.equal(stackThumbFrac(3, 0), 0);
  });
});
