import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cachedDemoVolume,
  clearDemoVolumeCache,
  rememberDemoVolume,
} from "../src/demo-cache.js";

describe("demo volume session cache", () => {
  it("remembers a decoded volume by source kind", () => {
    clearDemoVolumeCache();
    const vol = { name: "mni152_stack" };
    rememberDemoVolume("mni152", vol);
    assert.equal(cachedDemoVolume("mni152"), vol);
    assert.equal(cachedDemoVolume("mni152-low"), null);
    assert.equal(cachedDemoVolume(""), null);
    rememberDemoVolume("", { name: "nope" });
    assert.equal(cachedDemoVolume(""), null);
    clearDemoVolumeCache();
    assert.equal(cachedDemoVolume("mni152"), null);
  });
});
