import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KIND_WARMUP, SCALE_UNIFORM, cubeFill } from "../src/dynamics.js";
import {
  CONWAY_KIND_HEX,
  CONWAY_WARMUP_K,
  COUNT_RAMP_HEX,
  countKindHex,
  encodingCubeFill,
  encodingFill,
  lerpHex,
} from "../src/encoding.js";

describe("encoding adapter", () => {
  it("exposes a Conway LUT of five kind colors", () => {
    assert.equal(CONWAY_KIND_HEX.length, 5);
    assert.equal(CONWAY_WARMUP_K, KIND_WARMUP);
  });

  it("matches dynamics cubeFill for Conway events", () => {
    const event = { k: 0, s: 8 };
    assert.equal(encodingCubeFill(event, "time"), cubeFill(event, "time"));
    assert.equal(encodingCubeFill(event, "none"), SCALE_UNIFORM);
    assert.equal(encodingFill(KIND_WARMUP, 16, "time"), SCALE_UNIFORM);
    assert.equal(encodingCubeFill(null, "time"), 0);
  });

  it("builds a count LUT from cyan through gold to coral", () => {
    const lut = countKindHex(4);
    assert.equal(lut.length, 5);
    assert.equal(lut[1], COUNT_RAMP_HEX[0]);
    assert.equal(lut[4], COUNT_RAMP_HEX[2]);
    assert.equal(lerpHex(0xff0000, 0x00ff00, 0), 0xff0000);
    assert.equal(encodingFill(3, 8, "none", -1), SCALE_UNIFORM);
  });
});
