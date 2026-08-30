/** Rolling frame-time / FPS for the performance HUD. */

export class FrameClock {
  constructor() {
    this.emaMs = 16.7;
    this.fps = 60;
    this._last = 0;
    this._frames = 0;
    this._acc = 0;
    this.displayFps = 0;
    this.displayMs = 16.7;
  }

  tick(nowMs) {
    if (!this._last) {
      this._last = nowMs;
      return 1 / 60;
    }
    let dt = (nowMs - this._last) / 1000;
    this._last = nowMs;
    if (dt > 0.1) dt = 0.1;
    const ms = dt * 1000;
    this.emaMs = this.emaMs * 0.9 + ms * 0.1;
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

export function formatHud({
  generation,
  focus,
  live,
  instances,
  truncated,
  fps,
  ms,
  gps,
  playing,
  editing,
  bird = false,
  isolating = false,
  isolate = null,
}) {
  const trunc = truncated ? " trunc" : "";
  let run = playing ? "play" : "pause";
  if (editing) run = "edit";
  const lines = [
    `GEN  ${generation}`,
    `FOC  ${focus}`,
    `LIVE ${live}`,
    `INST ${instances}${trunc}`,
    `FPS  ${fps.toFixed(0)}`,
    `FR   ${ms.toFixed(1)} ms`,
    `RATE ${gps.toFixed(1)} /s`,
    run.toUpperCase(),
  ];
  if (bird) lines.push("BIRD");
  if (isolate) lines.push(`ISO  ${isolate.x},${isolate.y}`);
  else if (isolating) lines.push("ISO  …");
  return lines.join("\n");
}
