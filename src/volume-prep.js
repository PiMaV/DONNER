/**
 * Count-cube ingest gate: header peek, size caps, integer binning.
 *
 * Native load never `arrayBuffer()`s a cube that fails the hard cap.
 * Binning streams C-order (T, H, W) planes from a Blob so the source
 * grid does not sit in RAM next to the reduced output.
 *
 * Reduce is **mean** (downsample) or **max** (keep peaks) in each block.
 * An axis shorter than the factor is left alone, so a single Z plane
 * still bins X/Y. Remainder on a binned axis is cropped (floor).
 */

import { countAxes } from "./count.js";
import { npyArrayFromBytes } from "./npy.js";

/** Cells (T×H×W after channel sum). mni152 (~11.4M) fits RAM; 256³ is the hard cap. */
export const PREP_MAX_CELLS = 256 * 256 * 256;

/**
 * Comfort cap for the cube renderer. Above this, warn and prefer bin.
 * Empiric: fill-rate drops around 500k voxels on a fast laptop.
 */
export const PREP_SOFT_CELLS = 500_000;

/** Native payload cap. Over this, load only after streaming bin. */
export const PREP_MAX_PAYLOAD = 128 * 1024 * 1024;

/** Max length per axis (Uint16 coordinates, inclusive index 0…n-1). */
export const PREP_MAX_DIM = 65536;

export const PREP_BIN_FACTORS = [1, 2, 4, 8];

const DTYPE_LABEL = {
  u1: "uint8",
  i1: "int8",
  u2: "uint16",
  i2: "int16",
  u4: "uint32",
  i4: "int32",
  f4: "float32",
  f8: "float64",
};

export function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "0 B";
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCells(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "0";
  if (v < 10_000) return String(Math.round(v));
  if (v < 1e6) return `${(v / 1e3).toFixed(1)}k`;
  return `${(v / 1e6).toFixed(1)}M`;
}

export function dtypeLabel(descr) {
  const key = String(descr || "").replace(/^[<>|]/, "");
  return DTYPE_LABEL[key] || String(descr || "");
}

export function normalizeBinReduce(mode) {
  return mode === "max" ? "max" : "mean";
}

function dimOk(t, h, w) {
  return t >= 1 && h >= 1 && w >= 1 && t <= PREP_MAX_DIM && h <= PREP_MAX_DIM && w <= PREP_MAX_DIM;
}

/** Stride on one axis: skip binning when the length is shorter than the factor. */
export function axisStride(len, factor) {
  const n = len | 0;
  const f = factor | 0;
  if (f <= 1) return 1;
  return n >= f ? f : 1;
}

/**
 * @param {{ t: number, h: number, w: number }} axes
 * @param {number} factor
 */
export function binnedAxes(axes, factor) {
  const f = factor | 0;
  const ft = axisStride(axes.t, f);
  const fh = axisStride(axes.h, f);
  const fw = axisStride(axes.w, f);
  return {
    t: Math.floor(axes.t / ft),
    h: Math.floor(axes.h / fh),
    w: Math.floor(axes.w / fw),
    ft,
    fh,
    fw,
  };
}

function optionOk(out, factor, asIsOk) {
  if (!dimOk(out.t, out.h, out.w)) return false;
  if (out.t * out.h * out.w > PREP_MAX_CELLS) return false;
  if (factor === 1) return asIsOk;
  return out.ft > 1 || out.fh > 1 || out.fw > 1;
}

function factorLabel(o) {
  if (o.factor === 1) {
    return `Native ${o.t} × ${o.h} × ${o.w} · ${formatCells(o.cells)} cells`;
  }
  const names = [];
  if (o.ft > 1) names.push("T");
  if (o.fh > 1) names.push("H");
  if (o.fw > 1) names.push("W");
  const where = names.length === 3 ? "" : ` on ${names.join(", ")}`;
  return `${o.factor}×${where} → ${o.t} × ${o.h} × ${o.w} · ${formatCells(o.cells)} cells`;
}

/**
 * @param {{
 *   shape: number[],
 *   descr?: string,
 *   fortranOrder?: boolean,
 *   payloadBytes: number,
 * }} header
 */
