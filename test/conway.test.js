import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ConwayWorld,
  countLive,
  gridCyclePeriod,
  gridsEqual,
  seedPattern,
  stepClassic,
} from "../src/conway.js";
import { mulberry32 } from "../src/rng.js";
import {
  KIND_BASE,
  KIND_MOVING,
  KIND_OSC,
  KIND_STILL,
  KIND_UNSETTLED,
  MAX_OSC_PERIOD,
  MAX_STAB_GENS,
  SCALE_OPEN,
  SCALE_UNIFORM,
  classifyWorldline,
  cubeFill,
  kindAt,
  occupancyPeriod,
  stabilityAge,
  stabilityScale,
} from "../src/dynamics.js";
import { clampFocusBack, focusGeneration } from "../src/focus.js";
import { EventSoA, eventAt, GenerationRing } from "../src/spacetime.js";
import { focusSByPacked } from "../src/encoding.js";

describe("Conway B3/S23 (BLITZ parity)", () => {
  it("blinker oscillates with period 2 on a torus", () => {
    const rng = mulberry32(0);
    const g0 = seedPattern("Blinker", 9, 9, rng);
    const g1 = stepClassic(g0, 9, 9, true);
    const g2 = stepClassic(g1, 9, 9, true);
    assert.equal(countLive(g0), 3);
    assert.deepEqual(g0, g2);
  });

  it("glider has five live cells", () => {
    const g = seedPattern("Glider", 16, 16, mulberry32(0));
    assert.equal(countLive(g), 5);
  });

  it("random soup respects rectangular shape and density bounds", () => {
    const g = seedPattern("Random", 128, 64, mulberry32(7), 0.25);
    assert.equal(g.length, 128 * 64);
    const d = countLive(g) / g.length;
    assert.ok(d > 0.15 && d < 0.35);
  });

  it("Gosper gun falls back to glider on a small grid", () => {
    const g = seedPattern("Gosper gun", 16, 16, mulberry32(0));
    assert.equal(countLive(g), 5);
  });

  it("hard edges let a lone cell die", () => {
    const grid = new Uint8Array(5 * 5);
    grid[2 * 5 + 2] = 1;
    const next = stepClassic(grid, 5, 5, false);
    assert.equal(countLive(next), 0);
  });

  it("step reports a still 2×2 block as unchanged", () => {
    const world = new ConwayWorld({ width: 8, height: 8, wrap: true });
    const grid = new Uint8Array(64);
    grid[3 * 8 + 3] = 1;
    grid[3 * 8 + 4] = 1;
    grid[4 * 8 + 3] = 1;
    grid[4 * 8 + 4] = 1;
    world.load(grid);
    assert.equal(world.step(), false);
    assert.equal(world.step(), false);
    assert.ok(gridsEqual(world.grid, grid));
  });

  it("a blinker never goes five generations without a change", () => {
    const world = new ConwayWorld({ width: 9, height: 9, wrap: true });
    world.load(seedPattern("Blinker", 9, 9, mulberry32(0)));
    let hold = 0;
    for (let i = 0; i < 16; i++) {
      hold = world.step() ? 0 : hold + 1;
      assert.ok(hold < 5);
    }
  });

  it("a wrapping glider is never bitwise still", () => {
    const world = new ConwayWorld({ width: 32, height: 32, wrap: true });
    world.load(seedPattern("Glider", 32, 32, mulberry32(0)));
    let hold = 0;
    for (let i = 0; i < 80; i++) {
      const prev = Uint8Array.from(world.grid);
      world.step();
      hold = gridsEqual(prev, world.grid) ? hold + 1 : 0;
      assert.equal(hold, 0);
    }
  });

  it("a 2×2 block has grid cycle period 1", () => {
    const world = new ConwayWorld({ width: 8, height: 8, wrap: true });
    const grid = new Uint8Array(64);
    grid[3 * 8 + 3] = 1;
    grid[3 * 8 + 4] = 1;
    grid[4 * 8 + 3] = 1;
    grid[4 * 8 + 4] = 1;
    world.load(grid);
    const hist = [Uint8Array.from(world.grid)];
    world.step();
    assert.equal(gridCyclePeriod(world.grid, hist, MAX_OSC_PERIOD), 1);
  });

  it("a blinker has grid cycle period 2, not 1", () => {
    const world = new ConwayWorld({ width: 9, height: 9, wrap: true });
    world.load(seedPattern("Blinker", 9, 9, mulberry32(0)));
    const hist = [Uint8Array.from(world.grid)];
    world.step();
    assert.equal(gridCyclePeriod(world.grid, hist, MAX_OSC_PERIOD), 0);
    hist.unshift(Uint8Array.from(world.grid));
    world.step();
    assert.equal(gridCyclePeriod(world.grid, hist, MAX_OSC_PERIOD), 2);
  });

  it("stills plus a blinker are ash with period 2", () => {
    const n = 9;
    const grid = new Uint8Array(n * n);
    grid[1 * n + 1] = 1;
    grid[1 * n + 2] = 1;
    grid[2 * n + 1] = 1;
    grid[2 * n + 2] = 1;
    grid[6 * n + 3] = 1;
    grid[6 * n + 4] = 1;
    grid[6 * n + 5] = 1;
    const world = new ConwayWorld({ width: n, height: n, wrap: true });
    world.load(grid);
    const hist = [Uint8Array.from(world.grid)];
    world.step();
    hist.unshift(Uint8Array.from(world.grid));
    world.step();
    assert.equal(gridCyclePeriod(world.grid, hist, MAX_OSC_PERIOD), 2);
  });

  it("a wrapping glider has no cycle within period 15", () => {
    const world = new ConwayWorld({ width: 32, height: 32, wrap: true });
    world.load(seedPattern("Glider", 32, 32, mulberry32(0)));
    const hist = [Uint8Array.from(world.grid)];
    for (let i = 0; i < 80; i++) {
      world.step();
      assert.equal(gridCyclePeriod(world.grid, hist, MAX_OSC_PERIOD), 0);
      hist.unshift(Uint8Array.from(world.grid));
      while (hist.length > MAX_OSC_PERIOD) hist.pop();
    }
  });

  it("clamps a bad size so load still seeds a blinker", () => {
    const world = new ConwayWorld({ width: Number.NaN, height: Number.NaN });
    world.load(seedPattern("Blinker", world.height, world.width, mulberry32(0)));
    assert.equal(world.width, 8);
    assert.equal(countLive(world.grid), 3);
  });
});

