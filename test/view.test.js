import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lookAlignedWithAxis,
  planeLockShouldExit,
  sliceOnlyFromPlaneLock,
} from "../src/axes.js";
import { frustumFromDistance } from "../src/orbit.js";

describe("orthographic frustum", () => {
  it("matches tan of half FOV times distance", () => {
    assert.ok(Math.abs(frustumFromDistance(20, 60) - 20 * Math.tan(Math.PI / 6)) < 1e-9);
  });
});

describe("aligned look", () => {
  it("treats a near-top view as aligned with product Z", () => {
    assert.equal(
      lookAlignedWithAxis({ x: 0.2, y: 50, z: 0.1 }, { x: 0, y: 0, z: 0 }, "z"),
      true,
    );
  });
});

describe("plane lock", () => {
  it("draws a single plane only when planeLock is on", () => {
    assert.equal(sliceOnlyFromPlaneLock(false), false);
    assert.equal(sliceOnlyFromPlaneLock(true), true);
  });

  it("leaves the cut after a small orbit off the slice axis", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const top = { x: 0, y: 50, z: 0 };
    const side = { x: 40, y: 8, z: 12 };
    const tilt = {
      x: 50 * Math.sin((5 * Math.PI) / 180),
      y: 50 * Math.cos((5 * Math.PI) / 180),
      z: 0,
    };
    assert.equal(planeLockShouldExit(true, top, origin, "z"), false);
    assert.equal(planeLockShouldExit(true, tilt, origin, "z"), true);
    assert.equal(planeLockShouldExit(true, side, origin, "z"), true);
    assert.equal(planeLockShouldExit(false, side, origin, "z"), false);
  });

  it("keeps an X lock when looking along X", () => {
    assert.equal(
      planeLockShouldExit(true, { x: 40, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, "x"),
      false,
    );
    assert.equal(
      planeLockShouldExit(true, { x: 0, y: 50, z: 0 }, { x: 0, y: 0, z: 0 }, "x"),
      true,
    );
  });
});
