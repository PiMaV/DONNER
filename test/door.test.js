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
  it("defaults to Game of Life and Medium", () => {
    assert.equal(DEFAULT_START_SOURCE, "conway");
    assert.equal(DEFAULT_VIEW_QUALITY, "medium");
    assert.deepEqual(parseStartSearch(""), {
      source: "conway",
      quality: "medium",
    });
    assert.deepEqual(parseStartSearch("?foo=bar"), {
      source: "conway",
      quality: "medium",
    });
  });

  it("allow-lists src aliases and COUNT_DEMOS ids", () => {
    assert.equal(normalizeStartSource("LIFE"), "conway");
    assert.equal(normalizeStartSource("lighter-ignition"), "ignition");
    assert.equal(normalizeStartSource("brain"), "mni152");
    assert.equal(normalizeStartSource("ignition"), "ignition");
    assert.equal(normalizeStartSource("count"), null);
    assert.equal(normalizeStartSource("https://evil.example/x.npy"), null);
    assert.equal(parseStartSearch("?src=mni152&quality=high").source, "mni152");
    assert.equal(parseStartSearch("?source=lighter&q=low").quality, "low");
    assert.equal(parseStartSearch("?src=nope").source, "conway");
  });

  it("writes only non-default query keys", () => {
    assert.equal(startSearchFromState({ source: "conway", quality: "medium" }), "");
    assert.equal(
      startSearchFromState({ source: "ignition", quality: "medium" }),
      "?src=ignition",
    );
    assert.equal(
      startSearchFromState({ source: "mni152", quality: "high" }),
      "?src=mni152&quality=high",
    );
    assert.equal(startSearchFromState({ source: "count", quality: "low" }), "?quality=low");
  });
});
