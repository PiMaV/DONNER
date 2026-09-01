import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BENCH_PRESETS,
  PathTimer,
  formatBenchHud,
  formatGpuHud,
  inferBound,
  isSoftwareRenderer,
} from "../src/bench.js";
import { KIND_MOVING, KIND_STILL } from "../src/dynamics.js";
import { seedPattern, stepClassic } from "../src/conway.js";
import { mulberry32 } from "../src/rng.js";
import { EventSoA, GenerationRing, drawnWindow, fadePastSpan, formatCacheStatus, visibleTimeSpan } from "../src/spacetime.js";

describe("isSoftwareRenderer", () => {
  it("flags known CPU rasterizers", () => {
    assert.equal(isSoftwareRenderer("llvmpipe (LLVM 15, 256 bits)"), true);
    assert.equal(isSoftwareRenderer("Google SwiftShader"), true);
    assert.equal(isSoftwareRenderer("", "Microsoft Basic Render Driver"), true);
    assert.equal(isSoftwareRenderer("GDI Generic"), true);
    assert.equal(isSoftwareRenderer("Mesa Intel(R) UHD Graphics"), false);
    assert.equal(isSoftwareRenderer("NVIDIA GeForce RTX 4070"), false);
    assert.equal(isSoftwareRenderer(""), false);
  });
});

describe("PathTimer", () => {
  it("records last, rolling average, max, and p95", () => {
    const t = new PathTimer(["soa"], 8);
    t.record("soa", 2);
    t.record("soa", 4);
    t.record("soa", 6);
    t.record("soa", 40);
    assert.equal(t.tracks.soa.last, 40);
    assert.equal(t.tracks.soa.max, 40);
    assert.ok(t.avg("soa") > 10);
    assert.ok(t.p95("soa") >= 6);
    const snap = t.snapshot();
    assert.equal(snap[0].key, "soa");
    assert.equal(snap[0].max, 40);
  });

  it("measure wraps a function", () => {
    const t = new PathTimer(["sim"]);
    const out = t.measure("sim", () => 7);
    assert.equal(out, 7);
    assert.ok(t.tracks.sim.last >= 0);
  });

  it("reset clears rolling avg and max", () => {
    const t = new PathTimer(["soa"], 8);
    t.record("soa", 40);
    t.reset();
    assert.equal(t.tracks.soa.last, 0);
    assert.equal(t.tracks.soa.max, 0);
    assert.equal(t.avg("soa"), 0);
    assert.equal(t.tracks.soa.count, 0);
  });
});

describe("formatBenchHud / formatGpuHud", () => {
  it("includes work and path rows", () => {
    const t = new PathTimer(["sim", "soa"]);
    t.record("sim", 1.2);
    t.record("soa", 3.4);
    const text = formatBenchHud({
      rows: t.snapshot(),
      work: "rend",
      forceFull: true,
      frameMs: 45,
      bound: "GPU fill",
    });
    assert.match(text, /work  rend FULL/);
    assert.match(text, /bound GPU fill/);
    assert.match(text, /frm/);
    assert.match(text, /sim/);
    assert.match(text, /soa/);
  });

  it("warns on software and does not invent a GPU", () => {
    const soft = formatGpuHud({
      webgl2: true,
      renderer: "llvmpipe",
      vendor: "Mesa",
      masked: false,
      software: true,
      dpr: 1,
      canvasWidth: 800,
      canvasHeight: 600,
      antialias: false,
      timerQuery: false,
      webgpu: false,
    });
    assert.match(soft, /SOFTWARE RENDERING/);
    assert.match(soft, /WebGL2/);
    assert.match(soft, /GPU t n\/a/);
    const unknown = formatGpuHud(null);
    assert.match(unknown, /unknown/);
  });
});

describe("visibleTimeSpan", () => {
  it("anchors at Now while the playhead still fits", () => {
    assert.deepEqual(visibleTimeSpan(200, 200, 0, 100), { tLo: 101, tHi: 200 });
    assert.deepEqual(visibleTimeSpan(150, 200, 0, 100), { tLo: 101, tHi: 200 });
  });

  it("slides so tFocus stays inside when scrubbed past the window", () => {
    assert.deepEqual(visibleTimeSpan(50, 200, 0, 100), { tLo: 50, tHi: 149 });
  });

  it("clips to the oldest stored generation", () => {
    assert.deepEqual(visibleTimeSpan(10, 20, 5, 100), { tLo: 5, tHi: 20 });
  });
});

