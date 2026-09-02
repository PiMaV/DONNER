import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_VIEW_QUALITY,
  normalizeViewQuality,
  pixelRatioForQuality,
  viewQualitySpec,
} from "../src/quality.js";

describe("view quality", () => {
  it("defaults unknown ids to medium", () => {
    assert.equal(DEFAULT_VIEW_QUALITY, "medium");
    assert.equal(normalizeViewQuality(""), "medium");
    assert.equal(normalizeViewQuality("potato"), "medium");
    assert.equal(normalizeViewQuality("LOW"), "low");
  });

  it("Low is unlit at DPR 1; Medium/High keep Lambert", () => {
    assert.deepEqual(viewQualitySpec("low"), {
      id: "low",
      dprCap: 1,
      unlit: true,
      toneMapping: false,
      fillLight: false,
    });
    assert.equal(viewQualitySpec("medium").unlit, false);
    assert.equal(viewQualitySpec("medium").dprCap, 1.25);
    assert.equal(viewQualitySpec("high").unlit, false);
    assert.equal(viewQualitySpec("high").dprCap, 2);
    assert.equal(viewQualitySpec("high").toneMapping, true);
  });

  it("caps drawing-buffer scale for device, coarse, and headset", () => {
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 2 }), 2);
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 3, coarse: true }), 1.5);
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 3, headset: true }), 1.5);
    assert.equal(pixelRatioForQuality("medium", { devicePixelRatio: 2 }), 1.25);
    assert.equal(pixelRatioForQuality("low", { devicePixelRatio: 2 }), 1);
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 0.75 }), 0.75);
  });
});
