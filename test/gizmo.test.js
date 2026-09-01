import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  axisIndexFromBack,
  eventOnSlice,
  lookAlignedWithAxis,
  productViewDir,
  productToWorld,
  slabIndices,
  sliceMaxBack,
} from "../src/axes.js";
import { frustumFromDistance, offsetLength, pinOrbitHeight, snapPose } from "../src/orbit.js";
import { clampCubeCap, DEFAULTS } from "../src/config.js";

describe("product view directions", () => {
  it("maps product +Z to world +Y (top-down)", () => {
    assert.deepEqual(productViewDir("z", 1), { x: 0, y: 1, z: 0 });
    assert.deepEqual(productViewDir("z", -1), { x: 0, y: -1, z: 0 });
  });

  it("maps product +Y to world +Z and +X to world +X", () => {
    assert.deepEqual(productViewDir("y", 1), { x: 0, y: 0, z: 1 });
    assert.deepEqual(productViewDir("x", 1), { x: 1, y: 0, z: 0 });
    assert.deepEqual(productViewDir("X", 1), { x: 1, y: 0, z: 0 });
  });

  it("stays consistent with productToWorld basis", () => {
    const x = productViewDir("x", 1);
    const y = productViewDir("y", 1);
    const z = productViewDir("z", 1);
    assert.deepEqual(productToWorld(x.x, y.z, z.y), { x: 1, y: 1, z: 1 });
  });
});

describe("slice stack indices", () => {
  it("puts the high end at back = 0", () => {
    assert.equal(sliceMaxBack("x", 32, 16, 80), 31);
    assert.equal(sliceMaxBack("y", 32, 16, 80), 15);
    assert.equal(sliceMaxBack("z", 32, 16, 80), 80);
    assert.equal(axisIndexFromBack(0, 31), 31);
    assert.equal(axisIndexFromBack(31, 31), 0);
    assert.equal(axisIndexFromBack(10, 31), 21);
  });

  it("maps gold grips to an inclusive index span", () => {
    assert.deepEqual(slabIndices(0, 31, 31), { lo: 0, hi: 31 });
    assert.deepEqual(slabIndices(0, 0, 31), { lo: 31, hi: 31 });
    assert.deepEqual(slabIndices(5, 10, 31), { lo: 21, hi: 26 });
  });
});

describe("eventOnSlice", () => {
  it("keeps time events when the axis is Z unless sliceOnly", () => {
    assert.equal(eventOnSlice("z", 1, 2, 9, { lo: 0, hi: 4, focus: 9, sliceOnly: false }), true);
    assert.equal(eventOnSlice("z", 1, 2, 8, { lo: 0, hi: 4, focus: 9, sliceOnly: true }), false);
    assert.equal(eventOnSlice("z", 1, 2, 9, { lo: 0, hi: 4, focus: 9, sliceOnly: true }), true);
  });

  it("clips X and Y slabs", () => {
    assert.equal(eventOnSlice("x", 4, 2, 9, { lo: 3, hi: 5, focus: 4, sliceOnly: false }), true);
    assert.equal(eventOnSlice("x", 1, 2, 9, { lo: 3, hi: 5, focus: 4, sliceOnly: false }), false);
    assert.equal(eventOnSlice("y", 1, 7, 9, { lo: 7, hi: 7, focus: 7, sliceOnly: true }), true);
    assert.equal(eventOnSlice("y", 1, 6, 9, { lo: 7, hi: 7, focus: 7, sliceOnly: true }), false);
  });
});

describe("ortho and snap helpers", () => {
  it("builds a frustum from distance and FOV", () => {
    const h = frustumFromDistance(10, 90);
    assert.ok(Math.abs(h - 10) < 1e-6);
  });

  it("detects a look aligned with the slice axis", () => {
    assert.equal(
      lookAlignedWithAxis({ x: 0, y: 40, z: 0.05 }, { x: 0, y: 0, z: 0 }, "z"),
      true,
    );
    assert.equal(
      lookAlignedWithAxis({ x: 40, y: 8, z: 12 }, { x: 0, y: 0, z: 0 }, "z"),
      false,
    );
    assert.equal(
      lookAlignedWithAxis({ x: 40, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, "x"),
      true,
    );
  });

  it("snaps onto the view ray and nudges polar-zero views", () => {
    const p = snapPose({ x: 0, y: -8, z: 0 }, { x: 0, y: 1, z: 0 }, 20);
    assert.ok(Math.abs(p.y + 8 - 20) < 1e-6);
    assert.ok(Math.abs(p.z) > 0.01);
    assert.equal(offsetLength(p, { x: 0, y: -8, z: 0 }) > 19, true);
  });

  it("pins height without clearing XY pan", () => {
    const pinned = pinOrbitHeight({ x: 4, y: 2, z: -3 }, { x: 4, y: -8, z: -3 }, -20);
    assert.deepEqual(pinned.target, { x: 4, y: -20, z: -3 });
    assert.deepEqual(pinned.cam, { x: 4, y: -10, z: -3 });
  });
});

describe("cube cap", () => {
  it("clamps to the bench range", () => {
    assert.equal(clampCubeCap(200_000), 200_000);
    assert.equal(clampCubeCap(1), DEFAULTS.cubeCapMin);
    assert.equal(clampCubeCap(9e9), DEFAULTS.cubeCapMax);
    assert.equal(clampCubeCap("nope"), DEFAULTS.maxInstances);
  });
});
