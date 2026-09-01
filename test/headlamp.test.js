import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HEADLAMP_KEY_LOCAL,
  headlampPose,
  offsetInView,
  viewLookTarget,
} from "../src/headlamp.js";
import { yawQuatY } from "../src/turntable.js";

const ID = { x: 0, y: 0, z: 0, w: 1 };
const ORIGIN = { x: 0, y: 0, z: 0 };

describe("viewLookTarget", () => {
  it("looks along camera −Z at identity", () => {
    const t = viewLookTarget(ORIGIN, ID, 10);
    assert.ok(Math.abs(t.x) < 1e-12);
    assert.ok(Math.abs(t.y) < 1e-12);
    assert.ok(Math.abs(t.z + 10) < 1e-12);
  });

  it("yaws with the camera so the lamp stays in front of the view", () => {
    const t = viewLookTarget(ORIGIN, yawQuatY(Math.PI / 2), 10);
    assert.ok(Math.abs(t.x + 10) < 1e-12);
    assert.ok(Math.abs(t.y) < 1e-12);
    assert.ok(Math.abs(t.z) < 1e-12);
  });
});

describe("offsetInView", () => {
  it("is camera-local at identity", () => {
    const p = offsetInView(ORIGIN, ID, HEADLAMP_KEY_LOCAL);
    assert.equal(p.x, HEADLAMP_KEY_LOCAL.x);
    assert.equal(p.y, HEADLAMP_KEY_LOCAL.y);
    assert.equal(p.z, HEADLAMP_KEY_LOCAL.z);
  });

  it("rides a translated camera", () => {
    const p = offsetInView({ x: 1, y: 2, z: 3 }, ID, { x: 0, y: 0, z: 4 });
    assert.equal(p.x, 1);
    assert.equal(p.y, 2);
    assert.equal(p.z, 7);
  });
});

describe("headlampPose", () => {
  it("keeps key, fill, and look target in the same view", () => {
    const pose = headlampPose({ x: 5, y: 6, z: 7 }, ID, 20);
    assert.equal(pose.key.x, 5 + HEADLAMP_KEY_LOCAL.x);
    assert.equal(pose.target.z, 7 - 20);
  });
});
