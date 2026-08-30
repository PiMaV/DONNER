import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FrameClock, formatSourceHud, formatViewHud, SPARK_LEN } from "../src/hud.js";

describe("FrameClock", () => {
  it("records frame times and a rolling average", () => {
    const clock = new FrameClock();
    clock.tick(0);
    clock.tick(16);
    clock.tick(32);
    clock.tick(48);
    assert.equal(clock.count, 3);
    assert.ok(clock.avgMs > 10 && clock.avgMs < 22);
    assert.ok(clock.avgFps > 40);
  });

  it("records raw frame times and only caps simulation dt", () => {
    const clock = new FrameClock();
    clock.tick(0);
    const simDt = clock.tick(80);
    assert.ok(clock.avgMs > 70 && clock.avgMs < 90);
    assert.equal(simDt, 0.08);
  });

  it("caps catch-up dt without flattening a slow HUD sample", () => {
    const clock = new FrameClock();
    clock.tick(0);
    const simDt = clock.tick(250);
    assert.ok(clock.avgMs > 200);
    assert.equal(simDt, 0.1);
  });

  it("skips a long pause so FPS does not stick at 10", () => {
    const clock = new FrameClock();
    clock.tick(0);
    clock.tick(16);
    const n = clock.count;
    clock.tick(16 + 2500);
    assert.equal(clock.count, n);
    assert.ok(clock.avgMs < 30);
  });

  it("caps the spark ring", () => {
    const clock = new FrameClock();
    clock.tick(0);
    for (let i = 1; i <= SPARK_LEN + 8; i++) clock.tick(i * 16);
    assert.equal(clock.count, SPARK_LEN);
  });
});

describe("HUD copy", () => {
  it("keeps display lines off the source block", () => {
    const view = formatViewHud({
      fps: 59.4,
      avgFps: 57.2,
      ms: 16.8,
      instances: 1200,
      truncated: true,
      focus: 12,
      playing: true,
      bird: true,
      isolating: true,
      isolate: { x: 3, y: 4 },
    });
    const src = formatSourceHud({
      generation: 40,
      live: 9,
      gps: 8.2,
      editing: true,
    });
    assert.match(view, /^FPS {2}59/m);
    assert.match(view, /AVG {2}57/);
    assert.match(view, /INST 1200 trunc/);
    assert.match(view, /FOC {2}12/);
    assert.match(view, /PLAY/);
    assert.match(view, /BIRD/);
    assert.match(view, /ISO {2}3,4/);
    assert.doesNotMatch(view, /GEN/);
    assert.doesNotMatch(view, /RATE/);
    assert.match(src, /GEN {2}40/);
    assert.match(src, /LIVE 9/);
    assert.match(src, /RATE 8\.2 \/s/);
    assert.match(src, /EDIT/);
    assert.doesNotMatch(src, /FPS/);
  });
});
