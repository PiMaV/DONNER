import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clearOverlay, drawFaceLandmarks, fitOverlayCanvas } from "../src/face-draw.js";

describe("face 2D overlay", () => {
  it("sizes the canvas to the video frame", () => {
    const canvas = { width: 0, height: 0 };
    assert.equal(fitOverlayCanvas(canvas, { videoWidth: 0, videoHeight: 480 }), false);
    assert.equal(fitOverlayCanvas(canvas, { videoWidth: 640, videoHeight: 480 }), true);
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 480);
    assert.equal(fitOverlayCanvas(canvas, { videoWidth: 640, videoHeight: 480 }), true);
  });

  it("draws tessellation and dots into a fake 2D context", () => {
    const ops = [];
    const ctx = {
      canvas: { width: 100, height: 100 },
      beginPath() { ops.push("begin"); },
      moveTo(x, y) { ops.push(["move", x, y]); },
      lineTo(x, y) { ops.push(["line", x, y]); },
      stroke() { ops.push("stroke"); },
      arc(x, y, r) { ops.push(["arc", x, y, r]); },
      fill() { ops.push("fill"); },
      clearRect(x, y, w, h) { ops.push(["clear", x, y, w, h]); },
    };
    const landmarks = [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }];
    drawFaceLandmarks(ctx, landmarks, [{ start: 0, end: 1 }]);
    assert.deepEqual(ops[1], ["move", 25, 50]);
    assert.deepEqual(ops[2], ["line", 75, 50]);
    assert.equal(ops.includes("stroke"), true);
    drawFaceLandmarks(ctx, landmarks, [{ start: 0, end: 1 }], { mirrored: true });
    assert.ok(ops.some((op) => Array.isArray(op) && op[0] === "move" && op[1] === 75));
    clearOverlay(ctx);
    assert.deepEqual(ops.at(-1), ["clear", 0, 0, 100, 100]);
  });
});
