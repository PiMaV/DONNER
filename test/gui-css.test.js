import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// IDs, order, show/hide, and a few phone-blank-canvas regressions — not pixel CSS.
// See architecture.md "Tests and visual QA".

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
  it("shows Floor X/Y/Z after place", () => {
    assert.match(css, /body\.is-ar\.is-ar-placed:not\(\.is-face-ar\) \.ar-stand/);
    assert.doesNotMatch(css, /body\.is-ar\s+\.ar-stand\s*\{[^}]*display:\s*none\s*!important/s);
  });

  it("keeps Floor markup for the overlay", () => {
    assert.match(html, /class="ar-stand"/);
    assert.match(html, /id="ar-stand-z"/);
    assert.match(html, />Floor</);
    assert.doesNotMatch(html, /id="ar-stand-flip"/);
    assert.doesNotMatch(html, /id="stack-flip-x"/);
    assert.doesNotMatch(html, /id="stack-flip-y"/);
    assert.doesNotMatch(html, /id="stack-flip-z"/);
    assert.match(css, /body\.is-ar \.inspect-transport \.btn-loop-run/);
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
    assert.match(html, /class="ar-pose-row"/);
    assert.match(html, /class="ar-pose-sliders"/);
    assert.match(css, /body\.is-ar\.is-ar-placed:not\(\.is-face-ar\) \.ar-pose-row/);
    assert.match(css, /body\.is-ar\.is-ar-placed:not\(\.is-face-ar\) \.ar-size/);
    assert.match(css, /body\.is-ar\.is-ar-placed:not\(\.is-face-ar\) \.ar-yaw/);
    assert.doesNotMatch(css, /body\.is-ar\.is-ar-placed\s+\.ar-height/);
  });

  it("hides the stack until the volume is placed, then shows rails and Loop", () => {
    assert.match(css, /body\.is-ar:not\(\.is-ar-placed\)\s+\.stack/);
    assert.doesNotMatch(css, /body\.is-ar\s+\.stack-axis:not\(\.is-z\)/);
    assert.match(css, /body\.is-ar\.is-ar-placed:not\(\.is-face-ar\) \.inspect-transport/);
  });

  it("parks Hull Ghost Cuts top-right after place, without a viewcube, Loop behind More", () => {
    assert.match(html, /class="look-strip"/);
    assert.match(html, /id="shade-hull"/);
    assert.match(html, /id="shade-ghost"/);
    assert.match(html, /id="shade-triple"/);
    assert.match(html, /id="btn-look-more"/);
    assert.doesNotMatch(html, /id="ar-shade-hull"/);
    assert.doesNotMatch(html, /class="ar-inspect-chrome"/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.gizmo-col|body\.is-ar\s+\.gizmo-col/);
    assert.match(css, /body\.is-ar\.is-ar-placed\s+\.look-more/);
    assert.match(css, /body\.is-ar \.look-fit/);
    assert.match(css, /body\.is-ar \.look-orbit/);
    assert.match(html, /id="btn-spin"/);
  });
});

