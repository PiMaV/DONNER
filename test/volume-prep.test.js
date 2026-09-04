import assert from "node:assert/strict";
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, it } from "node:test";

import { countVolumeFromDense } from "../src/count.js";
import { parseNpy, parseNpyHeader, serializeNpy } from "../src/npy.js";
import {
  PREP_MAX_CELLS,
  binCountCubeFromBlob,
  binCountDense,
  ingestDialogModel,
  ingestPlan,
  previewIngestFromBlob,
} from "../src/volume-prep.js";

describe("ingest plan", () => {
  it("lets an mni152-sized cube load native", () => {
    const t = 215;
    const h = 256;
    const w = 207;
    const header = {
      shape: [t, h, w],
      descr: "<u2",
      fortranOrder: false,
      payloadBytes: t * h * w * 2,
    };
    const plan = ingestPlan(header);
    assert.equal(plan.asIsOk, true);
    assert.equal(plan.suggested, 4);
    assert.ok(plan.cells < PREP_MAX_CELLS);
    const model = ingestDialogModel("mni152_stack.npy", header, plan);
    assert.match(model.warn, /Reduced to|comfort/i);
    assert.equal(model.warnKind, "ok");
    assert.equal(model.canLoad, true);
  });

  it("warns above the 500k comfort cap and preselects a reduce factor", () => {
    const t = 25;
    const h = 177;
    const w = 1024;
    const header = {
      shape: [t, h, w],
      descr: "<u2",
      fortranOrder: false,
      payloadBytes: t * h * w * 2,
    };
    const plan = ingestPlan(header);
    assert.equal(plan.cells, 25 * 177 * 1024);
    assert.equal(plan.asIsOk, true);
    assert.equal(plan.suggested, 4);
    const native = plan.options.find((o) => o.factor === 1);
    const bin4 = plan.options.find((o) => o.factor === 4);
    assert.equal(native.ok, true);
    assert.ok(bin4.cells < 500_000);
    const model = ingestDialogModel("camera.npy", header, plan);
    assert.match(model.options[0].warn, /4\.5M cells/i);
    assert.match(model.options[0].warn, /BLITZ/);
    assert.equal(model.options[0].warnKind, "soft");
    assert.match(model.warn, /Reduced to/);
  });

  it("requires binning when the raster is over the cell cap", () => {
    const header = {
      shape: [400, 400, 400],
      descr: "|u1",
      fortranOrder: false,
      payloadBytes: 400 * 400 * 400,
    };
    const plan = ingestPlan(header);
    assert.equal(plan.asIsOk, false);
    assert.equal(plan.suggested, 8);
    assert.equal(plan.canLoad, true);
    const native = plan.options.find((o) => o.factor === 1);
    const bin2 = plan.options.find((o) => o.factor === 2);
    assert.equal(native.ok, false);
    assert.equal(bin2.ok, true);
    assert.equal(bin2.t, 200);
    const model = ingestDialogModel("big.npy", header, plan);
    assert.match(model.warn, /Reduced to/);
    assert.match(model.options[0].warn, /hard cap/);
  });

  it("refuses a cube that stays over cap after 8× bin", () => {
    const header = {
      shape: [3000, 3000, 3000],
      descr: "|u1",
      fortranOrder: false,
      payloadBytes: 128 * 1024 * 1024 + 1,
    };
    const plan = ingestPlan(header);
    assert.equal(plan.asIsOk, false);
    assert.equal(plan.canLoad, false);
    assert.equal(plan.suggested, null);
  });

  it("rejects a non-count shape before load", () => {
    const plan = ingestPlan({
      shape: [8, 8],
      descr: "<u2",
      fortranOrder: false,
      payloadBytes: 128,
    });
    assert.equal(plan.ok, false);
    assert.match(plan.error, /count stack must be/);
  });
});

