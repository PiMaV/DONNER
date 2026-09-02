/**
 * CPU path timers, GPU capability probe, and Conway load presets.
 *
 * Frame time from FrameClock is the product number. This module answers
 * "which step cost how much" and "are we on a software rasterizer".
 */

export const BENCH_KEYS = ["sim", "soa", "inst", "hover", "rend", "hud"];

const KEY_LABEL = {
  sim: "sim",
  soa: "soa",
  inst: "inst",
  hover: "hov",
  rend: "rend",
  hud: "hud",
};

/** Known software / CPU rasterizer strings. Absence of a match is not hardware. */
export const SOFTWARE_RENDERER_RE =
  /llvmpipe|swiftshader|microsoft basic render|gdi generic|softpipe|mesa software|cpu rasterizer|anglenull/i;

export function isSoftwareRenderer(renderer = "", vendor = "") {
  return SOFTWARE_RENDERER_RE.test(`${renderer} ${vendor}`);
}

export class PathTimer {
  /**
   * @param {string[]} keys
   * @param {number} [capacity]
   */
  constructor(keys = BENCH_KEYS, capacity = 120) {
    this.keys = keys.slice();
    this.capacity = capacity;
    this.enabled = false;
    /** @type {Record<string, { last: number, max: number, samples: Float32Array, head: number, count: number }>} */
    this.tracks = Object.fromEntries(
      keys.map((k) => [
        k,
        {
          last: 0,
          max: 0,
          samples: new Float32Array(capacity),
          head: 0,
          count: 0,
        },
      ]),
    );
  }

  setEnabled(on) {
    const next = Boolean(on);
    if (this.enabled === next) return;
    this.enabled = next;
    if (!next) this.reset();
  }

  record(key, ms) {
    if (!this.enabled) return;
    const t = this.tracks[key];
    if (!t) return;
    const v = ms > 0 ? ms : 0;
    t.last = v;
    if (v > t.max) t.max = v;
    t.samples[t.head] = v;
    t.head = (t.head + 1) % this.capacity;
    if (t.count < this.capacity) t.count += 1;
  }

  measure(key, fn) {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = fn();
    this.record(key, performance.now() - t0);
    return out;
  }

  avg(key) {
    const t = this.tracks[key];
    if (!t || !t.count) return 0;
    let sum = 0;
    for (let i = 0; i < t.count; i++) {
      const idx = (t.head - t.count + i + this.capacity) % this.capacity;
      sum += t.samples[idx];
    }
    return sum / t.count;
  }

  p95(key) {
    const t = this.tracks[key];
    if (!t || !t.count) return 0;
    const copy = [];
    for (let i = 0; i < t.count; i++) {
      const idx = (t.head - t.count + i + this.capacity) % this.capacity;
      copy.push(t.samples[idx]);
    }
    copy.sort((a, b) => a - b);
    return copy[Math.min(copy.length - 1, Math.floor(0.95 * (copy.length - 1)))];
  }

  reset() {
    for (const k of this.keys) {
      const t = this.tracks[k];
      t.last = 0;
      t.max = 0;
      t.head = 0;
      t.count = 0;
    }
  }

  snapshot() {
    return this.keys.map((key) => ({
      key,
      last: this.tracks[key].last,
      avg: this.avg(key),
      max: this.tracks[key].max,
      p95: this.p95(key),
    }));
  }
}

/**
 * Compact path-timer copy for the opt-in View Bench checkbox. `work` is soa / inst / rend for the last frame.
 * `now` is this frame only (0 if that path did not run). Reset timers on preset
 * or the rolling avg/max still show the previous load.
 * @param {{
 *   rows: ReturnType<PathTimer["snapshot"]>,
 *   work: string,
 *   forceFull?: boolean,
 *   frameMs?: number,
 *   bound?: string,
 * }} opts
 */
