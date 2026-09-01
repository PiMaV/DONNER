import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productViewDir } from "../src/axes.js";
import { rotateVecByQuat } from "../src/xr.js";
import {
  composeArYaw,
  gizmoFollowYaw,
  lightsFollowTurntable,
  wrapTurntableYaw,
  yawDegrees,
  yawDeltaFromDrag,
  yawFromDegrees,
  yawProductDir,
  yawQuatY,
} from "../src/turntable.js";

describe("turntable yaw wrap", () => {
  it("wraps to [0, 2π)", () => {
    assert.equal(wrapTurntableYaw(0), 0);
    assert.ok(Math.abs(wrapTurntableYaw(Math.PI * 2) - 0) < 1e-12);
    assert.ok(Math.abs(wrapTurntableYaw(-Math.PI / 2) - (Math.PI * 1.5)) < 1e-12);
    assert.equal(wrapTurntableYaw(Number.NaN), 0);
  });

  it("round-trips degrees", () => {
    assert.ok(Math.abs(yawDegrees(yawFromDegrees(90)) - 90) < 1e-9);
    assert.ok(Math.abs(yawFromDegrees(180) - Math.PI) < 1e-9);
    assert.ok(Math.abs(yawDegrees(yawFromDegrees(360)) - 0) < 1e-9);
  });
});

describe("yawDeltaFromDrag", () => {
  it("maps a full-width drag to one turn, rightward clockwise from above", () => {
    assert.ok(Math.abs(yawDeltaFromDrag(100, 100) + Math.PI * 2) < 1e-12);
    assert.ok(Math.abs(yawDeltaFromDrag(-50, 200) - Math.PI / 2) < 1e-12);
  });
});

describe("yawProductDir", () => {
  it("matches Three.js rotation.y: +90° sends local +X to −Z", () => {
    const p = yawProductDir({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    assert.ok(Math.abs(p.x) < 1e-12);
    assert.equal(p.y, 0);
    assert.ok(Math.abs(p.z + 1) < 1e-12);
  });

  it("yaws volume axes under world-fixed lights (Lambert faces change)", () => {
    assert.equal(lightsFollowTurntable(), false);
    const x = yawProductDir(productViewDir("x", 1), Math.PI / 2);
    assert.ok(Math.abs(x.z + 1) < 1e-12);
  });

  it("walks a key-light position around product Z without moving the volume", () => {
    const key = yawProductDir({ x: 18, y: 32, z: 22 }, Math.PI / 2);
    assert.ok(Math.abs(key.x - 22) < 1e-12);
    assert.equal(key.y, 32);
    assert.ok(Math.abs(key.z + 18) < 1e-12);
  });
});

describe("composeArYaw", () => {
  it("applies yaw in local table space after the placement quat", () => {
    const id = composeArYaw({ x: 0, y: 0, z: 0, w: 1 }, Math.PI / 2);
    const v = rotateVecByQuat({ x: 1, y: 0, z: 0 }, id);
    assert.ok(Math.abs(v.x) < 1e-9);
    assert.ok(Math.abs(v.y) < 1e-9);
    assert.ok(Math.abs(v.z + 1) < 1e-9);
  });

  it("composes a 90° table yaw then a 90° object yaw to 180°", () => {
    const table = yawQuatY(Math.PI / 2);
    const q = composeArYaw(table, Math.PI / 2);
    const v = rotateVecByQuat({ x: 1, y: 0, z: 0 }, q);
    assert.ok(Math.abs(v.x + 1) < 1e-9);
    assert.ok(Math.abs(v.z) < 1e-9);
  });
});

describe("gizmoFollowYaw", () => {
  it("is invert(camera) when yaw is 0", () => {
    const cam = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const g = gizmoFollowYaw(cam, 0);
    assert.ok(Math.abs(g.x - 0) < 1e-12);
    assert.ok(Math.abs(g.y + Math.SQRT1_2) < 1e-12);
    assert.ok(Math.abs(g.z - 0) < 1e-12);
    assert.ok(Math.abs(g.w - Math.SQRT1_2) < 1e-12);
  });

  it("multiplies invert(camera) by object yaw so the cube follows the volume", () => {
    const g = gizmoFollowYaw({ x: 0, y: 0, z: 0, w: 1 }, Math.PI / 2);
    const yq = yawQuatY(Math.PI / 2);
    assert.ok(Math.abs(g.x - yq.x) < 1e-12);
    assert.ok(Math.abs(g.y - yq.y) < 1e-12);
    assert.ok(Math.abs(g.z - yq.z) < 1e-12);
    assert.ok(Math.abs(g.w - yq.w) < 1e-12);
  });
});
