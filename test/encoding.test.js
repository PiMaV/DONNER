import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KIND_BASE, SCALE_UNIFORM, cubeFill } from "../src/dynamics.js";
import {
  CONWAY_KIND_HEX,
  CONWAY_BASE_K,
  COUNT_CMAPS,
  COUNT_LUT_RUNGS,
  COUNT_RAMP_HEX,
  countCmapCss,
  countKindHex,
  countTrimLevels,
  countValueToRung,
  countWindowT,
  encodingCubeFill,
  encodingFill,
  grayToCmapRgba,
  lerpHex,
  normalizeCountCmap,
  percentileAt,
} from "../src/encoding.js";

describe("encoding adapter", () => {
  it("exposes a Conway LUT of five kind colors", () => {
    assert.equal(CONWAY_KIND_HEX.length, 5);
    assert.equal(CONWAY_BASE_K, KIND_BASE);
  });

  it("matches dynamics cubeFill for Conway events", () => {
    const event = { k: 0, s: 8 };
    assert.equal(encodingCubeFill(event, "time"), cubeFill(event, "time"));
    assert.equal(encodingCubeFill(event, "none"), SCALE_UNIFORM);
    assert.equal(encodingFill(KIND_BASE, 16, "time"), SCALE_UNIFORM);
    assert.equal(encodingCubeFill(null, "time"), 0);
  });

  it("builds a count LUT from cyan through gold to coral", () => {
    const lut = countKindHex(4);
    assert.equal(lut.length, 5);
    assert.equal(lut[1], COUNT_RAMP_HEX[0]);
    assert.equal(lut[4], COUNT_RAMP_HEX[2]);
    assert.equal(lerpHex(0xff0000, 0x00ff00, 0), 0xff0000);
    assert.equal(encodingFill(3, 8, "none", -1), SCALE_UNIFORM);
    assert.equal(SCALE_UNIFORM, 1);
  });

  it("ramps Gray / Inferno / Plasma / Turbo for the integer scale", () => {
    assert.equal(normalizeCountCmap("nope"), "donner");
    assert.equal(normalizeCountCmap("Inferno"), "inferno");
    const gray = countKindHex(8, "gray");
    assert.ok(gray[1] < gray[8]);
    const inf = countKindHex(8, "inferno");
    assert.equal(inf[1], COUNT_CMAPS.inferno.stops[0]);
    assert.equal(inf[8], COUNT_CMAPS.inferno.stops.at(-1));
    assert.match(countCmapCss("turbo"), /^linear-gradient\(90deg,/);
    assert.equal(countKindHex(4, "plasma").length, 5);
  });

  it("maps 8-bit gray through Plasma for the ingest preview", () => {
    const lo = COUNT_CMAPS.plasma.stops[0];
    const hi = COUNT_CMAPS.plasma.stops.at(-1);
    const rgba = grayToCmapRgba(Uint8Array.of(0, 255), "plasma");
    assert.equal(rgba.length, 8);
    assert.equal(rgba[0], (lo >> 16) & 255);
    assert.equal(rgba[2], lo & 255);
    assert.equal(rgba[4], (hi >> 16) & 255);
    assert.equal(rgba[6], hi & 255);
    assert.notEqual(rgba[4], rgba[5]);
  });

  it("maps a value through a color window onto LUT rungs", () => {
    assert.equal(countWindowT(1, 1, 1000), 0);
    assert.equal(countWindowT(1000, 1, 1000), 1);
    assert.ok(countWindowT(40, 1, 1000) > 0 && countWindowT(40, 1, 1000) < 1);
    assert.equal(countValueToRung(1, 1, 4), 1);
    assert.equal(countValueToRung(4, 1, 4), COUNT_LUT_RUNGS);
    assert.equal(countValueToRung(1000, 1, 80), COUNT_LUT_RUNGS);
    assert.equal(countKindHex(COUNT_LUT_RUNGS).length, COUNT_LUT_RUNGS + 1);
  });

  it("trims both tails of positive values", () => {
    assert.deepEqual(countTrimLevels(Uint16Array.from([1, 2, 3]), 0), { lo: 1, hi: 3 });
    const peaked = new Uint16Array(100);
    peaked.fill(2);
    peaked[99] = 1000;
    const trimmed = countTrimLevels(peaked, 1);
    assert.equal(trimmed.lo, 2);
    assert.ok(trimmed.hi < 1000);
    assert.equal(percentileAt(Uint16Array.from([0, 10]), 50), 5);
  });

  it("maps start fill and tail gens in time mode", () => {
    assert.equal(encodingFill(0, 0, "time", CONWAY_BASE_K, { start: 0.02, cap: 8, max: 1 }), 0.02);
    assert.ok(encodingFill(0, 1, "time", CONWAY_BASE_K, { start: 0.02, cap: 8, max: 1 }) < 0.2);
    assert.equal(encodingFill(0, 8, "time", CONWAY_BASE_K, { start: 0.02, cap: 8, max: 1 }), 1);
  });
});
