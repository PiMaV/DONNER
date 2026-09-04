import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  columnMajorFromFaceMatrix,
  createFaceTracker,
  createOneEuro,
  createPoseFilter,
  identityQuat,
  mirrorPoseX,
  poseFromColumnMajor,
  poseFromFaceMatrix,
  poseFromLandmarkerResult,
  quatNlerp,
  rowMajorToColumnMajor,
} from "../src/face-pose.js";

function translationColumnMajor(x, y, z) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

describe("face matrix pose", () => {
  it("reads translation from a column-major 4×4", () => {
    const pose = poseFromColumnMajor(translationColumnMajor(0.2, -0.1, 0.5));
    assert.ok(pose);
    assert.equal(pose.position.x, 0.2);
    assert.equal(pose.position.y, -0.1);
    assert.equal(pose.position.z, 0.5);
    assert.equal(pose.quaternion.w, 1);
    assert.equal(pose.scale, 1);
  });

  it("keeps a column-major translation in the last column even when rows=4", () => {
    const col = translationColumnMajor(3, 4, 5);
    const pose = poseFromFaceMatrix({ rows: 4, columns: 4, data: col });
    assert.equal(pose.position.x, 3);
    assert.equal(pose.position.y, 4);
    assert.equal(pose.position.z, 5);
  });

  it("transposes a MediaPipe row-major matrix so translation is the last column", () => {
    const row = {
      rows: 4,
      columns: 4,
      data: [
        1, 0, 0, 3,
        0, 1, 0, 4,
        0, 0, 1, 5,
        0, 0, 0, 1,
      ],
    };
    const col = columnMajorFromFaceMatrix(row);
    assert.deepEqual(col.slice(12, 15), [3, 4, 5]);
    const pose = poseFromFaceMatrix(row);
    assert.equal(pose.position.x, 3);
    assert.equal(pose.position.y, 4);
    assert.equal(pose.position.z, 5);
  });

  it("rowMajorToColumnMajor leaves identity unchanged", () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    assert.deepEqual(rowMajorToColumnMajor(id), id);
  });

  it("reads a landmarker result and returns null without a face", () => {
    assert.equal(poseFromLandmarkerResult({ facialTransformationMatrixes: [] }), null);
    const pose = poseFromLandmarkerResult({
      facialTransformationMatrixes: [
        { rows: 4, columns: 4, data: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1] },
      ],
      faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    });
    assert.equal(pose.position.x, 1);
    assert.equal(pose.position.y, 2);
    assert.equal(pose.position.z, 3);
  });

  it("mirrors X so a selfie overlay matches a CSS-unmirrored canvas", () => {
    const pose = poseFromColumnMajor(translationColumnMajor(0.4, 0.1, -0.5));
    const mirrored = mirrorPoseX(pose);
    assert.equal(mirrored.position.x, -0.4);
    assert.equal(mirrored.position.y, 0.1);
    assert.equal(mirrored.quaternion.w, 1);
    assert.equal(identityQuat().w, 1);
  });
});

describe("one-euro and tracker", () => {
  it("passes the first sample through and then damps a spike", () => {
    const euro = createOneEuro(1, 0, 1);
    assert.equal(euro.filter(10, 0), 10);
    const next = euro.filter(20, 16);
    assert.ok(next > 10 && next < 20);
  });

  it("nlerps toward the shortest quaternion path", () => {
    const a = { x: 0, y: 0, z: 0, w: 1 };
    const b = { x: 0, y: 0, z: 0, w: -1 };
    const q = quatNlerp(a, b, 0.5);
    assert.ok(Math.abs(q.w) > 0.99);
  });

  it("freezes the last pose for a few missed frames, then drops", () => {
    const tracker = createFaceTracker({ freezeFrames: 2, lockMs: 1000, minConfidence: 0.5 });
    const pose = poseFromColumnMajor(translationColumnMajor(1, 0, 0));
    const a = tracker.push(pose, 0);
    assert.equal(a.pose.position.x, 1);
    assert.equal(a.frozen, false);
    const b = tracker.push(null, 16);
    assert.equal(b.frozen, true);
    assert.equal(b.pose.position.x, 1);
    const c = tracker.push(null, 32);
    assert.equal(c.frozen, true);
    const d = tracker.push(null, 48);
    assert.equal(d.lost, true);
    assert.equal(d.pose, null);
  });

  it("locks after continuous tracking", () => {
    const tracker = createFaceTracker({ freezeFrames: 2, lockMs: 100, minConfidence: 0.5 });
    const pose = poseFromColumnMajor(translationColumnMajor(0, 0, -20));
    assert.equal(tracker.push(pose, 0).locked, false);
    assert.equal(tracker.push(pose, 50).locked, false);
    assert.equal(tracker.push(pose, 100).locked, true);
  });

  it("smooths translation more than a raw jump", () => {
    const filter = createPoseFilter();
    const a = poseFromColumnMajor(translationColumnMajor(0, 0, 0));
    const b = poseFromColumnMajor(translationColumnMajor(10, 0, 0));
    filter.push(a, 0);
    const out = filter.push(b, 16);
    assert.ok(out.position.x > 0 && out.position.x < 10);
  });

  it("uses the same pose for overlay and brain stage", () => {
    const tracker = createFaceTracker({ freezeFrames: 2, lockMs: 1000, minConfidence: 0.5 });
    const a = poseFromColumnMajor(translationColumnMajor(0, 0, 0));
    const b = poseFromColumnMajor(translationColumnMajor(10, 0, 0));
    tracker.push(a, 0);
    const out = tracker.push(b, 16);
    assert.equal(out.stagePose.position.x, out.pose.position.x);
    assert.ok(out.pose.position.x > 0 && out.pose.position.x < 10);
  });

  it("keeps the last pose after lock; tracking resumes when the face returns", () => {
    const tracker = createFaceTracker({ freezeFrames: 2, lockMs: 40, minConfidence: 0.5 });
    const pose = poseFromColumnMajor(translationColumnMajor(2, 0, 0));
    assert.equal(tracker.push(pose, 0).locked, false);
    assert.equal(tracker.push(pose, 40).locked, true);
    const held = tracker.push(null, 56);
    assert.equal(held.locked, true);
    assert.equal(held.frozen, true);
    assert.equal(held.pose.position.x, 2);
    const still = tracker.push(null, 200);
    assert.equal(still.locked, true);
    assert.equal(still.pose.position.x, 2);
    const back = poseFromColumnMajor(translationColumnMajor(2.2, 0, 0));
    const resumed = tracker.push(back, 216);
    assert.equal(resumed.locked, true);
    assert.equal(resumed.frozen, false);
    assert.ok(resumed.pose);
    tracker.reset();
    assert.equal(tracker.locked, false);
    assert.equal(tracker.push(null, 232).pose, null);
  });
});
