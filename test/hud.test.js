import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FrameClock, formatSourceHud, formatViewHud, meanSlowestMs, SPARK_LEN, LOW_LEN } from "../src/hud.js";

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

  it("keeps a longer ring for lows than for the sparkline", () => {
    const clock = new FrameClock();
    clock.tick(0);
    for (let i = 1; i <= LOW_LEN + 8; i++) clock.tick(i * 16);
    assert.equal(clock.count, SPARK_LEN);
    assert.equal(clock.lowCount, LOW_LEN);
  });

  it("drops 1% low when a hitch sits in the slowest percent", () => {
    const clock = new FrameClock();
    clock.tick(0);
    for (let i = 1; i <= 99; i++) clock.tick(i * 16);
    clock.tick(99 * 16 + 100);
    assert.ok(clock.avgFps > 50);
    assert.ok(clock.low1Fps < 15);
    assert.ok(clock.low01Fps < 15);
  });

  it("reset clears the rolling window so a new preset does not inherit hitches", () => {
    const clock = new FrameClock();
    clock.tick(0);
    clock.tick(100);
    clock.reset();
    assert.equal(clock.count, 0);
    assert.equal(clock.lowCount, 0);
    clock.tick(0);
    clock.tick(16);
    assert.ok(clock.avgMs < 30);
  });
});

describe("meanSlowestMs", () => {
  it("averages the slowest fraction of frames", () => {
    assert.equal(meanSlowestMs([16, 16, 16], 0.01), 16);
    const hitch = Array(99).fill(16).concat([100]);
    assert.equal(meanSlowestMs(hitch, 0.01), 100);
    const many = Array(990).fill(16).concat(Array(10).fill(100));
    assert.equal(meanSlowestMs(many, 0.01), 100);
    assert.equal(meanSlowestMs(many, 0.001), 100);
  });
});

describe("HUD copy", () => {
  it("keeps display lines off the source block", () => {
    const view = formatViewHud({
      fps: 59.4,
      avgFps: 57.2,
      low1Fps: 48.2,
      low01Fps: 21.4,
      ms: 16.8,
      instances: 1200,
      truncated: true,
      focus: 12,
      playing: true,
      ortho: true,
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
    assert.match(view, /^1% {3}48/m);
    assert.match(view, /^0\.1% 21/m);
    assert.match(view, /INST 1200 trunc/);
    assert.match(view, /FOC {2}12/);
    assert.match(view, /PLAY/);
    assert.match(view, /ORTHO/);
    assert.match(view, /ISO {2}3,4/);
    assert.doesNotMatch(view, /SOFTWARE/);
    assert.doesNotMatch(view, /GEN/);
    assert.doesNotMatch(view, /RATE/);
    assert.match(src, /GEN {2}40/);
    assert.match(src, /LIVE 9/);
    assert.match(src, /RATE 8\.2 \/s/);
    assert.match(src, /EDIT/);
    assert.doesNotMatch(src, /TAPE/);
    assert.doesNotMatch(src, /FPS/);
    assert.doesNotMatch(src, /1%/);
  });

  it("prints LOOP instead of PLAY when the view loop is walking", () => {
    const view = formatViewHud({
      fps: 60,
      avgFps: 60,
      low1Fps: 60,
      low01Fps: 60,
      ms: 16,
      instances: 10,
      truncated: false,
      focus: 3,
      playing: false,
      looping: true,
    });
    assert.match(view, /LOOP/);
    assert.doesNotMatch(view, /PLAY/);
    assert.doesNotMatch(view, /PAUSE/);
  });

  it("prints SPIN as a second live line so Loop and Spin can both show", () => {
    const view = formatViewHud({
      fps: 60,
      avgFps: 60,
      low1Fps: 60,
      low01Fps: 60,
      ms: 16,
      instances: 10,
      truncated: false,
      focus: 3,
      playing: false,
      looping: true,
      spinning: true,
    });
    assert.match(view, /LOOP/);
    assert.match(view, /SPIN/);
  });

  it("prints count-stack stats without Conway GEN/EDIT", () => {
    const src = formatSourceHud({
      generation: 12,
      live: 80,
      gps: 4.5,
      kind: "count",
      sum: 210,
      ceiling: 9,
    });
    assert.match(src, /T {4}12/);
    assert.match(src, /LIVE 80/);
    assert.match(src, /SUM {2}210/);
    assert.match(src, /MAX {2}9/);
    assert.match(src, /COUNT/);
    assert.doesNotMatch(src, /GEN/);
    assert.doesNotMatch(src, /EDIT/);
  });

  it("adds a SOFTWARE line when the rasterizer is a CPU fallback", () => {
    const view = formatViewHud({
      fps: 12,
      avgFps: 12,
      low1Fps: 10,
      low01Fps: 9,
      ms: 80,
      instances: 10,
      truncated: false,
      focus: 0,
      playing: false,
      software: true,
    });
    assert.match(view, /SOFTWARE/);
  });
});
