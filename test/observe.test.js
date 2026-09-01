import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ISOLATE_FIELD } from "../src/config.js";
import {
  cellFromWorldXZ,
  cellsEqual,
  dragFocusBack,
  isolationWeight,
  screenPxPerWorldY,
  voxelFromLocal,
} from "../src/observe.js";

describe("cell pick from world XZ", () => {
  it("maps the origin cell on a 5×5 board", () => {
    const c = cellFromWorldXZ(0, 0, 5, 5, 1);
    assert.deepEqual(c, { x: 2, y: 2 });
  });

  it("returns null outside the board", () => {
    assert.equal(cellFromWorldXZ(20, 0, 5, 5, 1), null);
  });
});

describe("isolation weight", () => {
  it("is 1 when isolation is off", () => {
    assert.equal(isolationWeight(null, 1, 1), 1);
  });

  it("keeps the picked cell and dims the field", () => {
    assert.equal(isolationWeight({ x: 3, y: 4 }, 3, 4), 1);
    assert.equal(isolationWeight({ x: 3, y: 4 }, 3, 5), ISOLATE_FIELD);
  });

  it("compares cells", () => {
    assert.equal(cellsEqual({ x: 1, y: 2 }, { x: 1, y: 2 }), true);
    assert.equal(cellsEqual({ x: 1, y: 2 }, { x: 2, y: 1 }), false);
    assert.equal(cellsEqual(null, { x: 0, y: 0 }), false);
  });
});

describe("on-volume time drag", () => {
  it("maps screen-up to deeper past (volume rises)", () => {
    assert.equal(dragFocusBack(4, -32, 16), 6);
    assert.equal(dragFocusBack(4, 16, 16), 3);
    assert.equal(dragFocusBack(0, 0, 16), 0);
  });

  it("uses a floor when the projected Y axis is tiny", () => {
    assert.equal(screenPxPerWorldY(0, 0, 800), 8);
    assert.ok(screenPxPerWorldY(0, 1, 800) > 8);
  });
});

describe("voxel from turntable local", () => {
  it("reads product XY and time from local XZY", () => {
    const v = voxelFromLocal(0, -3, 0, 5, 5, 1, 10, 1);
    assert.deepEqual(v, { x: 2, y: 2, t: 7 });
  });
});