describe("Face AR chrome", () => {
  it("puts AR / Face on the bottom dock; Face session uses a camera dropdown + Exit", () => {
    assert.match(html, /id="face-video"/);
    assert.match(html, /id="face-overlay"/);
    assert.match(html, /id="btn-ar"[^>]*>AR</);
    assert.match(html, /id="btn-face-ar"[^>]*>Face</);
    assert.match(html, /id="face-cam-pair"/);
    assert.match(html, /id="face-camera"/);
    assert.match(html, />Selfie camera</);
    assert.match(html, />Rear camera</);
    assert.doesNotMatch(html, /id="btn-face-front"/);
    assert.doesNotMatch(html, /id="btn-face-rear"/);
    assert.doesNotMatch(html, /Camera \d/);
    assert.doesNotMatch(html, /id="btn-face-ar-sheet"/);
    assert.doesNotMatch(html, /id="btn-face-facing"/);
    assert.doesNotMatch(html, /id="face-facing-pair"/);
    assert.doesNotMatch(html, /id="btn-face-selfie"/);
    assert.doesNotMatch(html, />Recapture</);
    assert.doesNotMatch(html, />Front</);
    assert.match(html, /id="ar-place-banner"/);
    assert.match(html, />Tap to place</);
    assert.match(css, /\.face-camera-select/);
    assert.match(css, /body\.is-face-ar \.ar-place-banner:not\(\[hidden\]\)/);
    assert.match(html, /class="face-calib"/);
    assert.match(css, /body\.is-face-ar \.btn-face-ar/);
    assert.match(css, /body\.is-face-ar \.face-video/);
    assert.match(css, /body\.is-face-ar \.face-overlay/);
    assert.match(css, /body\.is-face-ar \.face-calib/);
    assert.match(css, /body\.is-face-ar \.look-fit/);
    assert.match(css, /body\.is-face-ar \.look-spin/);
    assert.match(css, /body\.is-face-ar \.look-orbit/);
    assert.match(css, /body\.is-face-ar \.ar-yaw[\s\S]{0,80}display:\s*none\s*!important/);
    assert.match(css, /body\.is-ar\.is-face-ar \.stack/);
    assert.match(css, /body\.is-ar\.is-face-ar \.loop-axes/);
    assert.match(css, /body\.is-ar \.gizmo-fps/);
    assert.match(css, /body\.is-ar \.stack-rail/);
    assert.doesNotMatch(css, /body\.is-ar \.gizmo-fps\s*\{[^}]*display:\s*none/s);
  });
});

describe("desktop Source | View sheets", () => {
  it("lays out Source and View as one stacked accordion rail on desktop", () => {
    assert.match(css, /\.controls\.is-collapsed \.sheet-body/);
    assert.match(html, /id="btn-rail-source"/);
    assert.match(html, /id="btn-rail-view"/);
  });

  it("opens FPS / DEV Bench as a card from the viewcube overlay", () => {
    assert.match(html, /class="fold-meter"/);
    assert.match(html, /id="hud-fps"[^>]*class="[^"]*gizmo-fps/);
    assert.match(html, /class="hud-cards"[\s\S]*id="hud-engine"[\s\S]*id="bench"/);
    assert.match(html, /class="check hud-dev"/);
    assert.doesNotMatch(html, /id="view-fps"|id="hud-view-fps"/);
    assert.doesNotMatch(html, /id="panel-view"[\s\S]*id="hud-engine"/);
    assert.match(css, /body\.hud-bench-open \.hud-cards\s*\{[^}]*display:\s*flex/s);
    assert.match(css, /\.hud-cards\s*\{[^}]*display:\s*none/s);
    const collapsed = css.match(/\.controls\.is-collapsed \.sheet-body\s*\{[^}]*\}/)?.[0] || "";
    assert.match(collapsed, /display:\s*none/);
  });

  it("keeps Gap as a wide spinner beside the label, with no range slider", () => {
    assert.match(html, /id="voxel-gap-num"[^>]*class="[^"]*field-spin/);
    assert.match(html, /id="voxel-gap-field"[^>]*class="[^"]*field-inline/);
    assert.doesNotMatch(html, /id="voxel-gap"[^>]*type="range"/);
  });

  it("keeps footer M.E.S.S. and WETTER links", () => {
    assert.match(html, /href="https:\/\/mess\.engineering"[^>]*>M\.E\.S\.S\.</);
    assert.match(html, /href="https:\/\/wetter\.mess\.engineering"[^>]*>WETTER</);
  });

  it("hides Guide on coarse pointers and phone-width chrome", () => {
    assert.match(css, /@media\s*\(pointer:\s*coarse\)[\s\S]*?\.brand-guide\s*\{[^}]*display:\s*none/s);
    assert.match(
      css,
      /@media\s*\(max-width:\s*720px\),[\s\S]*\.brand-guide\s*\{[^}]*display:\s*none/s,
    );
  });
});

describe("LAN static headers", () => {
  it("disables cache for HTML/JS/CSS so phones pick up module edits", () => {
    const http = readFileSync(new URL("../scripts/serve-http.py", import.meta.url), "utf8");
    const https = readFileSync(new URL("../scripts/serve-https.py", import.meta.url), "utf8");
    assert.match(http, /Cache-Control.*no-store/);
    assert.match(https, /Cache-Control.*no-store/);
    assert.match(http, /camera=\(self\)/);
    assert.match(https, /camera=\(self\)/);
  });
});
