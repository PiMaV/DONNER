import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitOrbitDistance,
  pinOrbitToAxis,
  placeOnViewRay,
  playfieldHalfExtent,
  slabYRange,
  volumeRadius,
} from "../src/orbit.js";

describe("slab world Y", () => {
  it("puts the focus plane at Y = 0 and the older cut below", () => {
    const y = slabYRange(80, 40, 80, 1);
    assert.equal(y.yMax, 0);
    assert.equal(y.yMin, -40);
    assert.equal(y.yMid, -20);
  });

  it("keeps the brick mid-height when the playhead moves through a fixed slab", () => {
    const a = slabYRange(80, 40, 80, 1);
    const b = slabYRange(60, 40, 80, 1);
    assert.equal(b.yMid - a.yMid, 20);
    assert.equal(b.yMin - a.yMin, 20);
    assert.equal(b.yMax - a.yMax, 20);
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
});
