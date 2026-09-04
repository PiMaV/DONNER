import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_START_SOURCE,
  normalizeStartSource,
  parseStartSearch,
  startSearchFromState,
} from "../src/door.js";
import { DEFAULT_VIEW_QUALITY } from "../src/quality.js";

describe("public door query", () => {
  it("defaults to Brain MRI Low and High", () => {
    assert.equal(DEFAULT_START_SOURCE, "mni152-low");
    assert.equal(DEFAULT_VIEW_QUALITY, "high");
    assert.deepEqual(parseStartSearch(""), {
      source: "mni152-low",
      quality: "high",
      face: false,
      facePlacement: { shift: 0, lift: 141, inset: 50, mag: 1.2 },
      qualityExplicit: false,
    });
    assert.deepEqual(parseStartSearch("?foo=bar"), {
      source: "mni152-low",
      quality: "high",
      face: false,
      facePlacement: { shift: 0, lift: 141, inset: 50, mag: 1.2 },
      qualityExplicit: false,
    });
    assert.equal(parseStartSearch("?quality=medium").qualityExplicit, true);
  });

  it("allow-lists src aliases and COUNT_DEMOS ids", () => {
    assert.equal(normalizeStartSource("LIFE"), "conway");
    assert.equal(normalizeStartSource("lighter-ignition"), "ignition");
    assert.equal(normalizeStartSource("brain"), "mni152-low");
    assert.equal(normalizeStartSource("mri"), "mni152-low");
    assert.equal(normalizeStartSource("mni152-low"), "mni152-low");
    assert.equal(normalizeStartSource("mri-high"), "mni152");
    assert.equal(normalizeStartSource("ignition"), "ignition");
    assert.equal(normalizeStartSource("count"), null);
    assert.equal(normalizeStartSource("https://evil.example/x.npy"), null);
    assert.equal(parseStartSearch("?src=brain").source, "mni152-low");
    assert.equal(parseStartSearch("?src=mni152&quality=high").source, "mni152");
    assert.equal(parseStartSearch("?source=lighter&q=low").quality, "low");
    assert.equal(parseStartSearch("?src=nope").source, "mni152-low");
  });

  it("writes only non-default query keys and Face without millimetre fit", () => {
    assert.equal(startSearchFromState({ source: "mni152-low", quality: "high" }), "");
    assert.equal(
      startSearchFromState({ source: "mni152-low", quality: "medium" }),
      "?quality=medium",
    );
    assert.equal(
      startSearchFromState({ source: "conway", quality: "high" }),
      "?src=conway",
    );
    assert.equal(
      startSearchFromState({ source: "ignition", quality: "high" }),
      "?src=ignition",
    );
    assert.equal(
      startSearchFromState({ source: "mni152", quality: "high" }),
      "?src=mni152",
    );
    assert.equal(startSearchFromState({ source: "count", quality: "low" }), "?quality=low");
    assert.equal(
      startSearchFromState({ source: "mni152-low", quality: "high", face: true }),
      "?face=1",
    );
    assert.equal(
      startSearchFromState({
        source: "conway",
        quality: "high",
        face: true,
      }),
      "?src=conway&face=1",
    );
    assert.equal(
      startSearchFromState({
        source: "mni152-low",
        quality: "high",
        face: true,
        facePlacement: { shift: 12, lift: 96, inset: 40, mag: 1 },
      }),
      "?face=1",
    );
    assert.equal(parseStartSearch("?face=1").face, true);
    assert.equal(parseStartSearch("?face=1&lift=96&inset=40").facePlacement.lift, 96);
    assert.equal(parseStartSearch("?face=1&lift=96&inset=40").facePlacement.inset, 40);
  });
});