describe("max bin", () => {
  it("takes the max of a 2×2×2 block and crops the remainder", () => {
    const dense = new Uint16Array(3 * 3 * 3);
    dense[0] = 1;
    dense[1] = 2;
    dense[3] = 4;
    dense[9] = 8;
    const { data, shape } = binCountDense(dense, [3, 3, 3], 2, "max");
    assert.deepEqual(shape, [1, 1, 1]);
    assert.equal(data[0], 8);
  });

  it("sums an ON/OFF pair per voxel then max-bins", () => {
    const dense = Uint16Array.from([
      1, 2, 0, 0, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0, 0,
    ]);
    const { data, shape } = binCountDense(dense, [2, 2, 2, 2], 2, "max");
    assert.deepEqual(shape, [1, 1, 1]);
    assert.equal(data[0], 4);
  });

  it("keeps the peak instead of summing past uint16", () => {
    const dense = new Uint16Array(8).fill(20000);
    const { data } = binCountDense(dense, [2, 2, 2], 2, "max");
    assert.equal(data[0], 20000);
  });

  it("matches countVolumeFromDense after a 2× max-bin", () => {
    const dense = Uint16Array.from([1, 0, 0, 2, 3, 0, 0, 4, 0, 0, 0, 0, 5, 0, 0, 6]);
    const { data, shape } = binCountDense(dense, [2, 2, 4], 2, "max");
    const vol = countVolumeFromDense(data, shape, "binned");
    assert.equal(vol.nT, 1);
    assert.equal(vol.height, 1);
    assert.equal(vol.width, 2);
    assert.equal(vol.count, 2);
    assert.equal(vol.v[0], 5);
    assert.equal(vol.v[1], 6);
  });

  it("streams the same result from a blob as from RAM", async () => {
    const dense = Uint16Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const raw = serializeNpy(dense, [2, 2, 2], "<u2");
    const ram = binCountDense(dense, [2, 2, 2], 2, "max");
    const blob = new Blob([raw]);
    const header = parseNpyHeader(raw);
    const streamed = await binCountCubeFromBlob(blob, header, 2, "max");
    assert.deepEqual(streamed.shape, ram.shape);
    assert.deepEqual(Array.from(streamed.data), Array.from(ram.data));
  });
});

describe("mean bin", () => {
  it("averages a 2×2×2 block instead of keeping the peak", () => {
    const dense = new Uint16Array(8);
    dense[0] = 8;
    const { data, shape } = binCountDense(dense, [2, 2, 2], 2, "mean");
    assert.deepEqual(shape, [1, 1, 1]);
    assert.equal(data[0], 1);
  });

  it("defaults to mean when the reduce mode is omitted", () => {
    const dense = new Uint16Array(8);
    dense[0] = 8;
    const { data } = binCountDense(dense, [2, 2, 2], 2);
    assert.equal(data[0], 1);
  });
});

