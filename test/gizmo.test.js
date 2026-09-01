import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  axisIndexFromBack,
  lookAlignedWithAxis,
  productViewDir,
  productToWorld,
  slabIndices,
  sliceMaxBack,
} from "../src/axes.js";
import { gizmoCssBox, gizmoOnScreen, gizmoScissor, MARGIN_CSS, viewFromLocalNormal } from "../src/gizmo-layout.js";
import { frustumFromDistance, offsetLength, pinOrbitHeight, snapPose } from "../src/orbit.js";
import { gizmoFollowYaw } from "../src/turntable.js";
import { clampCubeCap, DEFAULTS } from "../src/config.js";

describe("product view directions", () => {
  it("maps product +Z to world +Y (top-down)", () => {
    assert.deepEqual(productViewDir("z", 1), { x: 0, y: 1, z: 0 });
    assert.deepEqual(productViewDir("z", -1), { x: 0, y: -1, z: 0 });
  });

  it("maps product +Y to world +Z and +X to world +X", () => {
    assert.deepEqual(productViewDir("y", 1), { x: 0, y: 0, z: 1 });
    assert.deepEqual(productViewDir("x", 1), { x: 1, y: 0, z: 0 });
    assert.deepEqual(productViewDir("X", 1), { x: 1, y: 0, z: 0 });
  });

  it("stays consistent with productToWorld basis", () => {
    const x = productViewDir("x", 1);
    const y = productViewDir("y", 1);
    const z = productViewDir("z", 1);
    assert.deepEqual(productToWorld(x.x, y.z, z.y), { x: 1, y: 1, z: 1 });
  });
});

describe("slice stack indices", () => {
  it("puts the high end at back = 0", () => {
    assert.equal(sliceMaxBack("x", 32, 16, 80), 31);
    assert.equal(sliceMaxBack("y", 32, 16, 80), 15);
    assert.equal(sliceMaxBack("z", 32, 16, 80), 80);
    assert.equal(axisIndexFromBack(0, 31), 31);
    assert.equal(axisIndexFromBack(31, 31), 0);
    assert.equal(axisIndexFromBack(10, 31), 21);
  });

  it("maps gold grips to an inclusive index span", () => {
    assert.deepEqual(slabIndices(0, 31, 31), { lo: 0, hi: 31 });
    assert.deepEqual(slabIndices(0, 0, 31), { lo: 31, hi: 31 });
    assert.deepEqual(slabIndices(5, 10, 31), { lo: 21, hi: 26 });
  });
});

describe("gizmoCssBox", () => {
  const canvas = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };

  it("sits in the upper-right with a margin", () => {
    const box = gizmoCssBox(canvas, 96, MARGIN_CSS);
    assert.equal(box.size, 96);
    assert.equal(box.top, MARGIN_CSS);
    assert.equal(box.left, 800 - MARGIN_CSS - 96);
  });

  it("shifts left of a HUD rail that occupies the top-right", () => {
    const rail = { left: 620, top: 12, right: 788, bottom: 540, width: 168, height: 528 };
    const box = gizmoCssBox(canvas, 96, MARGIN_CSS, [rail]);
    assert.equal(box.top, MARGIN_CSS);
    assert.equal(box.left, 620 - MARGIN_CSS - 96);
  });

  it("sits left of the View card, not in the gap before the stack", () => {
    const view = { left: 500, top: 12, right: 668, bottom: 220, width: 168, height: 208 };
    const stack = { left: 676, top: 12, right: 716, bottom: 540, width: 40, height: 528 };
    const box = gizmoCssBox(canvas, 72, MARGIN_CSS, [view, stack]);
    assert.equal(box.top, MARGIN_CSS);
    assert.equal(box.left, 500 - MARGIN_CSS - 72);
  });

  it("uses a rail slot when one is given", () => {
    const view = { left: 500, top: 12, right: 668, bottom: 220, width: 168, height: 208 };
    const stack = { left: 676, top: 12, right: 716, bottom: 540, width: 40, height: 528 };
    const slot = { left: 356, top: 12, right: 500, bottom: 156, width: 144, height: 144 };
    const box = gizmoCssBox(canvas, 144, MARGIN_CSS, [view, stack], slot);
    assert.equal(box.left, 356);
    assert.equal(box.top, 12);
    assert.equal(box.size, 144);
  });

  it("ignores left-side chrome", () => {
    const brand = { left: 12, top: 12, right: 180, bottom: 56, width: 168, height: 44 };
    const box = gizmoCssBox(canvas, 96, MARGIN_CSS, [brand]);
    assert.equal(box.left, 800 - MARGIN_CSS - 96);
  });

  it("ignores a bottom timeline that does not occupy the top-right", () => {
    const rail = { left: 12, top: 520, right: 788, bottom: 576, width: 776, height: 56 };
    const box = gizmoCssBox(canvas, 96, MARGIN_CSS, [rail]);
    assert.equal(box.left, 800 - MARGIN_CSS - 96);
  });

  it("ignores a full-width bar so the cube stays in the top-right", () => {
    const bar = { left: 0, top: 0, right: 800, bottom: 80, width: 800, height: 80 };
    const box = gizmoCssBox(canvas, 96, MARGIN_CSS, [bar]);
    assert.equal(box.left, 800 - MARGIN_CSS - 96);
    assert.equal(box.top, MARGIN_CSS);
  });
});

