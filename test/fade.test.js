import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { depthFade, sliceDistanceFade } from "../src/fade.js";

describe("depthFade", () => {
  it("is 1 across the window when decay is off", () => {
    assert.equal(depthFade(0, 48, false), 1);
    assert.equal(depthFade(47, 48, false), 1);
  });

  it("is 1 at the plane and 0 at the back of the drawn span", () => {
    assert.equal(depthFade(0, 48, true), 1);
    assert.equal(depthFade(47, 48, true), 0);
    assert.ok(depthFade(24, 48, true) > 0.4);
    assert.ok(depthFade(24, 48, true) < 0.6);
  });

  it("uses the current window, not a longer cache", () => {
    assert.equal(depthFade(10, 11, true), 0);
    assert.ok(depthFade(10, 48, true) > 0.7);
  });
});

describe("sliceDistanceFade", () => {
  it("is 1 on the playhead and 0 at each gold grip", () => {
    assert.equal(sliceDistanceFade(10, 10, 0, 20), 1);
    assert.equal(sliceDistanceFade(0, 10, 0, 20), 0);
    assert.equal(sliceDistanceFade(20, 10, 0, 20), 0);
  });

  it("fades independently on each side of an asymmetric slab", () => {
    const leftMid = sliceDistanceFade(5, 10, 0, 30);
    const rightMid = sliceDistanceFade(20, 10, 0, 30);
    assert.ok(Math.abs(leftMid - 0.5) < 1e-9);
    assert.ok(Math.abs(rightMid - 0.5) < 1e-9);
  });

  it("collapses to the plane when the slab is a single index", () => {
    assert.equal(sliceDistanceFade(7, 7, 7, 7), 1);
    assert.equal(sliceDistanceFade(6, 7, 7, 7), 0);
    assert.equal(sliceDistanceFade(8, 7, 7, 7), 0);
  });
});
