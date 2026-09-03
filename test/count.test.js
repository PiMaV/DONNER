import assert from "node:assert/strict";
import { lstatSync } from "node:fs";
import { describe, it } from "node:test";

import {
  countAabbCoversVolume,
  countAxes,
  countCeiling,
  countOccupancy,
  countVolumeFromDense,
  countVolumeFromNpy,
  DENSE_OCCUPANCY,
  isDenseCount,
  PLANE_CACHE_MAX,
} from "../src/count.js";
import { parseNpy, parseNpyHeader, peekNpyBlob, serializeNpy } from "../src/npy.js";
import { copyAnyPlanes, copyAxisPlane, EventSoA } from "../src/spacetime.js";
import { COUNT_LUT_RUNGS } from "../src/encoding.js";
import {
  COUNT_DEMOS,
  isCountSourceKind,
} from "../src/config.js";

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

  it("peeks shape from a header prefix without the payload", () => {
    const data = new Uint16Array(8).fill(3);
    const raw = serializeNpy(data, [2, 2, 2], "<u2");
    const header = parseNpyHeader(raw.subarray(0, 128));
    assert.deepEqual(header.shape, [2, 2, 2]);
    assert.equal(header.descr, "<u2");
    assert.equal(header.payloadBytes, 16);
    assert.ok(header.bodyOffset + header.payloadBytes === header.fileBytes);
    assert.equal(raw.byteLength, header.fileBytes);
  });

  it("peekNpyBlob reads only the header of a blob", async () => {
    const data = Uint16Array.from([1, 0, 0, 2, 0, 0, 0, 0]);
    const raw = serializeNpy(data, [2, 2, 2], "<u2");
    const blob = new Blob([raw]);
    const header = await peekNpyBlob(blob);
    assert.deepEqual(header.shape, [2, 2, 2]);
    assert.equal(header.payloadBytes, 16);
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
    assert.equal(vol.dataMax, 3);
    assert.equal(vol.dataMin, 1);
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

  it("fills EventSoA newest-first with windowed color rungs", () => {
    const dense = Uint16Array.from([1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0]);
    const vol = countVolumeFromDense(dense, [2, 2, 3]);
    const soa = new EventSoA(8);
    vol.fillSoA(soa, 1, 8, 3, { tFocus: 1, stabMode: "time", stabScale: true });
    assert.equal(soa.count, 2);
    assert.equal(soa.t[0], 1);
    assert.equal(soa.v[0], 4);
    assert.equal(soa.k[0], COUNT_LUT_RUNGS);
    assert.ok(soa.s[0] > 0);
    assert.equal(soa.t[1], 0);
    assert.equal(soa.v[1], 1);
    assert.equal(soa.k[1], 1);
  });

  it("parses a serialized (T, H, W, 1) cube", () => {
    const dense = Uint16Array.from([0, 5, 0, 2]);
    const raw = serializeNpy(dense, [1, 2, 2, 1], "<u2");
    const vol = countVolumeFromNpy(raw, "unit");
    assert.equal(vol.name, "unit");
    assert.equal(vol.count, 2);
    assert.equal(vol.ceiling, 5);
    assert.equal(vol.dataMax, 5);
    assert.deepEqual(countAxes([1, 2, 2, 1]), { t: 1, h: 2, w: 2, c: 1 });
    assert.equal(countCeiling(9), 9);
    assert.equal(countCeiling(99), 99);
  });

  it("keeps dataMax above the old 32 LUT cap", () => {
    const dense = new Uint16Array(8);
    dense[0] = 99;
    const vol = countVolumeFromDense(dense, [2, 2, 2]);
    assert.equal(vol.dataMax, 99);
    assert.equal(vol.ceiling, 99);
    vol.setWindow(1, 80);
    const soa = new EventSoA(8);
    vol.fillSoA(soa, 1, 8, 2, { tLo: 0, tHi: 1, tFocus: 1 });
    assert.equal(soa.v[0], 99);
    assert.equal(soa.k[0], COUNT_LUT_RUNGS);
  });

  it("treats a missing AABB as the whole brick", () => {
    assert.equal(countAabbCoversVolume(null, 10, 8, 4), true);
    assert.equal(
      countAabbCoversVolume(
        { xLo: 0, xHi: 9, yLo: 0, yHi: 7, tLo: 0, tHi: 3 },
        10,
        8,
        4,
      ),
      true,
    );
    assert.equal(
      countAabbCoversVolume(
        { xLo: 1, xHi: 9, yLo: 0, yHi: 7, tLo: 0, tHi: 3 },
        10,
        8,
        4,
      ),
      false,
    );
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

  it("culls an X crop the same way as a Z crop", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 26);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      aabb: { xLo: 1, xHi: 1, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 9);
    for (let i = 0; i < soa.count; i++) assert.equal(soa.x[i], 1);
  });

  it("culls a Y crop the same way as a Z crop", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      aabb: { xLo: 0, xHi: 2, yLo: 1, yHi: 1, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 9);
    for (let i = 0; i < soa.count; i++) assert.equal(soa.y[i], 1);
  });

  it("keeps an X window as AABB hull faces, not interior voxels", () => {
    const dense = new Uint16Array(10 * 10 * 10);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [10, 10, 10]);
    const soa = new EventSoA(2048);
    vol.fillSoA(soa, 9, 10, 10, {
      tLo: 0,
      tHi: 9,
      tFocus: 5,
      stabScale: false,
      aabb: { xLo: 2, xHi: 9, yLo: 0, yHi: 9, tLo: 0, tHi: 9 },
    });
    assert.equal(soa.count, 416);
    for (let i = 0; i < soa.count; i++) {
      assert.ok(soa.x[i] >= 2 && soa.x[i] <= 9);
    }
  });

  it("opening the clips again restores the full-brick hull count", () => {
    const dense = new Uint16Array(10 * 10 * 10);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [10, 10, 10]);
    const soa = new EventSoA(2048);
    vol.fillSoA(soa, 9, 10, 10, {
      tLo: 0,
      tHi: 9,
      tFocus: 5,
      stabScale: false,
      aabb: { xLo: 2, xHi: 9, yLo: 0, yHi: 9, tLo: 0, tHi: 9 },
    });
    assert.equal(soa.count, 416);
    vol.fillSoA(soa, 9, 10, 10, {
      tLo: 0,
      tHi: 9,
      tFocus: 5,
      stabScale: false,
      aabb: { xLo: 0, xHi: 9, yLo: 0, yHi: 9, tLo: 0, tHi: 9 },
    });
    assert.equal(soa.count, 488);
  });

  it("Ghost shade emits the enclosed center on the active plane", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      shade: "ghost",
      activeAxis: "z",
      foci: { x: 1, y: 1, z: 1 },
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 27);
  });

  it("full-brick Hull fill ignores the playhead and matches the hull cache", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    assert.equal(vol._hull.length, 26);
    assert.equal(vol.eventIndexAt(1, 1, 1), 1 * 9 + 1 * 3 + 1);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 0,
      stabScale: false,
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    const n0 = soa.count;
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 2,
      stabScale: false,
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(n0, 26);
    assert.equal(soa.count, 26);
  });

  it("rebuilds the hull so Hide reveals interior high values", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    dense[1 * 9 + 1 * 3 + 1] = 10;
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    assert.equal(vol._hull.length, 26);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 26);
    assert.equal(vol.setHideBelow(5), true);
    assert.equal(vol._hull.length, 1);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 1);
    assert.equal(soa.v[0], 10);
  });

  it("skips cubes below Hide on a sparse cloud", () => {
    const dense = new Uint16Array(10 * 10 * 10);
    dense[0] = 1;
    dense[1] = 2;
    dense[2] = 4;
    const vol = countVolumeFromDense(dense, [10, 10, 10]);
    assert.equal(isDenseCount(vol), false);
    vol.setHideBelow(3);
    const soa = new EventSoA(8);
    vol.fillSoA(soa, 9, 10, 10, { tLo: 0, tHi: 9, tFocus: 0 });
    assert.equal(soa.count, 1);
    assert.equal(soa.v[0], 4);
  });

  it("Hull fill of a cropped AABB includes the knife-face interiors", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 1,
      tFocus: 1,
      stabScale: false,
      shade: "hull",
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 1 },
    });
    assert.equal(soa.count, 18);
  });

  it("Ghost on X uses the hull cache plus the enclosed column", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      shade: "ghost",
      activeAxis: "x",
      foci: { x: 1, y: 1, z: 1 },
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 27);
  });

  it("Slice shade emits only the active plane", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      shade: "slice",
      activeAxis: "z",
      foci: { x: 1, y: 1, z: 1 },
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 9);
    for (let i = 0; i < soa.count; i++) assert.equal(soa.t[i], 1);
  });

  it("Triple shade emits the three planes without the hull", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const soa = new EventSoA(32);
    vol.fillSoA(soa, 2, 8, 3, {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      shade: "triple",
      foci: { x: 1, y: 1, z: 1 },
      aabb: { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 },
    });
    assert.equal(soa.count, 19);
  });

  it("splits hull vs full plane so Ghost scrub does not recopy the hull", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const hull = new EventSoA(32);
    const plane = new EventSoA(32);
    const box = { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 };
    const opts = {
      tLo: 0,
      tHi: 2,
      tFocus: 1,
      stabScale: false,
      shade: "ghost",
      activeAxis: "z",
      foci: { x: 1, y: 1, z: 1 },
      aabb: box,
    };
    vol.fillHullSoA(hull, 2, 8, 3, opts);
    vol.fillPlaneSoA(plane, 2, 8, 3, opts);
    assert.equal(hull.count, 26);
    assert.equal(plane.count, 9);
    for (let i = 0; i < plane.count; i++) assert.equal(plane.t[i], 1);
    vol.fillHullSoA(hull, 2, 8, 3, { ...opts, foci: { x: 1, y: 1, z: 2 } });
    assert.equal(hull.count, 26);
    vol.fillPlaneSoA(plane, 2, 8, 3, { ...opts, foci: { x: 1, y: 1, z: 0 } });
    assert.equal(plane.count, 9);
    for (let i = 0; i < plane.count; i++) assert.equal(plane.t[i], 0);
  });

  it("reuses plane index lists in a bounded LRU", () => {
    const dense = new Uint16Array(27);
    dense.fill(1);
    const vol = countVolumeFromDense(dense, [3, 3, 3]);
    const box = { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 };
    const a = vol.cachedPlaneIndices(box, "z", 1, false);
    const b = vol.cachedPlaneIndices(box, "z", 1, false);
    assert.equal(a, b);
    assert.equal(a.length, 9);
    vol.prefetchPlanes(box, "z", 1, false, { radius: 1, lo: 0, hi: 2 });
    assert.equal(vol.cachedPlaneIndices(box, "z", 0, false).length, 9);
    const wide = new Uint16Array(10 * 10 * 10);
    wide.fill(1);
    const big = countVolumeFromDense(wide, [10, 10, 10]);
    const full = { xLo: 0, xHi: 9, yLo: 0, yHi: 9, tLo: 0, tHi: 9 };
    for (let x = 0; x < 10; x++) big.cachedPlaneIndices(full, "x", x, false);
    for (let y = 0; y < 10; y++) big.cachedPlaneIndices(full, "y", y, false);
    for (let z = 0; z < 10; z++) big.cachedPlaneIndices(full, "z", z, false);
    for (let x = 0; x < 10; x++) big.cachedPlaneIndices(full, "x", x, true);
    for (let y = 0; y < 10; y++) big.cachedPlaneIndices(full, "y", y, true);
    for (let z = 0; z < 8; z++) big.cachedPlaneIndices(full, "z", z, true);
    assert.ok(big._planeCache.size <= PLANE_CACHE_MAX);
    assert.equal(big._planeCache.size, big._planeCacheOrder.length);
  });
});