describe("per-axis bin", () => {
  it("bins H and W when T is a single plane", () => {
    const header = {
      shape: [1, 177, 1024],
      descr: "<u2",
      fortranOrder: false,
      payloadBytes: 177 * 1024 * 2,
    };
    const plan = ingestPlan(header);
    const bin2 = plan.options.find((o) => o.factor === 2);
    const bin4 = plan.options.find((o) => o.factor === 4);
    const bin8 = plan.options.find((o) => o.factor === 8);
    assert.equal(plan.asIsOk, true);
    assert.equal(bin2.ok, true);
    assert.equal(bin4.ok, true);
    assert.equal(bin8.ok, true);
    assert.deepEqual([bin4.t, bin4.h, bin4.w], [1, 44, 256]);
    assert.equal(bin4.ft, 1);
    assert.equal(bin4.fh, 4);
    assert.equal(bin4.fw, 4);
    const model = ingestDialogModel("plane.npy", header, plan);
    assert.match(model.options[2].label, /4× on H, W/);
  });

  it("keeps a short T when the factor is larger than T", () => {
    const header = {
      shape: [3, 64, 64],
      descr: "|u1",
      fortranOrder: false,
      payloadBytes: 3 * 64 * 64,
    };
    const plan = ingestPlan(header);
    const bin4 = plan.options.find((o) => o.factor === 4);
    assert.equal(bin4.ok, true);
    assert.equal(bin4.t, 3);
    assert.equal(bin4.h, 16);
    assert.equal(bin4.w, 16);
  });

  it("max-bins a single plane in XY only", () => {
    const dense = Uint16Array.from([
      1, 2, 3, 4,
      5, 6, 7, 8,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const { data, shape } = binCountDense(dense, [1, 4, 4], 2, "max");
    assert.deepEqual(shape, [1, 2, 2]);
    assert.equal(data[0], 6);
    assert.equal(data[1], 8);
    assert.equal(data[2], 0);
    assert.equal(data[3], 0);
  });

  it("streams a single-plane cube the same as RAM", async () => {
    const dense = Uint16Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const raw = serializeNpy(dense, [1, 2, 4], "<u2");
    const ram = binCountDense(dense, [1, 2, 4], 2, "mean");
    const blob = new Blob([raw]);
    const header = parseNpyHeader(raw);
    const streamed = await binCountCubeFromBlob(blob, header, 2, "mean");
    assert.deepEqual(streamed.shape, [1, 1, 2]);
    assert.deepEqual(Array.from(streamed.data), Array.from(ram.data));
  });
});

describe("ingest preview", () => {
  it("renders the first output plane without reading later frames", async () => {
    const dense = new Uint16Array(2 * 2 * 2);
    dense[0] = 8;
    dense[7] = 99;
    const raw = serializeNpy(dense, [2, 2, 2], "<u2");
    const blob = new Blob([raw]);
    const header = parseNpyHeader(raw);
    const native = await previewIngestFromBlob(blob, header, 1, "max");
    assert.equal(native.width, 2);
    assert.equal(native.height, 2);
    assert.equal(native.frames, 1);
    assert.equal(native.gray.length, 4);
    assert.equal(native.gray[0], 255);
    const binned = await previewIngestFromBlob(blob, header, 2, "max");
    assert.equal(binned.width, 1);
    assert.equal(binned.height, 1);
    assert.equal(binned.frames, 2);
    assert.equal(binned.gray[0], 255);
  });
});

describe("demo header peek", () => {
  it("peeks mni152 without reading the 23 MB payload", () => {
    const path = new URL("../data/mni152_stack.npy", import.meta.url);
    const fd = openSync(path, "r");
    const peek = Buffer.alloc(4096);
    try {
      readSync(fd, peek, 0, 4096, 0);
    } finally {
      closeSync(fd);
    }
    const header = parseNpyHeader(peek);
    const plan = ingestPlan(header);
    assert.deepEqual(header.shape, [215, 256, 207]);
    assert.equal(plan.asIsOk, true);
    assert.equal(plan.suggested, 4);
  });

  it("peeks Brain MRI Low as the 2× mean of High", () => {
    const path = new URL("../data/mni152_low_stack.npy", import.meta.url);
    const fd = openSync(path, "r");
    const peek = Buffer.alloc(4096);
    try {
      readSync(fd, peek, 0, 4096, 0);
    } finally {
      closeSync(fd);
    }
    const header = parseNpyHeader(peek);
    assert.deepEqual(header.shape, [107, 128, 103]);
  });

  it("keeps the shipped Low cube in lockstep with 2× mean of High", () => {
    const high = parseNpy(readFileSync(new URL("../data/mni152_stack.npy", import.meta.url)));
    const low = parseNpy(readFileSync(new URL("../data/mni152_low_stack.npy", import.meta.url)));
    const binned = binCountDense(high.data, high.shape, 2, "mean");
    assert.deepEqual(low.shape, binned.shape);
    assert.equal(low.data.length, binned.data.length);
    for (let i = 0; i < binned.data.length; i++) {
      if (low.data[i] !== binned.data[i]) {
        assert.fail(`Low cube differs from 2× mean of High at index ${i}`);
      }
    }
  });
});
