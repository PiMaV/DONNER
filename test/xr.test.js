import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  XR_BOARD_CELLS,
  XR_BOARD_METERS,
  XR_MODE,
  immersiveArSessionInit,
  isImmersiveArSupported,
  rotateVecByQuat,
  viewerFrontPosition,
  xrStageScale,
} from "../src/xr.js";

describe("xrStageScale", () => {
  it("maps 32 cells of size 1 to 40 cm", () => {
    assert.equal(xrStageScale(1), XR_BOARD_METERS / XR_BOARD_CELLS);
    assert.equal(xrStageScale(1), 0.0125);
  });

  it("falls back when cellSize is not a positive number", () => {
    assert.equal(xrStageScale(0), 0.0125);
    assert.equal(xrStageScale(Number.NaN), 0.0125);
  });
});

describe("viewerFrontPosition", () => {
  it("places the stage on −Z when the viewer looks along −Z", () => {
    const p = viewerFrontPosition(
      { x: 0, y: 1.5, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      0.8,
    );
    assert.equal(p.x, 0);
    assert.equal(p.y, 1.5);
    assert.equal(p.z, -0.8);
  });

  it("rotates forward with a +90° yaw around Y", () => {
    const h = Math.SQRT1_2;
    const p = viewerFrontPosition(
      { x: 1, y: 0, z: 2 },
      { x: 0, y: h, z: 0, w: h },
      1,
    );
    assert.ok(Math.abs(p.x - 0) < 1e-9);
    assert.ok(Math.abs(p.y) < 1e-9);
    assert.ok(Math.abs(p.z - 2) < 1e-9);
  });
});

describe("rotateVecByQuat", () => {
  it("is identity for a unit w quaternion", () => {
    const v = rotateVecByQuat({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0, w: 1 });
    assert.deepEqual(v, { x: 1, y: 2, z: 3 });
  });
});

describe("isImmersiveArSupported", () => {
  it("is false without an XR system", async () => {
    assert.equal(await isImmersiveArSupported(undefined), false);
    assert.equal(await isImmersiveArSupported({}), false);
  });

  it("asks for immersive-ar only", async () => {
    const seen = [];
    const xr = {
      async isSessionSupported(mode) {
        seen.push(mode);
        return mode === XR_MODE;
      },
    };
    assert.equal(await isImmersiveArSupported(xr), true);
    assert.deepEqual(seen, [XR_MODE]);
  });

  it("swallows isSessionSupported failures", async () => {
    const xr = {
      async isSessionSupported() {
        throw new Error("secure context");
      },
    };
    assert.equal(await isImmersiveArSupported(xr), false);
  });
});

describe("immersiveArSessionInit", () => {
  it("adds a DOM overlay when a root is given", () => {
    const root = { id: "overlay" };
    const init = immersiveArSessionInit(root);
    assert.ok(init.optionalFeatures.includes("local-floor"));
    assert.ok(init.optionalFeatures.includes("dom-overlay"));
    assert.equal(init.domOverlay.root, root);
  });

  it("omits overlay when no root is given", () => {
    const init = immersiveArSessionInit(null);
    assert.deepEqual(init.optionalFeatures, ["local-floor"]);
    assert.equal(init.domOverlay, undefined);
  });
});
