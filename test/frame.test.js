import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  closestTOnSegment2,
  distPointToSegment2,
  distRayToSegment3,
  closestAxisCoord,
  FRAME_PICK_M,
  frameBarThickness,
  frameFaceOnScore,
  frameHandleInset,
  frameRingBox,
  pickOverlappingFrameHit,
  pointerGrabsFrames,
  SCREEN_AXIS_MIN_PX,
  screenAxisDragMap,
  screenAxisDragStep,
} from "../src/frame.js";

describe("frame rings", () => {
  it("keeps the playhead at the true plane size", () => {
    const play = frameRingBox(20, 12, 1, "z", -10, 0, frameHandleInset(1, "focus", 20, 12, -10, 0));
    assert.equal(play.hw, 10);
    assert.equal(play.hd, 6);
  });

  it("pulls clip rings well inside the playhead so they do not share a side", () => {
    const cs = 1;
    const play = frameRingBox(20, 12, cs, "z", -10, 0, frameHandleInset(cs, "focus", 20, 12, -10, 0));
    const clip = frameRingBox(20, 12, cs, "z", -10, 0, frameHandleInset(cs, "far", 20, 12, -10, 0));
    assert.ok(play.hw - clip.hw > 1.4);
    assert.ok(play.hd - clip.hd > 1.4);
    const xPlay = frameRingBox(20, 12, cs, "x", -10, 0, frameHandleInset(cs, "focus", 20, 12, -10, 0));
    const yClip = frameRingBox(20, 12, cs, "y", -10, 0, frameHandleInset(cs, "near", 20, 12, -10, 0));
    assert.ok(xPlay.hd - yClip.hd > 1.4);
  });

  it("draws the playhead thicker than a clip", () => {
    const play = frameBarThickness(1, "focus");
    const clip = frameBarThickness(1, "far");
    assert.ok(play.visual > clip.visual * 1.8);
  });

  it("scales bar thickness with the brick span, not only the cell", () => {
    const small = frameBarThickness(1, "focus", 32, 32, 0, 32);
    const large = frameBarThickness(1, "focus", 256, 256, 0, 215);
    assert.ok(large.visual > small.visual * 4);
    const clip = frameBarThickness(1, "far", 256, 256, 0, 215);
    assert.ok(large.visual > clip.visual);
  });
});

describe("screen-space edge distance", () => {
  it("measures pixels to a segment, not only to the endpoints", () => {
    assert.equal(distPointToSegment2(1, 2, 0, 0, 4, 0), 2);
    assert.ok(Math.abs(closestTOnSegment2(1, 2, 0, 0, 4, 0) - 0.25) < 1e-9);
  });
});

describe("overlapping frame pick", () => {
  it("ignores edges farther than the pixel rim", () => {
    const picked = pickOverlappingFrameHit(
      [{ axis: "z", handle: "focus", pixelDist: 40, viewDir: { x: 0, y: -1, z: 0 } }],
      "",
      28,
    );
    assert.equal(picked, null);
  });

  it("prefers the more face-on plane when two hits are at the same pixel distance", () => {
    const viewFromAbove = { x: 0, y: -1, z: 0 };
    const picked = pickOverlappingFrameHit(
      [
        { axis: "y", handle: "focus", pixelDist: 10, viewDir: viewFromAbove },
        { axis: "z", handle: "focus", pixelDist: 10.5, viewDir: viewFromAbove },
      ],
      "",
    );
    assert.equal(picked.axis, "z");
  });

  it("keeps the hovered ring while the pointer stays on a shared edge", () => {
    const view = { x: 0.4, y: -0.7, z: 0.5 };
    const picked = pickOverlappingFrameHit(
      [
        { axis: "x", handle: "focus", pixelDist: 8, viewDir: view },
        { axis: "z", handle: "focus", pixelDist: 8.5, viewDir: view },
      ],
      "x:focus",
    );
    assert.equal(picked.axis, "x");
  });

  it("prefers the playhead when a clip sits on the same lid", () => {
    const view = { x: 0, y: -1, z: 0 };
    const picked = pickOverlappingFrameHit(
      [
        { axis: "z", handle: "near", pixelDist: 6, viewDir: view },
        { axis: "z", handle: "focus", pixelDist: 6.5, viewDir: view },
      ],
      "",
    );
    assert.equal(picked.handle, "focus");
  });

  it("still picks a clip when the pointer is clearly on that inset ring", () => {
    const view = { x: 0, y: -1, z: 0 };
    const picked = pickOverlappingFrameHit(
      [
        { axis: "z", handle: "far", pixelDist: 1, viewDir: view },
        { axis: "z", handle: "focus", pixelDist: 12, viewDir: view },
      ],
      "",
    );
    assert.equal(picked.handle, "far");
  });

  it("scores a top-down look as face-on for Z", () => {
    assert.ok(frameFaceOnScore({ x: 0, y: -1, z: 0 }, "z") > 0.9);
    assert.ok(frameFaceOnScore({ x: 0, y: -1, z: 0 }, "x") < 0.2);
  });
});

describe("screen-axis plane drag", () => {
  it("maps one world step to a screen unit and pixel length", () => {
    const mapped = screenAxisDragMap({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1, (p) => ({
      x: p.x * 40,
      y: p.y,
    }));
    assert.ok(mapped);
    assert.equal(mapped.ux, 1);
    assert.equal(mapped.uy, 0);
    assert.equal(mapped.px, 40);
    assert.equal(screenAxisDragStep(40, 0, mapped), 1);
    assert.equal(screenAxisDragStep(0, 40, mapped), 0);
  });

  it("floors a grazing axis so a millimetre of mouse does not jump the plane", () => {
    const mapped = screenAxisDragMap({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1, (p) => ({
      x: p.x * 0.2,
      y: p.y,
    }));
    assert.ok(mapped);
    assert.equal(mapped.px, SCREEN_AXIS_MIN_PX);
    assert.equal(screenAxisDragStep(4, 0, mapped), 0);
    assert.equal(screenAxisDragStep(SCREEN_AXIS_MIN_PX, 0, mapped), 1);
  });
});

describe("pointerGrabsFrames", () => {
  it("lets a mouse grab a ring and leaves touch for orbit", () => {
    assert.equal(pointerGrabsFrames("mouse"), true);
    assert.equal(pointerGrabsFrames("pen"), true);
    assert.equal(pointerGrabsFrames("touch"), false);
  });
});

describe("XR frame pick", () => {
  it("measures a world-meter gap from a ray to a segment", () => {
    const hit = distRayToSegment3(0, 0, 0, 1, 0, 0, 2, -1, 0, 2, 1, 0);
    assert.ok(hit.dist < 1e-9);
    assert.ok(Math.abs(hit.t - 2) < 1e-9);
  });

  it("keeps an 8 cm rim for controller rays", () => {
    assert.equal(FRAME_PICK_M, 0.08);
  });

  it("projects a turntable ray onto a product axis", () => {
    assert.equal(closestAxisCoord({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, "z"), 5);
    assert.ok(Math.abs(closestAxisCoord({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, "x") - 1) < 1e-9);
  });
});
