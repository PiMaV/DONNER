import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countAxes,
  countCeiling,
  countOccupancy,
  countVolumeFromDense,
  countVolumeFromNpy,
  DENSE_OCCUPANCY,
  denseSlabBacks,
  isDenseCount,
  slideDenseSlabBacks,
} from "../src/count.js";
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

  it("drops a fully enclosed voxel on a full slab", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, { tLo: 0, tHi: 2, tFocus: 1, stabScale: false });
    assert.equal(vol.count, 27);
    assert.equal(soa.count, 26);
    for (let i = 0; i < soa.count; i++) {
      assert.ok(!(soa.x[i] === 1 && soa.y[i] === 1 && soa.t[i] === 1));
    }
  });

  it("keeps the cut face when the slab is one slice", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 1, 8, 3, { tLo: 1, tHi: 1, tFocus: 1, stabScale: false });
    assert.equal(soa.count, 9);
  });

  it("culls an X slab the same way as a Z slab", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      sliceAxis: "x",
      sliceLo: 0,
      sliceHi: 2,
    });
    assert.equal(soa.count, 26);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      sliceAxis: "x",
      sliceLo: 1,
      sliceHi: 1,
    });
    assert.equal(soa.count, 9);
    for (let i = 0; i < soa.count; i++) assert.equal(soa.x[i], 1);
  });

  it("culls a Y slab the same way as a Z slab", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      sliceAxis: "y",
      sliceLo: 1,
      sliceHi: 1,
    });
    assert.equal(soa.count, 9);
    for (let i = 0; i < soa.count; i++) assert.equal(soa.y[i], 1);
  });

  it("keeps an 8-slice X window as cut faces, not the full hull", () => {
    const dense = new Uint16Array(10 * 10 * 10);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [10, 10, 10]);
    const soa = new EventSoA(2048);
    vol.fillSoA(soa, 9, 10, 10, {
      tLo: 0,
      tHi: 9,
      tFocus: 5,
      stabScale: false,
      sliceAxis: "x",
      sliceLo: 2,
      sliceHi: 9,
    });
    assert.equal(soa.count, 416);
    for (let i = 0; i < soa.count; i++) {
      assert.ok(soa.x[i] >= 2 && soa.x[i] <= 9);
    }
  });
});

describe("dense count slab", () => {
  it("flags occupancy above the dense threshold", () => {
    const sparseData = new Uint16Array(10 * 10 * 10);
    sparseData[0] = 1;
    const sparse = countVolumeFromDense(sparseData, [10, 10, 10]);
    const solid = countVolumeFromDense(new Uint16Array(27).fill(1), [3, 3, 3]);
    assert.equal(isDenseCount(sparse), false);
    assert.equal(isDenseCount(solid), true);
    assert.ok(countOccupancy(solid) > DENSE_OCCUPANCY);
  });

  it("opens an 8-slice window around mid T", () => {
    const vol = countVolumeFromDense(new Uint16Array(54 * 2 * 2).fill(1), [54, 2, 2]);
    const s = denseSlabBacks(vol, 8);
    assert.equal(s.farBack - s.nearBack, 7);
    assert.ok(s.focusBack >= s.nearBack && s.focusBack <= s.farBack);
    assert.equal(s.farBack - s.nearBack + 1, 8);
  });

  it("slides the window toward Now and wraps to the oldest end", () => {
    const a = slideDenseSlabBacks(4, 6, 11, 53, -1);
    assert.deepEqual(a, { nearBack: 3, focusBack: 5, farBack: 10 });
    const wrap = slideDenseSlabBacks(0, 2, 7, 53, -1);
    assert.equal(wrap.farBack, 53);
    assert.equal(wrap.farBack - wrap.nearBack, 7);
    assert.equal(wrap.focusBack - wrap.nearBack, 2);
  });
});
