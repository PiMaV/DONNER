import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampSlab,
  formatZTick,
  productToWorld,
  relativeTimeTicks,
  slabGenerations,
  spatialTicks,
  stackThumbFrac,
  stackTickMarks,
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

  it("places a tick on every stored step", () => {
    const marks = stackTickMarks(12);
    assert.equal(marks.length, 13);
    assert.equal(marks[0].frac, 0);
    assert.equal(marks[12].frac, 1);
    assert.ok(marks.filter((m) => m.major).length > 2);
    assert.equal(stackTickMarks(0).length, 1);
  });

  it("does not emit a DOM tick per generation on a 1000-deep resident buffer", () => {
    const marks = stackTickMarks(1000);
    assert.ok(marks.length < 80);
    assert.equal(marks[0].frac, 0);
    assert.equal(marks[marks.length - 1].frac, 1);
  });
});

describe("Z slab", () => {
  it("playhead pushes the clips when the focus handle moves", () => {
    assert.deepEqual(clampSlab(0, 20, 40, 40, "focus"), {
      topBack: 0,
      focusBack: 20,
      botBack: 40,
    });
    assert.deepEqual(clampSlab(25, 20, 40, 40, "focus"), {
      topBack: 20,
      focusBack: 20,
      botBack: 40,
    });
    assert.deepEqual(clampSlab(0, 20, 10, 40, "focus"), {
      topBack: 0,
      focusBack: 20,
      botBack: 20,
    });
  });

  it("a clip handle pushes the playhead when dragged past it", () => {
    assert.deepEqual(clampSlab(25, 20, 40, 40, "near"), {
      topBack: 25,
      focusBack: 25,
      botBack: 40,
    });
    assert.deepEqual(clampSlab(0, 20, 10, 40, "far"), {
      topBack: 0,
      focusBack: 10,
      botBack: 10,
    });
    assert.deepEqual(clampSlab(35, 20, 30, 40, "near"), {
      topBack: 35,
      focusBack: 35,
      botBack: 35,
    });
  });

  it("maps back-offsets to absolute generations", () => {
    assert.deepEqual(slabGenerations(100, 0, 40), { tLo: 60, tHi: 100 });
    assert.deepEqual(slabGenerations(100, 10, 10), { tLo: 90, tHi: 90 });
  });
});