describe("space-time ring", () => {
  it("fills newest generations first and can truncate", () => {
    const ring = new GenerationRing(8, 4);
    const soa = new EventSoA(3);
    for (let t = 0; t < 4; t++) {
      const grid = new Uint8Array([1, 1, 0, 0]);
      ring.pushGrid(grid, 2, 2, t);
    }
    ring.fillSoA(soa, 3, 8);
    assert.equal(soa.count, 3);
    assert.equal(soa.truncated, true);
    assert.equal(soa.t[0], 3);
    assert.equal(ring.liveAt(3), 2);
  });
});

describe("focus plane", () => {
  it("clamps scrub offset to stored history", () => {
    assert.equal(clampFocusBack(99, 10, 48), 10);
    assert.equal(clampFocusBack(99, 80, 48), 48);
    assert.equal(clampFocusBack(-3, 10, 48), 0);
    assert.equal(focusGeneration(40, 12), 28);
  });
});

describe("worldline color class", () => {
  it("classifies still, period-2, and unsettled occupancy", () => {
    assert.equal(classifyWorldline(true, true, true), KIND_STILL);
    assert.equal(classifyWorldline(false, true, false), KIND_OSC);
    assert.equal(classifyWorldline(false, false, false), KIND_UNSETTLED);
  });

  it("tags the first two generations as base, not unsettled", () => {
    const rng = mulberry32(0);
    let grid = seedPattern("Blinker", 9, 9, rng);
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    ring.pushGrid(grid, 9, 9, 0);
    ring.fillSoA(soa, 0, 8, 9);
    assert.ok(soa.count >= 3);
    for (let i = 0; i < soa.count; i++) {
      assert.equal(soa.k[i], KIND_BASE);
    }
  });

  it("tags the first cube of a later worldline as base", () => {
    const isLive = (t, packed) => packed === 0 && t === 4;
    assert.equal(kindAt(4, 0, isLive), KIND_BASE);
    const stay = (t, packed) => packed === 0 && t >= 4;
    assert.equal(kindAt(5, 0, stay), KIND_STILL);
  });

  it("tags blinker tips as oscillators and the core as still", () => {
    const rng = mulberry32(0);
    let grid = seedPattern("Blinker", 9, 9, rng);
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    for (let t = 0; t <= 2; t++) {
      ring.pushGrid(grid, 9, 9, t);
      if (t < 2) grid = stepClassic(grid, 9, 9, true);
    }
    ring.fillSoA(soa, 2, 8, 9);
    const kindAt = (x, y) => {
      for (let i = 0; i < soa.count; i++) {
        if (soa.t[i] === 2 && soa.x[i] === x && soa.y[i] === y) return soa.k[i];
      }
      return -1;
    };
    assert.equal(kindAt(4, 4), KIND_STILL);
    assert.equal(kindAt(3, 4), KIND_OSC);
    assert.equal(kindAt(5, 4), KIND_OSC);
  });

  it("classifies glider occupancy as still or oscillator", () => {
    const n = 16;
    let grid = seedPattern("Glider", n, n, mulberry32(0));
    const ring = new GenerationRing(24, n * n);
    const soa = new EventSoA(n * n * 24);
    for (let t = 0; t < 16; t++) {
      ring.pushGrid(grid, n, n, t);
      grid = stepClassic(grid, n, n, true);
    }
    ring.fillSoA(soa, 15, 16, n, { height: n, wrap: true });
    let locked = 0;
    let moving = 0;
    for (let i = 0; i < soa.count; i++) {
      if (soa.t[i] < 8) continue;
      if (soa.k[i] === KIND_STILL || soa.k[i] === KIND_OSC) locked += 1;
      else if (soa.k[i] === KIND_MOVING) moving += 1;
    }
    assert.ok(locked > 0);
    assert.equal(moving, 0);
  });

  it("locks period-3 occupancy as oscillator, not unsettled", () => {
    const isLive = (t) => t >= 0 && t % 3 === 0;
    assert.equal(occupancyPeriod(4, 0, isLive), 0);
    assert.equal(occupancyPeriod(6, 0, isLive), 3);
    assert.equal(kindAt(6, 0, isLive), KIND_OSC);
    assert.equal(kindAt(3, 0, isLive), KIND_UNSETTLED);
  });

  it("locks period-15 occupancy after 2p history", () => {
    const isLive = (t) => t >= 0 && t % 15 === 0;
    assert.equal(occupancyPeriod(15, 0, isLive), 0);
    assert.equal(occupancyPeriod(30, 0, isLive), 15);
    assert.equal(kindAt(30, 0, isLive), KIND_OSC);
  });
});