export function formatBenchHud({
  rows,
  work,
  forceFull = false,
  frameMs = 0,
  bound = "",
}) {
  const lines = [`cpu   now   avg   max`, `work  ${work}${forceFull ? " FULL" : ""}`];
  if (bound) lines.push(`bound ${bound}`);
  if (frameMs > 0) lines.push(`frm   ${frameMs.toFixed(1)}`);
  for (const r of rows) {
    const lab = (KEY_LABEL[r.key] || r.key).padEnd(4);
    lines.push(
      `${lab}  ${r.last.toFixed(1).padStart(4)}  ${r.avg.toFixed(1).padStart(4)}  ${r.max.toFixed(1).padStart(4)}`,
    );
  }
  return lines.join("\n");
}

/**
 * CPU path vs wall-clock frame. GPU-bound when the frame is long but
 * fillSoA/render CPU are small (typical: 50k cubes, retina canvas, paused).
 */
export function inferBound(rows, frameMs, work) {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.last]));
  const soa = byKey.soa || 0;
  const inst = byKey.inst || 0;
  const rend = byKey.rend || 0;
  const sim = byKey.sim || 0;
  const cpu = sim + soa + inst + rend;
  if (soa > 8 && soa >= inst && soa >= rend) return "CPU soa";
  if (frameMs > 28 && cpu < frameMs * 0.45 && work === "rend") return "GPU fill";
  if (frameMs > 28 && inst > 8 && inst >= soa) return "CPU inst";
  if (frameMs > 28 && cpu < frameMs * 0.45) return "GPU fill";
  return "ok";
}

/**
 * Read WebGL strings the browser is willing to give. Unmasked vendor/renderer
 * are often blocked; then we report "unknown" rather than invent a GPU.
 * @param {import("three").WebGLRenderer} renderer
 * @param {{ dpr?: number, canvasWidth?: number, canvasHeight?: number }} [view]
 */
export function probeGpu(renderer, view = {}) {
  const gl = renderer.getContext();
  const webgl2 =
    typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  let unmaskedRenderer = "";
  let unmaskedVendor = "";
  if (debug) {
    unmaskedRenderer = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || "");
    unmaskedVendor = String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || "");
  }
  const paramRenderer = String(gl.getParameter(gl.RENDERER) || "");
  const paramVendor = String(gl.getParameter(gl.VENDOR) || "");
  const gpuRenderer = unmaskedRenderer || paramRenderer || "unknown";
  const gpuVendor = unmaskedVendor || paramVendor || "unknown";
  const masked = !unmaskedRenderer;
  const software = isSoftwareRenderer(gpuRenderer, gpuVendor);
  const timerQuery = Boolean(
    (webgl2 && gl.getExtension("EXT_disjoint_timer_query_webgl2")) ||
      gl.getExtension("EXT_disjoint_timer_query"),
  );
  const attrs = gl.getContextAttributes ? gl.getContextAttributes() : null;
  const canvas = renderer.domElement;
  return {
    webgl2,
    renderer: gpuRenderer,
    vendor: gpuVendor,
    masked,
    software,
    dpr: view.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    canvasWidth: view.canvasWidth ?? canvas.width,
    canvasHeight: view.canvasHeight ?? canvas.height,
    antialias: Boolean(attrs && attrs.antialias),
    timerQuery,
    webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
  };
}

/**
 * @param {ReturnType<typeof probeGpu> | null} gpu
 */
export function formatGpuHud(gpu) {
  if (!gpu) return "GPU   unknown";
  const lines = [
    gpu.webgl2 ? "WebGL2" : "WebGL1",
    gpu.renderer,
  ];
  if (gpu.vendor && gpu.vendor !== gpu.renderer) lines.push(gpu.vendor);
  if (gpu.software) lines.push("SOFTWARE RENDERING");
  else if (gpu.masked && gpu.renderer === "unknown") lines.push("GPU    unknown");
  else lines.push("hardware (hint)");
  if (gpu.masked) lines.push("unmasked blocked");
  lines.push(`DPR   ${gpu.dpr.toFixed(2)}`);
  lines.push(`VIEW  ${gpu.canvasWidth}×${gpu.canvasHeight}`);
  lines.push(`AA    ${gpu.antialias ? "on" : "off"}`);
  lines.push(`GPU t ${gpu.timerQuery ? "ext" : "n/a"}`);
  lines.push(`WebGPU ${gpu.webgpu ? "yes" : "no"}`);
  return lines.join("\n");
}

