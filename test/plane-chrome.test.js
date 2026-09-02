import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  anyFrameChromeVisible,
  centerChromeVisible,
  outerChromeVisible,
} from "../src/plane-chrome.js";

describe("centerChromeVisible", () => {
  it("shows playhead frames by default", () => {
    assert.equal(centerChromeVisible(false), true);
  });

  it("hides playhead frames when Hide center is on", () => {
    assert.equal(centerChromeVisible(true), false);
  });

  it("keeps the current plane in a viewcube cut", () => {
    assert.equal(centerChromeVisible(true, { cut: true }), true);
  });
});

describe("outerChromeVisible", () => {
  it("shows clip frames while inspecting", () => {
    assert.equal(outerChromeVisible(false, { inspect: true }), true);
  });

  it("hides clip frames when Hide outer is on", () => {
    assert.equal(outerChromeVisible(true, { inspect: true }), false);
  });

  it("forces clip / bound frames off in a phone AR session", () => {
    assert.equal(outerChromeVisible(false, { inspect: true, arHideOuter: true }), false);
  });

  it("does not show clips in live, a cut, or while the stack is live-locked", () => {
    assert.equal(outerChromeVisible(false, { inspect: false }), false);
    assert.equal(outerChromeVisible(false, { inspect: true, cut: true }), false);
    assert.equal(outerChromeVisible(false, { inspect: true, liveLocked: true }), false);
  });
});

describe("anyFrameChromeVisible", () => {
  it("allows grabbing the remaining set when only one hide is on", () => {
    const inspect = { inspect: true };
    assert.equal(anyFrameChromeVisible(true, false, inspect), true);
    assert.equal(anyFrameChromeVisible(false, true, inspect), true);
    assert.equal(anyFrameChromeVisible(true, true, inspect), false);
  });
});
