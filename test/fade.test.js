import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { depthFade } from "../src/fade.js";

describe("depthFade", () => {
  it("is 1 across the window when decay is off", () => {
    assert.equal(depthFade(0, 48, false), 1);
    assert.equal(depthFade(47, 48, false), 1);
  });

  it("is 1 at the plane and 0 at the back of the drawn span", () => {
    assert.equal(depthFade(0, 48, true), 1);
    assert.equal(depthFade(47, 48, true), 0);
    assert.ok(depthFade(24, 48, true) > 0.4);
    assert.ok(depthFade(24, 48, true) < 0.6);
  });

  it("uses the current window, not a longer cache", () => {
    assert.equal(depthFade(10, 11, true), 0);
    assert.ok(depthFade(10, 48, true) > 0.7);
  });
});