export function ingestPlan(header) {
  const payloadBytes = Number(header.payloadBytes) || 0;
  if (header.fortranOrder) {
    return {
      ok: false,
      error: "npy fortran_order arrays are not supported",
      axes: null,
      cells: 0,
      payloadBytes,
      asIsOk: false,
      canLoad: false,
      suggested: null,
      options: [],
    };
  }
  let axes;
  try {
    axes = countAxes(header.shape);
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      axes: null,
      cells: 0,
      payloadBytes,
      asIsOk: false,
      canLoad: false,
      suggested: null,
      options: [],
    };
  }
  const cells = axes.t * axes.h * axes.w;
  const asIsOk =
    dimOk(axes.t, axes.h, axes.w) && cells <= PREP_MAX_CELLS && payloadBytes <= PREP_MAX_PAYLOAD;
  const options = PREP_BIN_FACTORS.map((factor) => {
    const out = binnedAxes(axes, factor);
    const outCells = out.t * out.h * out.w;
    return {
      factor,
      t: out.t,
      h: out.h,
      w: out.w,
      ft: out.ft,
      fh: out.fh,
      fw: out.fw,
      cells: outCells,
      ok: optionOk(out, factor, asIsOk),
    };
  });
  const suggested = suggestedBinFactor(options, cells, asIsOk);
  return {
    ok: true,
    error: null,
    axes,
    cells,
    payloadBytes,
    asIsOk,
    canLoad: options.some((o) => o.ok),
    suggested,
    options,
  };
}

/**
 * Smallest allowed factor whose output is in the comfort range.
 * If none, the first reducing factor that still fits the hard cap.
 */
export function suggestedBinFactor(options, cells, asIsOk) {
  if (cells <= PREP_SOFT_CELLS && asIsOk) return 1;
  const under = options.find((o) => o.ok && o.cells <= PREP_SOFT_CELLS);
  if (under) return under.factor;
  const reduce = options.find((o) => o.ok && o.factor > 1);
  if (reduce) return reduce.factor;
  return asIsOk ? 1 : null;
}

export function ingestWarnKind(cells, plan) {
  if (!plan.ok) return "hard";
  if (!plan.canLoad) return "hard";
  if (cells > PREP_SOFT_CELLS) return "soft";
  return "ok";
}

export function ingestWarnText(cells, plan, nativeCells = cells) {
  if (!plan.ok) return plan.error || "Cannot load this file.";
  const n = formatCells(cells);
  const soft = formatCells(PREP_SOFT_CELLS);
  const hard = formatCells(PREP_MAX_CELLS);
  if (!plan.canLoad) {
    return `Even 8× bin is too large (${formatCells(nativeCells)} cells; hard cap ${hard}). Crop or reduce offline. Analyze in BLITZ.`;
  }
  if (cells > PREP_MAX_CELLS) {
    return `${n} cells is over the hard cap (${hard}). Bin before load.`;
  }
  if (cells > PREP_SOFT_CELLS) {
    return `${n} cells. DONNER draws one cube per occupied voxel; about ${soft} is the comfort cap. Performance can be limited. Reduce, or analyze in BLITZ.`;
  }
  if (nativeCells > PREP_SOFT_CELLS) {
    return `Reduced to ${n} cells (comfort cap about ${soft}). Native was ${formatCells(nativeCells)}.`;
  }
  return `${n} cells — in the comfort range (about ${soft}). Load native, or bin to shrink.`;
}

/**
 * @param {string} fileName
 * @param {{ shape: number[], descr: string, payloadBytes: number }} header
 * @param {ReturnType<typeof ingestPlan>} plan
 */
export function ingestDialogModel(fileName, header, plan) {
  const name = String(fileName || "count.npy");
  const shapeLine = plan.axes
    ? `${plan.axes.t} × ${plan.axes.h} × ${plan.axes.w}`
    : (header.shape || []).join(" × ");
  const pick = plan.options.find((o) => o.factor === plan.suggested) || { cells: plan.cells };
  const warn = ingestWarnText(pick.cells, plan, plan.cells);
  const warnKind = ingestWarnKind(pick.cells, plan);
  return {
    name,
    shapeLine,
    dtype: dtypeLabel(header.descr),
    payload: formatBytes(header.payloadBytes),
    cells: formatCells(plan.cells),
    axesNote: "(T, H, W) — time × height × width",
    warn,
    warnKind,
    canLoad: Boolean(plan.canLoad),
    suggested: plan.suggested,
    options: plan.options.map((o) => ({
      factor: o.factor,
      ok: o.ok,
      cells: o.cells,
      ft: o.ft,
      fh: o.fh,
      fw: o.fw,
      warn: ingestWarnText(o.cells, plan, plan.cells),
      warnKind: ingestWarnKind(o.cells, plan),
      label: factorLabel(o),
    })),
  };
}

