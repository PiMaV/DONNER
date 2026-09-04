import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitOrbitDistance,
  gapLimitOrbitRange,
  orthoFitHalfHeight,
  pinOrbitToAxis,
  pinOrbitToOriginXY,
  placeOnViewRay,
  phoneOrbitViewOffset,
  playfieldHalfExtent,
  slabYRange,
  spinAutoRotateSpeed,
  spinYawDelta,
  translateAlongProductAxis,
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

  it("keeps phoneOrbitViewOffset as a no-op so a cached main.js can still boot", () => {
    const off = phoneOrbitViewOffset(390, 844);
    assert.deepEqual(off, {
      fullWidth: 390,
      fullHeight: 844,
      offsetX: 0,
      offsetY: 0,
      width: 390,
      height: 844,
    });
  });

  it("fits an ortho frustum to a slice rectangle", () => {
    const square = orthoFitHalfHeight(32, 32, 1, 1);
    assert.equal(square, 16);
    const wide = orthoFitHalfHeight(40, 10, 1, 1);
    assert.equal(wide, 20);
    const tall = orthoFitHalfHeight(10, 40, 1, 1);
    assert.equal(tall, 20);
  });

  it("sizes max zoom-out for the gap slider limit, not packed pitch", () => {
    const aabb = { xLo: 0, xHi: 31, yLo: 0, yHi: 31, tLo: 0, tHi: 47 };
    const packed = gapLimitOrbitRange({
      width: 32,
      height: 32,
      aabb,
      tNow: 47,
      cellSize: 1,
      timeScale: 1,
      gapMax: 0,
      fovDeg: 50,
    });
    const wide = gapLimitOrbitRange({
      width: 32,
      height: 32,
      aabb,
      tNow: 47,
      cellSize: 1,
      timeScale: 1,
      gapMax: 5,
      fovDeg: 50,
    });
    assert.ok(wide.radius > packed.radius * 5);
    assert.ok(wide.maxDistance > packed.maxDistance * 3);
    assert.ok(wide.minZoom < packed.minZoom);
    assert.ok(wide.far > wide.maxDistance);
  });

  it("lets an MRI brick at gap 5 dolly past the old 2400 cap", () => {
    const range = gapLimitOrbitRange({
      width: 207,
      height: 256,
      aabb: { xLo: 0, xHi: 206, yLo: 0, yHi: 255, tLo: 0, tHi: 214 },
      tNow: 214,
      cellSize: 1,
      timeScale: 1,
      gapMax: 5,
      fovDeg: 50,
    });
    assert.ok(range.maxDistance > 2400);
  });
});

describe("cut camera track", () => {
  it("slides camera and target along the product axis and keeps in-plane pan", () => {
    const cam = { x: 2, y: 5, z: 20 };
    const target = { x: 2, y: 5, z: 4 };
    const alongY = translateAlongProductAxis(cam, target, "y", 3);
    assert.deepEqual(alongY.cam, { x: 2, y: 5, z: 23 });
    assert.deepEqual(alongY.target, { x: 2, y: 5, z: 7 });
    const alongX = translateAlongProductAxis(cam, target, "x", -1);
    assert.deepEqual(alongX.cam, { x: 1, y: 5, z: 20 });
    assert.deepEqual(alongX.target, { x: 1, y: 5, z: 4 });
    const alongZ = translateAlongProductAxis(cam, target, "z", 2);
    assert.deepEqual(alongZ.cam, { x: 2, y: 7, z: 20 });
    assert.deepEqual(alongZ.target, { x: 2, y: 7, z: 4 });
    const none = translateAlongProductAxis(cam, target, "y", 0);
    assert.deepEqual(none.cam, cam);
    assert.deepEqual(none.target, target);
  });
});

describe("spin around Z", () => {
  it("turns one revolution in 24 seconds at the default rate", () => {
    assert.ok(Math.abs(spinYawDelta(24, 1 / 24) - Math.PI * 2) < 1e-12);
    assert.equal(spinYawDelta(0, 1 / 24), 0);
    assert.equal(spinYawDelta(1, 0), 0);
    assert.equal(spinYawDelta(Number.NaN, 1 / 24), 0);
  });

  it("maps rev/s to OrbitControls autoRotateSpeed for update(deltaTime)", () => {
    assert.equal(spinAutoRotateSpeed(1 / 24), 2.5);
    assert.equal(spinAutoRotateSpeed(0), 0);
  });
});
