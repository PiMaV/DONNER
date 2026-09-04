import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clearOverlay, drawFaceLandmarks, drawIrisDiscs, drawPupilDiscs, FACE_IRIS_FILL, FACE_PUPIL_FILL, fitOverlayCanvas } from "../src/face-draw.js";

describe("face 2D overlay", () => {
  it("sizes the canvas to the video frame", () => {
    const canvas = { width: 0, height: 0 };
    assert.equal(fitOverlayCanvas(canvas, { videoWidth: 0, videoHeight: 480 }), false);
    assert.equal(fitOverlayCanvas(canvas, { videoWidth: 640, videoHeight: 480 }), true);
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 480);
    assert.equal(fitOverlayCanvas(canvas, { videoWidth: 640, videoHeight: 480 }), true);
    const hd = { width: 0, height: 0 };
    assert.equal(fitOverlayCanvas(hd, { videoWidth: 1280, videoHeight: 720 }), true);
    assert.equal(hd.width, 640);
    assert.equal(hd.height, 360);
    assert.equal(fitOverlayCanvas(hd, { videoWidth: 1280, videoHeight: 720 }, { maxWidth: 320 }), true);
    assert.equal(hd.width, 320);
    assert.equal(hd.height, 180);
  });

  it("draws tessellation and dots into a fake 2D context", () => {
    const ops = [];
    const ctx = {
      canvas: { width: 100, height: 100 },
      beginPath() { ops.push("begin"); },
      moveTo(x, y) { ops.push(["move", x, y]); },
      lineTo(x, y) { ops.push(["line", x, y]); },
      stroke() { ops.push("stroke"); },
      closePath() { ops.push("close"); },
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
    const beforeSkip = ops.length;
    drawFaceLandmarks(ctx, landmarks, [{ start: 0, end: 1 }], { dots: false });
    assert.equal(ops.slice(beforeSkip).includes("fill"), false);
    const beforePupils = ops.length;
    const many = Array.from({ length: 474 }, () => ({ x: 0.1, y: 0.1 }));
    many[468] = { x: 0.4, y: 0.5 };
    many[473] = { x: 0.6, y: 0.5 };
    drawFaceLandmarks(ctx, many, [], { dots: [468, 473] });
    const pupilArcs = ops.slice(beforePupils).filter((op) => Array.isArray(op) && op[0] === "arc");
    assert.equal(pupilArcs.length, 2);
    assert.deepEqual(pupilArcs[0].slice(0, 3), ["arc", 40, 50]);
    clearOverlay(ctx);
    assert.deepEqual(ops.at(-1), ["clear", 0, 0, 100, 100]);
  });

  it("keeps distinct iris and pupil fills", () => {
    assert.match(FACE_IRIS_FILL, /135, 206, 235/);
    assert.match(FACE_PUPIL_FILL, /8, 10, 12/);
  });

  it("draws iris and pupil as circles from the iris ring", () => {
    const ops = [];
    const ctx = {
      canvas: { width: 100, height: 100 },
      beginPath() { ops.push("begin"); },
      arc(x, y, r) { ops.push(["arc", x, y, r]); },
      fill() { ops.push("fill"); },
    };
    const many = Array.from({ length: 478 }, () => ({ x: 0.1, y: 0.1 }));
    many[468] = { x: 0.4, y: 0.5 };
    many[469] = { x: 0.46, y: 0.5 };
    many[470] = { x: 0.4, y: 0.56 };
    many[471] = { x: 0.34, y: 0.5 };
    many[472] = { x: 0.4, y: 0.44 };
    many[473] = { x: 0.6, y: 0.5 };
    many[474] = { x: 0.66, y: 0.5 };
    many[475] = { x: 0.6, y: 0.56 };
    many[476] = { x: 0.54, y: 0.5 };
    many[477] = { x: 0.6, y: 0.44 };
    drawIrisDiscs(ctx, many);
    const irisArcs = ops.filter((op) => Array.isArray(op) && op[0] === "arc");
    assert.equal(irisArcs.length, 2);
    assert.equal(irisArcs[0][1], 40);
    assert.equal(irisArcs[0][2], 50);
    assert.ok(irisArcs[0][3] > 4);
    const beforePupils = ops.length;
    drawPupilDiscs(ctx, many);
    const pupilArcs = ops.slice(beforePupils).filter((op) => Array.isArray(op) && op[0] === "arc");
    assert.equal(pupilArcs.length, 2);
    assert.equal(pupilArcs[0][1], irisArcs[0][1]);
    assert.equal(pupilArcs[0][2], irisArcs[0][2]);
    assert.ok(pupilArcs[0][3] < irisArcs[0][3]);
    assert.ok(pupilArcs[0][3] > 0);
  });
});
