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

  it("keeps Reset Anchor and Exit without Search Anchor", () => {
    assert.doesNotMatch(html, /id="btn-ar-search"/);
    assert.match(html, /id="btn-ar-reset"[^>]*>[\s\S]*Reset Anchor</);
    assert.match(html, /id="btn-xr-exit"/);
  });

  it("has Size and Yaw after place, and no Z height slider", () => {
    assert.doesNotMatch(html, /id="ar-height"/);
    assert.match(html, /id="ar-mag"/);
    assert.match(html, /id="ar-yaw"/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.ar-size/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.ar-yaw/);
    assert.doesNotMatch(css, /body\.is-ar\.is-ar-placed\s+\.ar-height/);
  });

  it("hides the stack until the volume is placed, then shows all three rails", () => {
    assert.match(css, /body\.is-ar:not\(\.is-ar-placed\)\s+\.stack/);
    assert.doesNotMatch(css, /body\.is-ar\s+\.stack-axis:not\(\.is-z\)/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.inspect-transport/);
  });

  it("parks Hide center, Hide outer, and shade top-right after place, without a viewcube", () => {
    assert.match(html, /class="ar-inspect-chrome"/);
    assert.match(html, /id="ar-shade-hull"/);
    assert.match(html, /id="ar-shade-ghost"/);
    assert.match(html, /id="ar-shade-triple"/);
    assert.match(css, /body\.is-ar\s+\.gizmo-slot/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.gizmo-col/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.ar-inspect-chrome/);
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

  it("keeps View FPS on the fold when the sheet is collapsed", () => {
    assert.match(html, /class="fold-meter"/);
    assert.match(html, /id="view-fps"[^>]*class="[^"]*fold-fps/);
    assert.match(html, /id="hud-view-fps"/);
    assert.match(html, /id="hud-engine"[\s\S]*id="bench"/);
    assert.match(html, /class="check hud-dev"/);
    const fps = html.indexOf('id="view-fps"');
    const body = html.indexOf('id="view-body"');
    assert.ok(fps > 0 && fps < body);
    assert.match(css, /\.fold-meter\s*\{[^}]*display:\s*flex/s);
    assert.match(css, /\.fold-fps\s*\{[^}]*white-space:\s*nowrap/s);
    const collapsed = css.match(/\.controls\.is-collapsed \.sheet-body\s*\{[^}]*\}/)?.[0] || "";
    assert.match(collapsed, /display:\s*none/);
    assert.doesNotMatch(css, /\.controls\.is-collapsed[^{]*#view-fps/);
    assert.doesNotMatch(css, /\.controls\.is-collapsed[^{]*\.fold-fps/);
    assert.match(css, /@media[^{]+\{[\s\S]*\.controls\.is-collapsed \.sheet-body\s*\{[^}]*display:\s*flex/s);
  });
});