function clipU16(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 0xffff) return 0xffff;
  return n;
}

function samplePositive(raw) {
  return raw > 0 ? raw : 0;
}

function voxelActivity(data, off, c) {
  let v = 0;
  for (let ch = 0; ch < c; ch++) v += samplePositive(data[off + ch]);
  return v;
}

function neighborhoodReduce(data, t0, y0, x0, ft, fh, fw, h, w, c, frame, reduce) {
  let peak = 0;
  let sum = 0;
  const n = ft * fh * fw;
  for (let dt = 0; dt < ft; dt++) {
    const base = (t0 + dt) * frame;
    for (let dy = 0; dy < fh; dy++) {
      const yi = y0 + dy;
      for (let dx = 0; dx < fw; dx++) {
        const xi = x0 + dx;
        const off = base + (yi * w + xi) * c;
        const v = voxelActivity(data, off, c);
        if (v > peak) peak = v;
        sum += v;
      }
    }
  }
  if (reduce === "max") return clipU16(peak);
  return clipU16(Math.round(sum / n));
}

function fillBinned(data, t, h, w, c, out, ft, fh, fw, reduce) {
  const outT = Math.floor(t / ft);
  const outH = Math.floor(h / fh);
  const outW = Math.floor(w / fw);
  const frame = h * w * c;
  for (let ot = 0; ot < outT; ot++) {
    for (let oh = 0; oh < outH; oh++) {
      for (let ow = 0; ow < outW; ow++) {
        out[(ot * outH + oh) * outW + ow] = neighborhoodReduce(
          data,
          ot * ft,
          oh * fh,
          ow * fw,
          ft,
          fh,
          fw,
          h,
          w,
          c,
          frame,
          reduce,
        );
      }
    }
  }
}

/**
 * Integer factor 2 / 4 / 8. Reduce = mean or max in the block.
 * A trailing ON/OFF channel is summed per source voxel first (activity),
 * then the neighborhood reduces. Short axes keep stride 1.
 *
 * @param {ArrayLike<number>} data
 * @param {number[]} shape
 * @param {number} factor
 * @param {string} [reduce]
 */
export function binCountDense(data, shape, factor, reduce) {
  const f = factor | 0;
  if (f !== 2 && f !== 4 && f !== 8) {
    throw new Error(`bin factor must be 2, 4, or 8 (got ${factor})`);
  }
  const mode = normalizeBinReduce(reduce);
  const { t, h, w, c } = countAxes(shape);
  const need = t * h * w * c;
  if (data.length !== need) throw new Error("count stack length does not match shape");
  const { t: outT, h: outH, w: outW, ft, fh, fw } = binnedAxes({ t, h, w }, f);
  if (ft === 1 && fh === 1 && fw === 1) {
    throw new Error("bin factor does not reduce any axis");
  }
  if (!dimOk(outT, outH, outW)) {
    throw new Error("bin factor empties an axis");
  }
  const out = new Uint16Array(outT * outH * outW);
  fillBinned(data, t, h, w, c, out, ft, fh, fw, mode);
  return { data: out, shape: [outT, outH, outW] };
}

