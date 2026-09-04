import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_VIEW_QUALITY,
  QUALITY_MEDIUM_CELLS,
  autoViewQuality,
  normalizeViewQuality,
  pixelRatioForQuality,
  viewQualitySpec,
} from "../src/quality.js";

describe("view quality", () => {
  it("defaults unknown ids to high", () => {
    assert.equal(DEFAULT_VIEW_QUALITY, "high");
    assert.equal(normalizeViewQuality(""), "high");
    assert.equal(normalizeViewQuality("potato"), "high");
    assert.equal(normalizeViewQuality("LOW"), "low");
  });

  it("Low is unlit at DPR 1; Medium is Lambert without ACES/fill; High keeps ACES", () => {
    assert.deepEqual(viewQualitySpec("low"), {
      id: "low",
      dprCap: 1,
      unlit: true,
      toneMapping: false,
      fillLight: false,
    });
    assert.deepEqual(viewQualitySpec("medium"), {
      id: "medium",
      dprCap: 1,
      unlit: false,
      toneMapping: false,
      fillLight: false,
    });
    assert.deepEqual(viewQualitySpec("high"), {
      id: "high",
      dprCap: 1.25,
      unlit: false,
      toneMapping: true,
      fillLight: true,
    });
  });

  it("caps drawing-buffer scale for device, coarse, and headset", () => {
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 2 }), 1.25);
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 3, coarse: true }), 1.25);
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 3, headset: true }), 1.25);
    assert.equal(pixelRatioForQuality("medium", { devicePixelRatio: 2 }), 1);
    assert.equal(pixelRatioForQuality("low", { devicePixelRatio: 2 }), 1);
    assert.equal(pixelRatioForQuality("high", { devicePixelRatio: 0.75 }), 0.75);
  });

  it("auto Medium only above 500k cells and never Low", () => {
    assert.equal(QUALITY_MEDIUM_CELLS, 500_000);
    assert.equal(autoViewQuality({}), "high");
    assert.equal(autoViewQuality({ cells: 12 }), "high");
    assert.equal(autoViewQuality({ cells: 500_000 }), "high");
    assert.equal(autoViewQuality({ cells: 500_001 }), "medium");
    assert.equal(autoViewQuality({ cells: 5_400_000 }), "medium");
  });
});
