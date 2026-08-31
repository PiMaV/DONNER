import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countAxes, countCeiling, countVolumeFromDense, countVolumeFromNpy } from "../src/count.js";
import { parseNpy, serializeNpy } from "../src/npy.js";
import { EventSoA } from "../src/spacetime.js";

describe("npy", () => {
  it("round-trips a little-endian uint16 cube", () => {
    const data = Uint16Array.from([0, 1, 2, 3, 4, 5]);
    const raw = serializeNpy(data, [2, 3], "<u2");
    const parsed = parseNpy(raw);
    assert.deepEqual(parsed.shape, [2, 3]);
    assert.equal(parsed.descr, "<u2");
    assert.equal(parsed.fortranOrder, false);
    assert.deepEqual(Array.from(parsed.data), [0, 1, 2, 3, 4, 5]);
  });

  it("rejects a truncated header", () => {
    assert.throws(() => parseNpy(new Uint8Array([0x93, 0x4e, 0x55])), /not a NumPy|truncated/);
  });
});

describe("count volume", () => {
  it("reads (T, H, W) and drops zeros", () => {
    const dense = Uint16Array.from([
      0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0,
    ]);
    const vol = countVolumeFromDense(dense, [2, 3, 3], "toy");
    assert.equal(vol.width, 3);
    assert.equal(vol.height, 3);
    assert.equal(vol.nT, 2);
    assert.equal(vol.count, 3);
    assert.equal(vol.ceiling, 3);
    assert.equal(vol.liveAt(0), 2);
    assert.equal(vol.liveAt(1), 1);
    assert.equal(vol.sumAt(0), 3);
    assert.equal(vol.newestT(), 1);
  });

  it("sums an ON/OFF pair on the last axis", () => {
    const dense = Uint16Array.from([1, 2, 0, 0, 0, 0, 0, 0]);
    const vol = countVolumeFromDense(dense, [1, 2, 2, 2]);
    assert.equal(vol.count, 1);
    assert.equal(vol.v[0], 3);
    assert.equal(vol.x[0], 0);
    assert.equal(vol.y[0], 0);
  });

  it("fills EventSoA newest-first with count k", () => {
    const dense = Uint16Array.from([1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0]);
    const vol = countVolumeFromDense(dense, [2, 2, 3]);
    const soa = new EventSoA(8);
    vol.fillSoA(soa, 1, 8, 3, { tFocus: 1, stabMode: "time", stabScale: true });
    assert.equal(soa.count, 2);
    assert.equal(soa.t[0], 1);
    assert.equal(soa.k[0], 4);
    assert.ok(soa.s[0] > 0);
    assert.equal(soa.t[1], 0);
    assert.equal(soa.k[1], 1);
  });

  it("parses a serialized (T, H, W, 1) cube", () => {
    const dense = Uint16Array.from([0, 5, 0, 2]);
    const raw = serializeNpy(dense, [1, 2, 2, 1], "<u2");
    const vol = countVolumeFromNpy(raw, "unit");
    assert.equal(vol.name, "unit");
    assert.equal(vol.count, 2);
    assert.equal(vol.ceiling, 5);
    assert.deepEqual(countAxes([1, 2, 2, 1]), { t: 1, h: 2, w: 2, c: 1 });
    assert.equal(countCeiling(9), 9);
    assert.equal(countCeiling(99), 32);
  });
});