describe("stability age", () => {
  it("counts consecutive still gens and caps", () => {
    const isLive = (t) => t >= 0 && t <= 40;
    assert.equal(stabilityAge(40, 0, isLive), MAX_STAB_GENS);
    assert.equal(stabilityAge(3, 0, isLive) >= 1, true);
    assert.equal(stabilityScale(0) < stabilityScale(8), true);
    assert.equal(stabilityScale(16), stabilityScale(99));
  });

  it("stamps per-generation s; focus is a lookup, not a fillSoA rewrite", () => {
    const rng = mulberry32(0);
    let grid = seedPattern("Blinker", 9, 9, rng);
    const ring = new GenerationRing(8, 81);
    const soa = new EventSoA(64);
    for (let t = 0; t <= 2; t++) {
      ring.pushGrid(grid, 9, 9, t);
      if (t < 2) grid = stepClassic(grid, 9, 9, true);
    }
    ring.fillSoA(soa, 2, 8, 9, { tFocus: 2 });
    const timeS = [];
    for (let i = 0; i < soa.count; i++) {
      if (soa.x[i] === 4 && soa.y[i] === 4) timeS.push(soa.s[i]);
    }
    assert.ok(timeS.length >= 2);
    ring.fillSoA(soa, 2, 8, 9, { tFocus: 0, stabMode: "focus" });
    const again = [];
    for (let i = 0; i < soa.count; i++) {
      if (soa.x[i] === 4 && soa.y[i] === 4) again.push(soa.s[i]);
    }
    assert.deepEqual(again, timeS);
    const map = focusSByPacked(soa, 2, 9);
    const packed = 4 * 9 + 4;
    assert.ok(map.has(packed));
    const projected = timeS.map(() => map.get(packed));
    assert.ok(projected.every((s) => s === projected[0]));
  });
});

describe("focus-slice hover lookup", () => {
  it("finds the event at a cell and generation", () => {
    const soa = new EventSoA(4);
    soa.count = 2;
    soa.x[0] = 3;
    soa.y[0] = 4;
    soa.t[0] = 10;
    soa.k[0] = KIND_STILL;
    soa.s[0] = 8;
    soa.x[1] = 3;
    soa.y[1] = 4;
    soa.t[1] = 9;
    soa.k[1] = KIND_MOVING;
    soa.s[1] = 0;
    const e = eventAt(soa, 3, 4, 10);
    assert.equal(e.k, KIND_STILL);
    assert.equal(e.s, 8);
    assert.equal(eventAt(soa, 3, 4, 8), null);
  });

  it("maps occupancy to cube fill", () => {
    assert.equal(cubeFill(null, "time"), 0);
    assert.equal(cubeFill({ k: KIND_BASE, s: 0 }, "time"), SCALE_UNIFORM);
    assert.equal(cubeFill({ k: KIND_STILL, s: 8 }, "none"), SCALE_UNIFORM);
    assert.equal(cubeFill({ k: KIND_MOVING, s: 0 }, "time"), SCALE_OPEN);
    assert.equal(cubeFill({ k: KIND_UNSETTLED, s: 0 }, "time"), SCALE_OPEN);
    assert.ok(
      cubeFill({ k: KIND_STILL, s: 16 }, "time") >
        cubeFill({ k: KIND_STILL, s: 2 }, "time"),
    );
  });
});