describe("drawnWindow", () => {
  it("is Depth while live and the full tape while inspecting", () => {
    assert.equal(drawnWindow(false, 500, 48), 48);
    assert.equal(drawnWindow(true, 500, 48), 500);
  });
});

describe("fadePastSpan", () => {
  it("is the past under the plane, not ghost slices above", () => {
    assert.equal(fadePastSpan(200, 153), 48);
    assert.equal(fadePastSpan(50, 0), 51);
  });
});

describe("inferBound", () => {
  it("flags CPU soa when classification dominates", () => {
    const rows = [
      { key: "sim", last: 0 },
      { key: "soa", last: 217 },
      { key: "inst", last: 6 },
      { key: "rend", last: 0.3 },
    ];
    assert.equal(inferBound(rows, 45, "soa"), "CPU soa");
  });

  it("flags GPU fill when the frame is long but CPU paths are idle", () => {
    const rows = [
      { key: "sim", last: 0 },
      { key: "soa", last: 0 },
      { key: "inst", last: 0 },
      { key: "rend", last: 0.3 },
    ];
    assert.equal(inferBound(rows, 45, "rend"), "GPU fill");
  });
});

describe("GenerationRing.resize", () => {
  function fillRing(capacity, gens) {
    const ring = new GenerationRing(capacity, 4);
    const grid = new Uint8Array(4);
    grid[0] = 1;
    for (let t = 0; t < gens; t++) ring.pushGrid(grid, 2, 2, t);
    return ring;
  }

  it("grows without dropping stored generations", () => {
    const ring = fillRing(4, 4);
    ring.resize(8);
    assert.equal(ring.capacity, 8);
    assert.equal(ring.size, 4);
    assert.equal(ring.oldestT(), 0);
    assert.equal(ring.liveAt(3), 1);
    ring.pushGrid(new Uint8Array([1, 0, 0, 0]), 2, 2, 4);
    assert.equal(ring.liveAt(4), 1);
    assert.equal(ring.oldestT(), 0);
  });

  it("shrinks by dropping the oldest slices", () => {
    const ring = fillRing(8, 8);
    ring.resize(3);
    assert.equal(ring.capacity, 3);
    assert.equal(ring.size, 3);
    assert.equal(ring.oldestT(), 5);
    assert.equal(ring.liveAt(7), 1);
    assert.equal(ring.liveAt(4), 0);
  });
});

describe("append-only tape", () => {
  it("keeps generation 0 while growing and stops at the event cap", () => {
    const tape = new GenerationRing(4, 4, {
      appendOnly: true,
      maxCapacity: 32,
      maxEvents: 10,
    });
    const grid = new Uint8Array([1, 0, 0, 0]);
    for (let t = 0; t < 20; t++) tape.pushGrid(grid, 2, 2, t);
    assert.equal(tape.oldestT(), 0);
    assert.ok(tape.stopped);
    assert.ok(tape.size <= 10);
    assert.equal(tape.liveAt(0), 1);
    assert.ok(tape.eventCount >= 10);
  });

  it("formats cache status for the View sheet", () => {
    assert.equal(
      formatCacheStatus({ gens: 12, events: 40, full: false, tapeMode: false }),
      "Cache 12 gen · 40 cells",
    );
    assert.equal(
      formatCacheStatus({ gens: 69, events: 12000, full: true, tapeMode: true, tick: "t" }),
      "Cache 69 t · 12k cells · full · inspect",
    );
    assert.match(
      formatCacheStatus({ gens: 800, events: 12000, full: true, tapeMode: true }),
      /full/,
    );
    assert.match(
      formatCacheStatus({ gens: 800, events: 12000, full: true, tapeMode: true }),
      /inspect/,
    );
  });
});

