/** Rolling frame-time / FPS for the display HUD. */

export const SPARK_LEN = 96;
export const SPARK_MS_CAP = 50;

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

  tick(nowMs) {
    if (this._last == null) {
      this._last = nowMs;
      return 1 / 60;
    }
    let dt = (nowMs - this._last) / 1000;
    this._last = nowMs;
    if (dt > 0.1) dt = 0.1;
    const ms = dt * 1000;
    this.emaMs = this.emaMs * 0.9 + ms * 0.1;
    this.samples[this.head] = ms;
    this.head = (this.head + 1) % SPARK_LEN;
    if (this.count < SPARK_LEN) this.count += 1;
    this._frames += 1;
    this._acc += dt;
    if (this._acc >= 0.4) {
      this.displayFps = this._frames / this._acc;
      this.displayMs = this.emaMs;
      this._frames = 0;
      this._acc = 0;
    }
    return dt;
  }
}

export function formatViewHud({
  fps,
  avgFps,
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
  const yAt = (ms) => h - 1 - (Math.min(SPARK_MS_CAP, Math.max(0, ms)) / SPARK_MS_CAP) * (h - 2);

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
