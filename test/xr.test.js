import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  XR_BOARD_CELLS,
  XR_BOARD_METERS,
  XR_HIT_TEST,
  XR_MODE,
  immersiveArSessionInit,
  isImmersiveArSupported,
  arBottomLift,
  clampArMag,
  requestViewerHitTestSource,
  rotateVecByQuat,
  translationFromMatrix4,
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

  it("scales with magnification", () => {
    assert.equal(xrStageScale(1, 2), 0.025);
    assert.equal(xrStageScale(1, 0), 0.0125);
  });
});

describe("arBottomLift", () => {
  it("raises the stage so the oldest drawn Y sits on the table", () => {
    assert.equal(arBottomLift(-48, 0.0125), 48 * 0.0125);
    assert.equal(arBottomLift(0, 0.0125), 0);
  });
});

describe("clampArMag", () => {
  it("clamps to the allowed range", () => {
    assert.equal(clampArMag(1), 1);
    assert.equal(clampArMag(0.1), 0.4);
    assert.equal(clampArMag(9), 2.5);
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
    assert.ok(init.optionalFeatures.includes(XR_HIT_TEST));
    assert.ok(init.optionalFeatures.includes("dom-overlay"));
    assert.equal(init.domOverlay.root, root);
  });

  it("omits overlay when no root is given but still asks for hit-test", () => {
    const init = immersiveArSessionInit(null);
    assert.deepEqual(init.optionalFeatures, ["local-floor", XR_HIT_TEST]);
    assert.equal(init.domOverlay, undefined);
  });
});

describe("translationFromMatrix4", () => {
  it("reads the translation column of a column-major 4×4", () => {
    const m = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0.4, 0.8, -1.2, 1,
    ];
    assert.deepEqual(translationFromMatrix4(m), { x: 0.4, y: 0.8, z: -1.2 });
  });

  it("returns origin when the matrix is missing", () => {
    assert.deepEqual(translationFromMatrix4(null), { x: 0, y: 0, z: 0 });
  });
});

describe("requestViewerHitTestSource", () => {
  it("is null without a hit-test API", async () => {
    assert.equal(await requestViewerHitTestSource(undefined), null);
    assert.equal(await requestViewerHitTestSource({}), null);
  });

  it("requests a viewer-space source", async () => {
    const src = { id: "hts" };
    const session = {
      async requestReferenceSpace(kind) {
        assert.equal(kind, "viewer");
        return { kind };
      },
      async requestHitTestSource({ space }) {
        assert.equal(space.kind, "viewer");
        return src;
      },
    };
    assert.equal(await requestViewerHitTestSource(session), src);
  });

  it("swallows hit-test request failures", async () => {
    const session = {
      async requestReferenceSpace() {
        return {};
      },
      async requestHitTestSource() {
        throw new Error("not enabled");
      },
    };
    assert.equal(await requestViewerHitTestSource(session), null);
  });
});