describe("bench presets", () => {
  it("keeps teaching at 32, neighborhood off, and CPU stress on Depth 100", () => {
    const teaching = BENCH_PRESETS.find((p) => p.id === "teaching");
    const cpu = BENCH_PRESETS.find((p) => p.id === "cpuStress");
    const rend = BENCH_PRESETS.find((p) => p.id === "rendererStress");
    assert.equal(teaching.width, 32);
    assert.equal(teaching.visible, 48);
    assert.equal(teaching.neighborhoodRadius, 0);
    assert.equal(cpu.width, 64);
    assert.equal(cpu.visible, 100);
    assert.equal(cpu.neighborhoodRadius, 0);
    assert.equal(rend.encodingMinimal, true);
    assert.equal(rend.dynamics, false);
  });
});

describe("fillSoA bench flags", () => {
  function blinkerRing() {
    let grid = seedPattern("Blinker", 9, 9, mulberry32(0));
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    for (let t = 0; t <= 2; t++) {
      ring.pushGrid(grid, 9, 9, t);
      if (t < 2) grid = stepClassic(grid, 9, 9, true);
    }
    return { ring, soa };
  }

  it("skips kindAt when dynamics are off", () => {
    const { ring, soa } = blinkerRing();
    ring.fillSoA(soa, 2, 8, 9, { dynamics: false });
    assert.ok(soa.count >= 3);
    for (let i = 0; i < soa.count; i++) {
      assert.equal(soa.k[i], KIND_MOVING);
      assert.equal(soa.s[i], 0);
    }
  });

  it("still classifies occupancy when neighborhood is off", () => {
    const { ring, soa } = blinkerRing();
    ring.fillSoA(soa, 2, 8, 9, { neighborhood: false });
    const kindAt = (x, y) => {
      for (let i = 0; i < soa.count; i++) {
        if (soa.t[i] === 2 && soa.x[i] === x && soa.y[i] === y) return soa.k[i];
      }
      return -1;
    };
    assert.equal(kindAt(4, 4), KIND_STILL);
  });

  it("only instantiates the visible window, not the whole resident ring", () => {
    const n = 8;
    let grid = seedPattern("Blinker", n, n, mulberry32(0));
    const ring = new GenerationRing(40, n * n);
    const soa = new EventSoA(n * n * 40);
    for (let t = 0; t < 30; t++) {
      ring.pushGrid(grid, n, n, t);
      grid = stepClassic(grid, n, n, true);
    }
    ring.fillSoA(soa, 29, 5, n, { tFocus: 29, dynamics: false });
    const times = new Set();
    for (let i = 0; i < soa.count; i++) times.add(soa.t[i]);
    assert.equal(times.size, 5);
    assert.equal(Math.min(...times), 25);
    assert.equal(Math.max(...times), 29);
  });

  it("inspect-sized window keeps gen 0 when the playhead is at Now", () => {
    const n = 8;
    let grid = seedPattern("Blinker", n, n, mulberry32(0));
    const ring = new GenerationRing(40, n * n);
    const soa = new EventSoA(n * n * 40);
    for (let t = 0; t < 30; t++) {
      ring.pushGrid(grid, n, n, t);
      grid = stepClassic(grid, n, n, true);
    }
    ring.fillSoA(soa, 29, ring.size, n, { tFocus: 29, dynamics: false });
    const times = new Set();
    for (let i = 0; i < soa.count; i++) times.add(soa.t[i]);
    assert.ok(times.has(0));
    assert.ok(times.has(29));
    assert.equal(times.size, 30);
  });

  it("honors an explicit inspect slab instead of sliding from Now", () => {
    const n = 8;
    let grid = seedPattern("Blinker", n, n, mulberry32(0));
    const ring = new GenerationRing(40, n * n);
    const soa = new EventSoA(n * n * 40);
    for (let t = 0; t < 30; t++) {
      ring.pushGrid(grid, n, n, t);
      grid = stepClassic(grid, n, n, true);
    }
    ring.fillSoA(soa, 29, 8, n, { tFocus: 15, tLo: 10, tHi: 20, dynamics: false });
    const times = new Set();
    for (let i = 0; i < soa.count; i++) times.add(soa.t[i]);
    assert.equal(Math.min(...times), 10);
    assert.equal(Math.max(...times), 20);
    assert.equal(times.has(29), false);
    assert.equal(times.has(0), false);
  });
});
