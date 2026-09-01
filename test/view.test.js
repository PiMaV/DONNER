import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lookAlignedWithAxis } from "../src/axes.js";
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