describe("SoA plane copy", () => {
  it("copies one axis plane and Cuts union", () => {
    const src = new EventSoA(8);
    src.count = 4;
    src.x.set([0, 1, 1, 2]);
    src.y.set([0, 0, 1, 1]);
    src.t.set([0, 1, 1, 2]);
    src.k.set([1, 2, 3, 4]);
    const dest = new EventSoA(8);
    copyAxisPlane(src, dest, "z", 1);
    assert.equal(dest.count, 2);
    assert.equal(dest.k[0], 2);
    assert.equal(dest.k[1], 3);
    copyAnyPlanes(src, dest, { x: 2, y: 0, z: 1 });
    assert.equal(dest.count, 4);
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
});

describe("count source demos", () => {
  it("treats Lighter Ignition and Brain MRI as count sources", () => {
    assert.equal(isCountSourceKind("npy"), false);
    assert.equal(isCountSourceKind("conway"), false);
    assert.equal(isCountSourceKind("count"), true);
    assert.equal(isCountSourceKind("ignition"), true);
    assert.equal(isCountSourceKind("mni152"), true);
    assert.equal(COUNT_DEMOS.mni152.url, "data/mni152_stack.npy");
    assert.equal(COUNT_DEMOS.ignition.url, "data/ignition_stack.npy");
    assert.equal(COUNT_DEMOS.ignition.label, "Lighter Ignition");
    assert.equal(COUNT_DEMOS.mni152.label, "Brain MRI");
  });

  it("ships real example cubes, not symlinks", () => {
    const ign = lstatSync(new URL("../data/ignition_stack.npy", import.meta.url));
    const mni = lstatSync(new URL("../data/mni152_stack.npy", import.meta.url));
    assert.equal(ign.isSymbolicLink(), false);
    assert.equal(mni.isSymbolicLink(), false);
    assert.ok(ign.size > 3_000_000);
    assert.ok(mni.size > 20_000_000);
  });
});
