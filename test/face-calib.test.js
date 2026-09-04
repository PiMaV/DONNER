import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FACE_AR_SOURCE,
  FACE_AR_SOURCE_FALLBACK,
  FACE_CM_TO_M,
  FACE_DEFAULT_OFFSET,
  FACE_FRONT_INSET_M,
  FACE_FRONT_LIFT_M,
  FACE_SKULL_M,
  clampFaceMag,
  composeFaceStage,
  faceArSourceId,
  faceExtentCells,
  FACE_MAG_DEFAULT,
  facePlacementFromMm,
  faceStageScale,
  isFaceProjectSource,
  offsetFromFaceFront,
  readFacePlacementParams,
  writeFacePlacementParams,
} from "../src/face-calib.js";
import { COUNT_DEMOS } from "../src/config.js";
import { poseFromColumnMajor } from "../src/face-pose.js";

describe("face stage fit", () => {
  it("maps 32 cells of size 1 to 16 cm", () => {
    assert.equal(faceStageScale(1, 1, 32), FACE_SKULL_M / 32);
    assert.equal(faceStageScale(1, 2, 32), (FACE_SKULL_M / 32) * 2);
    assert.equal(clampFaceMag(0), 1.2);
    assert.equal(clampFaceMag(9), 5);
    assert.equal(faceExtentCells(108, 128, 104), 128);
    assert.equal(FACE_MAG_DEFAULT, 1.2);
  });

  it("prefers the low MNI cube when that demo exists", () => {
    assert.equal(faceArSourceId(COUNT_DEMOS), FACE_AR_SOURCE);
    assert.equal(faceArSourceId({}), FACE_AR_SOURCE);
    assert.equal(faceArSourceId({ mni152: {} }), FACE_AR_SOURCE_FALLBACK);
    assert.equal(isFaceProjectSource("mni152-low"), true);
    assert.equal(isFaceProjectSource("mni152"), true);
    assert.equal(isFaceProjectSource("ignition"), false);
    assert.equal(isFaceProjectSource("conway"), false);
  });
});

describe("face front offset", () => {
  it("puts Inset behind the face on canonical −Z", () => {
    assert.deepEqual(offsetFromFaceFront({ shift: 0.01, lift: -0.02, inset: 0.04 }), {
      x: 0.01,
      y: -0.02,
      z: -0.04,
    });
    assert.equal(FACE_DEFAULT_OFFSET.z, -FACE_FRONT_INSET_M);
    assert.equal(FACE_DEFAULT_OFFSET.y, FACE_FRONT_LIFT_M);
  });

  it("round-trips millimetre placement on the door query", () => {
    const params = new URLSearchParams();
    writeFacePlacementParams(params, { shift: 12, lift: 96, inset: 40, mag: 1.25 });
    assert.equal(params.get("shift"), "12");
    assert.equal(params.get("lift"), "96");
    assert.equal(params.get("inset"), "40");
    assert.equal(params.get("size"), "1.25");
    const back = readFacePlacementParams(params);
    assert.deepEqual(back, facePlacementFromMm({ shift: 12, lift: 96, inset: 40, mag: 1.25 }));
    const empty = new URLSearchParams();
    writeFacePlacementParams(empty, { shift: 0, lift: 141, inset: 50, mag: 1.2 });
    assert.equal(empty.toString(), "");
  });
});

describe("composeFaceStage", () => {
  it("converts centimetres to metres and applies a local offset in head space", () => {
    const pose = poseFromColumnMajor([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, -30, 1,
    ]);
    const out = composeFaceStage(pose, {
      offset: { x: 0.01, y: 0, z: 0 },
      scale: 0.002,
    });
    assert.equal(out.position.x, 10 * FACE_CM_TO_M + 0.01);
    assert.equal(out.position.y, 20 * FACE_CM_TO_M);
    assert.equal(out.position.z, -30 * FACE_CM_TO_M);
    assert.equal(out.scale, 0.002);
  });

  it("flips the local X offset for L/R", () => {
    const pose = poseFromColumnMajor([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    const a = composeFaceStage(pose, { offset: { x: 0.05, y: 0, z: 0 }, flipLR: false });
    const b = composeFaceStage(pose, { offset: { x: 0.05, y: 0, z: 0 }, flipLR: true });
    assert.equal(a.position.x, 0.05);
    assert.equal(b.position.x, -0.05);
  });
});
