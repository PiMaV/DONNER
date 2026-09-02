import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("phone Source sheet and canvas chrome", () => {
  it("does not CSS-transform the WebGL canvas (blank composited layer on phones)", () => {
    assert.equal(/#view\s*\{[^}]*transform\s*:/.test(css), false);
  });

  it("sizes the canvas from inset plus 100%, not 100dvw/100dvh or auto intrinsic", () => {
    const view = css.match(/#view\s*\{[^}]+\}/)?.[0] || "";
    assert.match(view, /inset:\s*0/);
    assert.match(view, /width:\s*100%/);
    assert.match(view, /height:\s*100%/);
    assert.doesNotMatch(view, /100dvw/);
    assert.doesNotMatch(view, /100dvh/);
    assert.doesNotMatch(view, /width:\s*auto/);
  });

  it("keeps the XR overlay out of the fixed containing-block chain until AR", () => {
    const overlay = css.match(/\.xr-overlay\s*\{[^}]+\}/)?.[0] || "";
    assert.match(overlay, /position:\s*absolute/);
    assert.match(css, /html\.is-ar\s+\.xr-overlay\s*\{[^}]*position:\s*fixed/s);
  });

  it("restores pointer-events on an open sheet ancestor so iOS native selects work", () => {
    assert.match(css, /\.controls-root:has\(\.is-open\)\s*\{[^}]*pointer-events:\s*auto/s);
  });

  it("keeps phone fold sheets in landscape (coarse + short viewport)", () => {
    assert.match(
      css,
      /@media\s*\(max-width:\s*720px\),\s*\(pointer:\s*coarse\)\s+and\s+\(max-height:\s*520px\)/,
    );
  });
});

describe("phone AR overlay chrome", () => {
  it("hides Stand on the phone AR overlay", () => {
    assert.match(css, /body\.is-ar\s+\.ar-stand\s*\{[^}]*display:\s*none\s*!important/s);
  });

  it("keeps Stand markup for later Quest use", () => {
    assert.match(html, /class="ar-stand"/);
    assert.match(html, /id="ar-stand-z"/);
  });

  it("adds Search Anchor next to Reset Anchor and Exit", () => {
    assert.match(html, /id="btn-ar-search"[^>]*>Search Anchor</);
    assert.match(html, /id="btn-ar-reset"[^>]*>[\s\S]*Reset Anchor</);
  });

  it("adds a Z height slider separate from Size scale", () => {
    assert.match(html, /id="ar-height"/);
    assert.match(html, /aria-label="AR height off the floor"/);
    assert.match(html, /id="ar-mag"/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.ar-height/);
  });

  it("hides Play, stack, Size, and Yaw until the volume is placed", () => {
    assert.match(css, /body\.is-ar:not\(\.is-ar-placed\)\s+\.btn-play/);
    assert.match(css, /body\.is-ar:not\(\.is-ar-placed\)\s+\.stack/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.ar-size/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.ar-yaw/);
  });
});

describe("desktop Source | View sheets", () => {
  it("lays out Source and View as one stacked accordion rail on desktop", () => {
    const root = css.match(/\.controls-root\s*\{[^}]+\}/)?.[0] || "";
    assert.match(root, /flex-direction:\s*column/);
    assert.match(css, /\.controls\.is-collapsed \.sheet-body/);
    assert.match(html, /id="btn-rail-source"/);
    assert.match(html, /id="btn-rail-view"/);
  });
});
