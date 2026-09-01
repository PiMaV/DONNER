import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  XR_BOARD_CELLS,
  XR_BOARD_METERS,
  XR_HIT_TEST,
  XR_MODE,
  immersiveArSessionInit,
  isHeadsetBrowser,
  overlayRootForAr,
  preferredReferenceSpaceType,
  withXrWebGLLayerOnly,
  isImmersiveArSupported,
  arBottomLift,
  arStandLift,
  clampArMag,
  quatFromTo,
  rotateVecByQuat,
  standQuatFromAxis,
  volumeLocalAabb,
  requestViewerHitTestSource,
  shouldFallbackArPlace,
  translationFromMatrix4,
  spaceDragAnchor,
  spaceDragOffset,
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

describe("stand axis", () => {
  it("is identity when product Z already stands on the table", () => {
    const q = standQuatFromAxis("z");
    assert.equal(q.x, 0);
    assert.equal(q.y, 0);
    assert.equal(q.z, 0);
    assert.equal(q.w, 1);
  });

  it("rotates product X onto world +Y", () => {
    const q = quatFromTo({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const v = rotateVecByQuat({ x: 1, y: 0, z: 0 }, q);
    assert.ok(Math.abs(v.x) < 1e-6);
    assert.ok(Math.abs(v.y - 1) < 1e-6);
    assert.ok(Math.abs(v.z) < 1e-6);
  });

  it("matches arBottomLift when the pillar still stands on Z", () => {
    const box = volumeLocalAabb(32, 32, -48, 0, 1);
    assert.equal(arStandLift("z", box, 0.0125), arBottomLift(-48, 0.0125));
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

describe("headset AR session options", () => {
  it("treats Quest Browser as a headset", () => {
    assert.equal(isHeadsetBrowser("Mozilla/5.0 OculusBrowser/36.0 Quest 3"), true);
    assert.equal(isHeadsetBrowser("Mozilla/5.0 Wolvic/1.0"), true);
    assert.equal(isHeadsetBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/140.0.0.0"), false);
  });

  it("does not attach a DOM overlay on Quest", () => {
    const root = { id: "xr-overlay" };
    assert.equal(overlayRootForAr(root, "OculusBrowser/36 Quest"), null);
    assert.equal(overlayRootForAr(root, "Mozilla/5.0 Chrome/140"), root);
    assert.equal(overlayRootForAr(null, "Mozilla/5.0 Chrome/140"), null);
  });

  it("picks local when local-floor is missing", async () => {
    const session = {
      async requestReferenceSpace(type) {
        if (type === "local-floor") throw new Error("no floor");
        if (type === "local") return { type };
        throw new Error(type);
      },
    };
    assert.equal(await preferredReferenceSpaceType(session), "local");
  });

  it("falls back to local when no space type is granted", async () => {
    const session = {
      async requestReferenceSpace() {
        throw new Error("none");
      },
    };
    assert.equal(await preferredReferenceSpaceType(session), "local");
  });

  it("hides projection layers so Three.js uses XRWebGLLayer", async () => {
    const proto = { createProjectionLayer() {} };
    globalThis.XRWebGLBinding = function Binding() {};
    globalThis.XRWebGLBinding.prototype = proto;
    let seen = false;
    await withXrWebGLLayerOnly(async () => {
      seen = !("createProjectionLayer" in proto);
    });
    assert.equal(seen, true);
    assert.equal(typeof proto.createProjectionLayer, "function");
    delete globalThis.XRWebGLBinding;
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

describe("space drag", () => {
  it("keeps the grabbed offset on the hand", () => {
    const offset = spaceDragOffset({ x: 1, y: 2, z: 3 }, { x: 0.2, y: 0.5, z: 1 });
    assert.deepEqual(offset, { x: 0.8, y: 1.5, z: 2 });
    assert.deepEqual(spaceDragAnchor({ x: 0.5, y: 0, z: 1.2 }, offset), {
      x: 1.3,
      y: 1.5,
      z: 3.2,
    });
  });
});

describe("shouldFallbackArPlace", () => {
  it("waits a moment when hit-test was not granted", () => {
    assert.equal(shouldFallbackArPlace({ locked: false, hasHitTest: false, waitedMs: 0 }), false);
    assert.equal(shouldFallbackArPlace({ locked: false, hasHitTest: false, waitedMs: 400 }), true);
  });

  it("waits longer when hit-test is granted but finds no plane", () => {
    assert.equal(shouldFallbackArPlace({ locked: false, hasHitTest: true, waitedMs: 400 }), false);
    assert.equal(shouldFallbackArPlace({ locked: false, hasHitTest: true, waitedMs: 1600 }), true);
  });

  it("does not move a locked volume", () => {
    assert.equal(shouldFallbackArPlace({ locked: true, hasHitTest: false, waitedMs: 8000 }), false);
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