describe("gizmoOnScreen", () => {
  it("is desktop orbit only", () => {
    assert.equal(gizmoOnScreen({}), true);
    assert.equal(gizmoOnScreen({ coarse: true }), false);
    assert.equal(gizmoOnScreen({ narrow: true }), false);
    assert.equal(gizmoOnScreen({ ar: true }), false);
  });
});

describe("gizmoScissor", () => {
  it("stays in CSS pixels so Three.js can apply the pixel ratio", () => {
    const canvas = { left: 0, top: 0, right: 800, bottom: 600 };
    const box = { left: 500, top: 12, size: 144 };
    const s = gizmoScissor(box, canvas, 800, 600);
    assert.equal(s.size, 144);
    assert.equal(s.x, 500);
    assert.equal(s.y, 600 - 12 - 144);
  });
});

describe("viewFromLocalNormal", () => {
  it("maps engine axes onto product X/Y/Z", () => {
    assert.deepEqual(viewFromLocalNormal(1, 0, 0), { axis: "x", sign: 1 });
    assert.deepEqual(viewFromLocalNormal(-1, 0, 0), { axis: "x", sign: -1 });
    assert.deepEqual(viewFromLocalNormal(0, 0, 1), { axis: "y", sign: 1 });
    assert.deepEqual(viewFromLocalNormal(0, 1, 0), { axis: "z", sign: 1 });
    assert.deepEqual(viewFromLocalNormal(0, -1, 0), { axis: "z", sign: -1 });
  });
});

describe("viewcube follows turntable yaw", () => {
  it("desktop snap stays on world product axes (object yaw is AR-only)", () => {
    const dir = productViewDir("x", 1);
    assert.deepEqual(dir, { x: 1, y: 0, z: 0 });
  });

  it("uses invert(camera) when yaw is 0", () => {
    const g = gizmoFollowYaw({ x: 0, y: 0, z: 0, w: 1 }, 0);
    assert.equal(g.x, 0);
    assert.equal(g.y, 0);
    assert.equal(g.z, 0);
    assert.equal(g.w, 1);
  });

  it("can still compose invert(camera) times object yaw for AR", () => {
    const g = gizmoFollowYaw({ x: 0, y: 0, z: 0, w: 1 }, Math.PI / 2);
    assert.ok(Math.abs(g.y - Math.sin(Math.PI / 4)) < 1e-12);
    assert.ok(Math.abs(g.w - Math.cos(Math.PI / 4)) < 1e-12);
  });
});

describe("ortho and snap helpers", () => {
  it("builds a frustum from distance and FOV", () => {
    const h = frustumFromDistance(10, 90);
    assert.ok(Math.abs(h - 10) < 1e-6);
  });

  it("detects a look aligned with the slice axis", () => {
    assert.equal(
      lookAlignedWithAxis({ x: 0, y: 40, z: 0.05 }, { x: 0, y: 0, z: 0 }, "z"),
      true,
    );
    assert.equal(
      lookAlignedWithAxis({ x: 40, y: 8, z: 12 }, { x: 0, y: 0, z: 0 }, "z"),
      false,
    );
    assert.equal(
      lookAlignedWithAxis({ x: 40, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, "x"),
      true,
    );
  });

  it("snaps onto the view ray and nudges polar-zero views", () => {
    const p = snapPose({ x: 0, y: -8, z: 0 }, { x: 0, y: 1, z: 0 }, 20);
    assert.ok(Math.abs(p.y + 8 - 20) < 1e-6);
    assert.ok(Math.abs(p.z) > 0.01);
    assert.equal(offsetLength(p, { x: 0, y: -8, z: 0 }) > 19, true);
  });

  it("pins height without clearing XY pan", () => {
    const pinned = pinOrbitHeight({ x: 4, y: 2, z: -3 }, { x: 4, y: -8, z: -3 }, -20);
    assert.deepEqual(pinned.target, { x: 4, y: -20, z: -3 });
    assert.deepEqual(pinned.cam, { x: 4, y: -10, z: -3 });
  });
});

describe("cube cap", () => {
  it("clamps to the bench range", () => {
    assert.equal(clampCubeCap(200_000), 200_000);
    assert.equal(clampCubeCap(1), DEFAULTS.cubeCapMin);
    assert.equal(clampCubeCap(9e9), DEFAULTS.cubeCapMax);
    assert.equal(clampCubeCap("nope"), DEFAULTS.maxInstances);
  });
});