/**
 * Stream reduced T-slabs from a C-order `.npy` blob.
 *
 * @param {Blob} blob
 * @param {{
 *   shape: number[],
 *   descr: string,
 *   bodyOffset: number,
 *   itemSize: number,
 * }} header
 * @param {number} factor
 * @param {string} [reduce]
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function binCountCubeFromBlob(blob, header, factor, reduce, onProgress) {
  const f = factor | 0;
  if (f !== 2 && f !== 4 && f !== 8) {
    throw new Error(`bin factor must be 2, 4, or 8 (got ${factor})`);
  }
  const mode = normalizeBinReduce(reduce);
  const { t, h, w, c } = countAxes(header.shape);
  const { t: outT, h: outH, w: outW, ft, fh, fw } = binnedAxes({ t, h, w }, f);
  if (ft === 1 && fh === 1 && fw === 1) {
    throw new Error("bin factor does not reduce any axis");
  }
  if (!dimOk(outT, outH, outW)) {
    throw new Error("bin factor empties an axis");
  }
  const itemSize = header.itemSize | 0;
  const planeElems = h * w * c;
  const planeBytes = planeElems * itemSize;
  const slabElems = ft * planeElems;
  const out = new Uint16Array(outT * outH * outW);
  const body = header.bodyOffset | 0;
  for (let ot = 0; ot < outT; ot++) {
    const start = body + ot * ft * planeBytes;
    const buf = await blob.slice(start, start + ft * planeBytes).arrayBuffer();
    const src = npyArrayFromBytes(new Uint8Array(buf), header.descr, slabElems);
    for (let oh = 0; oh < outH; oh++) {
      for (let ow = 0; ow < outW; ow++) {
        out[(ot * outH + oh) * outW + ow] = neighborhoodReduce(
          src,
          0,
          oh * fh,
          ow * fw,
          ft,
          fh,
          fw,
          h,
          w,
          c,
          planeElems,
          mode,
        );
      }
    }
    onProgress?.(ot + 1, outT);
    if (ot + 1 < outT) {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
  return { data: out, shape: [outT, outH, outW] };
}

/** Stretch a plane to 8-bit gray (0 = empty, max = white). */
export function stretchGrayU8(plane) {
  let hi = 0;
  for (let i = 0; i < plane.length; i++) {
    const v = plane[i];
    if (v > hi) hi = v;
  }
  const gray = new Uint8Array(plane.length);
  if (hi <= 0) return gray;
  for (let i = 0; i < plane.length; i++) {
    gray[i] = Math.round((255 * plane[i]) / hi);
  }
  return gray;
}

/**
 * Rotate a gray preview 90° clockwise when it is taller than wide.
 * Dialog CSS scales to width; a portrait plane would otherwise blow the height.
 *
 * @param {{ width: number, height: number, gray: Uint8Array, frames?: number }} shot
 */
export function landscapePreview(shot) {
  if (!shot) return shot;
  const w = shot.width | 0;
  const h = shot.height | 0;
  const gray = shot.gray;
  if (!gray || w < 1 || h < 1 || gray.length < w * h) {
    return { ...shot, rotated: false };
  }
  if (h <= w) return { ...shot, rotated: false };
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x * h + (h - 1 - y)] = gray[y * w + x];
    }
  }
  return {
    ...shot,
    width: h,
    height: w,
    gray: out,
    rotated: true,
  };
}

/**
 * First output plane after the chosen factor / reduce, for the ingest preview.
 * Reads only the first `ft` source T-planes from the blob.
 *
 * @param {Blob} blob
 * @param {{
 *   shape: number[],
 *   descr: string,
 *   bodyOffset: number,
 *   itemSize: number,
 * }} header
 * @param {number} factor
 * @param {string} [reduce]
 */
export async function previewIngestFromBlob(blob, header, factor, reduce) {
  const f = factor | 0 || 1;
  const mode = normalizeBinReduce(reduce);
  const { t, h, w, c } = countAxes(header.shape);
  const out = f <= 1 ? { t, h, w, ft: 1, fh: 1, fw: 1 } : binnedAxes({ t, h, w }, f);
  const ft = Math.min(out.ft, t);
  const itemSize = header.itemSize | 0;
  const planeElems = h * w * c;
  const planeBytes = planeElems * itemSize;
  const start = header.bodyOffset | 0;
  const buf = await blob.slice(start, start + ft * planeBytes).arrayBuffer();
  const src = npyArrayFromBytes(new Uint8Array(buf), header.descr, ft * planeElems);
  const plane = new Uint16Array(out.h * out.w);
  for (let oh = 0; oh < out.h; oh++) {
    for (let ow = 0; ow < out.w; ow++) {
      plane[oh * out.w + ow] = neighborhoodReduce(
        src,
        0,
        oh * out.fh,
        ow * out.fw,
        ft,
        out.fh,
        out.fw,
        h,
        w,
        c,
        planeElems,
        mode,
      );
    }
  }
  return {
    width: out.w,
    height: out.h,
    gray: stretchGrayU8(plane),
    frames: ft,
  };
}
