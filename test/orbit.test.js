import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitOrbitDistance,
  orthoFitHalfHeight,
  pinOrbitToAxis,
  pinOrbitToOriginXY,
  placeOnViewRay,
  playfieldHalfExtent,
  slabYRange,
  volumeRadius,
} from "../src/orbit.js";

describe("slab world Y", () => {
  it("puts Now at Y = 0 and the older cut below", () => {
    const y = slabYRange(80, 40, 80, 1);
    assert.equal(y.yMax, 0);
    assert.equal(y.yMin, -40);
    assert.equal(y.yMid, -20);
  });

  it("keeps Now at Y = 0 when the Z crop shrinks", () => {
    const full = slabYRange(80, 0, 80, 1);
    const crop = slabYRange(80, 40, 80, 1);
    assert.equal(full.yMax, 0);
    assert.equal(crop.yMax, 0);
    assert.equal(full.yMin, -80);
    assert.equal(crop.yMin, -40);
  });

  it("keeps gen 0 at the pillar base independent of a clipped inspect slab", () => {
    const pillar = slabYRange(100, 0, 100, 1);
    const slab = slabYRange(100, 40, 60, 1);
    assert.equal(pillar.yMin, -100);
    assert.equal(pillar.yMax, 0);
    assert.equal(slab.yMin, -60);
    assert.equal(slab.yMax, -40);
  });
});

describe("orbit pin", () => {
  it("slides the camera with the pivot so the look does not jump", () => {
    const pinned = pinOrbitToAxis(
      { x: 10, y: 4, z: 12 },
      { x: 2, y: -8, z: -1 },
      -20,
    );
    assert.deepEqual(pinned.target, { x: 0, y: -20, z: 0 });
    assert.deepEqual(pinned.cam, { x: 8, y: -8, z: 13 });
  });

  it("pins XY to the time axis without moving target height", () => {
    const pinned = pinOrbitToOriginXY(
      { x: 10, y: 4, z: 12 },
      { x: 2, y: -8, z: -1 },
    );
    assert.deepEqual(pinned.target, { x: 0, y: -8, z: 0 });
    assert.deepEqual(pinned.cam, { x: 8, y: 4, z: 13 });
  });

  it("places the camera on the view ray at a fit distance", () => {
    const p = placeOnViewRay({ x: 0, y: 6, z: 8 }, { x: 0, y: 0, z: 0 }, 20);
    const len = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(len - 20) < 1e-6);
    assert.ok(Math.abs(p.z / p.y - 8 / 6) < 1e-6);
  });

  it("fits a taller brick from farther away", () => {
    const { hx, hz } = playfieldHalfExtent(32, 32, 1);
    const short = fitOrbitDistance(50, volumeRadius(hx, hz, -8, 0));
    const tall = fitOrbitDistance(50, volumeRadius(hx, hz, -400, 0));
    assert.ok(tall > short * 5);
  });

  it("fits an ortho frustum to a slice rectangle", () => {
    const square = orthoFitHalfHeight(32, 32, 1, 1);
    assert.equal(square, 16);
    const wide = orthoFitHalfHeight(40, 10, 1, 1);
    assert.equal(wide, 20);
    const tall = orthoFitHalfHeight(10, 40, 1, 1);
    assert.equal(tall, 20);
  });
});
