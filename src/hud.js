/** Rolling frame-time / FPS for the display HUD. */

export const SPARK_LEN = 96;
export const SPARK_MS_CAP = 50;
/** Rolling window for 1% / 0.1% lows (~16 s at 60 fps). Sparkline stays short. */
export const LOW_LEN = 1000;
/** Simulation catch-up cap. HUD uses raw frame time, not this. */
export const SIM_DT_MAX = 0.1;
/** Ignore a pause (tab hidden, breakpoint) so AVG/FPS do not stick at 10. */
export const FRAME_GAP_SKIP = 1;

/**
 * Mean of the slowest `frac` of frame times (Captec-style 1% / 0.1% low).
 * `frac` is 0.01 or 0.001. Returns milliseconds.
 */
export function meanSlowestMs(values, frac) {
  const n = values.length;
  if (!n) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const k = Math.max(1, Math.round(n * frac));
  let sum = 0;
  for (let i = n - k; i < n; i++) sum += sorted[i];
  return sum / k;
}

export class FrameClock {
  constructor() {
    this.emaMs = 16.7;
    this.fps = 60;
    this._last = null;
    this._frames = 0;
    this._acc = 0;
    this.displayFps = 0;
    this.displayMs = 16.7;
    this.samples = new Float32Array(SPARK_LEN);
    this.count = 0;
    this.head = 0;
    this.lowSamples = new Float32Array(LOW_LEN);
    this.lowCount = 0;
    this.lowHead = 0;
    this.displayLow1 = 0;
    this.displayLow01 = 0;
    this._lowCopy = [];
  }

  get avgMs() {
    if (!this.count) return this.emaMs;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - this.count + i + SPARK_LEN) % SPARK_LEN;
      sum += this.samples[idx];
    }
    return sum / this.count;
  }

  get avgFps() {
    const ms = this.avgMs;
    return ms > 0 ? 1000 / ms : 0;
  }

  _copyLows() {
    const n = this.lowCount;
    const out = this._lowCopy;
    out.length = n;
    const start = this.lowHead - n;
    for (let i = 0; i < n; i++) {
      out[i] = this.lowSamples[(start + i + LOW_LEN) % LOW_LEN];
    }
    return out;
  }

  get low1Fps() {
    const ms = meanSlowestMs(this._copyLows(), 0.01);
    return ms > 0 ? 1000 / ms : 0;
  }

  get low01Fps() {
    const ms = meanSlowestMs(this._copyLows(), 0.001);
    return ms > 0 ? 1000 / ms : 0;
  }

  tick(nowMs) {
    if (this._last == null) {
      this._last = nowMs;
      return 1 / 60;
    }
    const rawDt = (nowMs - this._last) / 1000;
    this._last = nowMs;
    if (rawDt > FRAME_GAP_SKIP) return 1 / 60;
    const ms = rawDt * 1000;
    this.emaMs = this.emaMs * 0.9 + ms * 0.1;
    this.samples[this.head] = ms;
    this.head = (this.head + 1) % SPARK_LEN;
    if (this.count < SPARK_LEN) this.count += 1;
    this.lowSamples[this.lowHead] = ms;
    this.lowHead = (this.lowHead + 1) % LOW_LEN;
    if (this.lowCount < LOW_LEN) this.lowCount += 1;
    this._frames += 1;
    this._acc += rawDt;
    if (this._acc >= 0.4) {
      this.displayFps = this._frames / this._acc;
      this.displayMs = this.emaMs;
      this.displayLow1 = this.low1Fps;
      this.displayLow01 = this.low01Fps;
      this._frames = 0;
      this._acc = 0;
    }
    return Math.min(rawDt, SIM_DT_MAX);
  }
}

export function formatViewHud({
  fps,
  avgFps,
  low1Fps,
  low01Fps,
  ms,
  instances,
  truncated,
  focus,
  playing,
  bird = false,
  isolating = false,
  isolate = null,
}) {
  const trunc = truncated ? " trunc" : "";
  const lines = [
    `FPS  ${fps.toFixed(0)}`,
    `AVG  ${avgFps.toFixed(0)}`,
    `1%   ${low1Fps.toFixed(0)}`,
    `0.1% ${low01Fps.toFixed(0)}`,
    `FR   ${ms.toFixed(1)} ms`,
    `INST ${instances}${trunc}`,
    `FOC  ${focus}`,
    playing ? "PLAY" : "PAUSE",
  ];
  if (bird) lines.push("BIRD");
  if (isolate) lines.push(`ISO  ${isolate.x},${isolate.y}`);
  else if (isolating) lines.push("ISO  …");
  return lines.join("\n");
}

export function formatSourceHud({ generation, live, gps, editing }) {
  const lines = [
    `GEN  ${generation}`,
    `LIVE ${live}`,
    `RATE ${gps.toFixed(1)} /s`,
  ];
  if (editing) lines.push("EDIT");
  return lines.join("\n");
}

export function drawSparkline(canvas, clock) {
  if (!canvas || !clock.count) return;
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const cssW = canvas.clientWidth || 160;
  const cssH = canvas.clientHeight || 32;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  let cap = SPARK_MS_CAP;
  for (let i = 0; i < clock.count; i++) {
    const idx = (clock.head - clock.count + i + SPARK_LEN) % SPARK_LEN;
    if (clock.samples[idx] > cap) cap = clock.samples[idx];
  }
  const yAt = (ms) => h - 1 - (Math.min(cap, Math.max(0, ms)) / cap) * (h - 2);

  ctx.strokeStyle = "rgba(0, 255, 242, 0.22)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  const y60 = yAt(1000 / 60);
  ctx.moveTo(0, y60);
  ctx.lineTo(w, y60);
  ctx.stroke();

  const n = clock.count;
  ctx.strokeStyle = "#00fff2";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const idx = (clock.head - n + i + SPARK_LEN) % SPARK_LEN;
    const x = n === 1 ? 0 : (i / (n - 1)) * (w - 1);
    const y = yAt(clock.samples[idx]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
