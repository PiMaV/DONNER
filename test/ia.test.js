import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DEFAULTS, clampDensity, GUIDE_STEPS, guideStepAt, isCountSourceKind, isStaticSourceKind, sourceGuide, startShadeFor } from "../src/config.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");

function sourcePanel() {
  const start = html.indexOf('id="panel-source"');
  const view = html.indexOf('id="panel-view"');
  assert.ok(start >= 0 && view > start);
  return html.slice(start, view);
}

function viewPanel() {
  const start = html.indexOf('id="panel-view"');
  const end = html.indexOf("</form>", start);
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function gizmoCol() {
  const start = html.indexOf('class="gizmo-col"');
  const cards = html.indexOf('class="hud-cards"');
  assert.ok(start >= 0 && cards > start);
  return html.slice(start, cards);
}

function hudCards() {
  const start = html.indexOf('class="hud-cards"');
  const time = html.indexOf('class="hud-time"');
  assert.ok(start >= 0 && time > start);
  return html.slice(start, time);
}

describe("Source | View information architecture", () => {
  it("has no Bench tab, Config tab, or Neighborhood control", () => {
    assert.doesNotMatch(html, /id="slot-bench"|id="sheet-bench"/);
    assert.doesNotMatch(html, /id="bench-preset"|id="bench-neighborhood"|id="bench-dynamics"/);
    assert.doesNotMatch(html, /Neighborhood|Config tab|btn-start/i);
    assert.match(html, /<input id="bench" type="checkbox"/);
    assert.match(html, />DEV Bench</);
    assert.equal(DEFAULTS.bench, false);
    assert.equal((html.match(/id="panel-view"/g) || []).length, 1);
    assert.equal((html.match(/id="panel-source"/g) || []).length, 1);
  });

  it("labels Color coding in View, not Dynamics", () => {
    const view = viewPanel();
    assert.match(view, />Color coding</);
    assert.match(view, /id="color-coding"/);
    assert.doesNotMatch(view, />Dynamics</);
    assert.match(html, /id="sheet-encoding"[^>]*>Color coding</);
    assert.match(view, /id="count-cmap"/);
    assert.match(view, /id="count-win-lo"/);
    assert.match(view, /id="count-win-hi"/);
    assert.match(view, /id="count-trim"/);
    assert.match(view, /id="count-hide"/);
    assert.match(view, /value="gray"/);
    assert.match(view, /value="inferno"/);
    assert.match(view, /value="plasma"/);
    assert.match(view, /value="turbo"/);
  });

  it("puts Conway Play/Speed in Source and View Loop/Speed under the rails", () => {
    const src = sourcePanel();
    const view = viewPanel();
    assert.match(src, /id="btn-play"/);
    assert.match(src, /id="speed"/);
    assert.match(src, /id="random-fill"/);
    const play = src.indexOf('id="btn-play"');
    const setup = src.indexOf('id="conway-setup"');
    const pattern = src.indexOf('id="pattern"');
    assert.ok(play >= 0 && setup > play);
    assert.ok(pattern > setup);
    assert.match(src, /id="btn-conway-setup"/);
    assert.match(src, /id="conway-setup"[^>]*\bhidden\b/);
    assert.doesNotMatch(view, /id="btn-play"/);
    assert.doesNotMatch(view, /id="btn-loop"/);
    assert.match(html, /id="inspect-transport"[\s\S]*id="btn-loop"/);
    assert.match(html, /id="inspect-transport"[\s\S]*id="loop-speed"/);
    assert.match(view, /id="cube-cap"/);
    assert.match(view, /id="cube-cap"[^>]*value="200000"/);
    assert.match(view, /id="cube-cap"[^>]*max="20000000"/);
    assert.match(view, /id="quality-low"/);
    assert.match(view, /id="quality-medium"/);
    assert.match(view, /id="quality-high"/);
    assert.match(view, /id="quality-medium"[^>]*is-on/);
    assert.doesNotMatch(view, /id="hud-fps"|id="view-fps"|id="hud-engine"|id="bench"/);
    assert.match(html, /id="hud-fps"[^>]*class="[^"]*gizmo-fps/);
    assert.match(html, /class="hud-cards"[\s\S]*id="hud-engine"[\s\S]*id="bench"/);
    assert.match(html, />DEV Bench</);
    assert.doesNotMatch(view, /id="shade-hull"/);
    assert.doesNotMatch(view, /id="btn-fit"/);
  });

  it("keeps the inspect hint short", () => {
    const m = html.match(/id="inspect-depth-note"[^>]*class="hint inspect-only"[^>]*>([^<]*)</);
    assert.ok(m);
    assert.ok(m[1].length < 80);
    assert.doesNotMatch(m[1], /AABB|fog/i);
  });

  it("keeps Source before View in the form and the phone fold bar", () => {
    const foldSource = html.indexOf("btn-fold-source");
    const foldView = html.indexOf("btn-fold-view");
    const railSource = html.indexOf("btn-rail-source");
    const railView = html.indexOf("btn-rail-view");
    const panelSource = html.indexOf('id="panel-source"');
    const panelView = html.indexOf('id="panel-view"');
    assert.ok(foldSource > 0 && foldSource < foldView);
    assert.ok(railSource > 0 && railSource < railView);
    assert.ok(panelSource > 0 && panelSource < panelView);
  });

  it("puts Conway Play next to AR on phone and keeps Loop on the overlay", () => {
    assert.match(html, /id="transport"[\s\S]*id="btn-ar"[\s\S]*id="btn-face-ar"[\s\S]*id="btn-play-dock"/);
    assert.doesNotMatch(html, /id="btn-play-ar"/);
    assert.match(html, /id="inspect-transport"[\s\S]*id="btn-loop"/);
    assert.match(html, /class="fold-bar-center"/);
    assert.match(html, /id="boot-fail"/);
    assert.match(html, /import\("\.\/src\/main\.js\?v=/);
    assert.match(css, /body\.is-ar:not\(\.source-count\)\s+\.btn-play-dock/);
    assert.match(css, /body\.is-ar\.is-look-more \.look-more-panel \.inspect-transport/);
  });

  it("shows Conway GEN/LIVE/RATE only in a Play overlay, not in Source", () => {
    const src = sourcePanel();
    assert.doesNotMatch(src, /id="hud-src"/);
    assert.doesNotMatch(src, /id="conway-live"/);
    assert.match(html, /id="conway-live"/);
    assert.match(css, /body\.is-ar \.conway-live/);
    assert.doesNotMatch(viewPanel(), /id="conway-live"/);
  });
});

describe("View sheet vs gizmo chrome", () => {
  it("keeps Hide center and Hide outer under the viewcube only", () => {
    const gizmo = gizmoCol();
    const view = viewPanel();
    assert.match(gizmo, /id="btn-hide-center"/);
    assert.match(gizmo, /id="btn-hide-outer"/);
    assert.match(html, /id="btn-hide-center"[^>]*aria-pressed="true"/);
    assert.match(html, /id="btn-hide-outer"[^>]*aria-pressed="true"/);
    assert.doesNotMatch(view, /id="hide-center"|id="hide-outer"|id="btn-hide-center"|id="btn-hide-outer"/);
    assert.doesNotMatch(view, />Hide center</);
    assert.doesNotMatch(view, />Hide outer</);
  });

  it("puts Hull Ghost Cuts and Fit on the look strip, not in View setup", () => {
    const gizmo = gizmoCol();
    const view = viewPanel();
    assert.match(gizmo, /class="look-strip"/);
    assert.match(gizmo, /id="shade-hull"/);
    assert.match(gizmo, /id="shade-ghost"/);
    assert.match(gizmo, /id="shade-triple"/);
    assert.match(gizmo, /id="btn-fit"/);
    assert.match(gizmo, /id="btn-look-more"/);
    assert.match(gizmo, /id="look-quality-medium"/);
    assert.match(gizmo, /id="btn-look-reset-planes"/);
    assert.doesNotMatch(view, /id="shade-hull"|id="shade-ghost"|id="shade-triple"/);
    assert.doesNotMatch(view, /id="btn-fit"/);
    assert.doesNotMatch(html, /id="ar-shade-hull"/);
  });

  it("puts FPS on the viewcube and the bench card outside View", () => {
    const gizmo = gizmoCol();
    const cards = hudCards();
    const view = viewPanel();
    assert.match(gizmo, /id="hud-fps"/);
    assert.match(gizmo, /class="gizmo-fps"/);
    assert.match(cards, /id="hud-engine"/);
    assert.match(cards, /id="hud-spark"/);
    assert.match(cards, /id="bench"/);
    assert.doesNotMatch(gizmo, /id="hud-engine"/);
    assert.doesNotMatch(view, /id="hud-engine"|id="bench"|id="hud-fps"/);
  });

  it("has no Decay control and no Size-by-count", () => {
    const view = viewPanel();
    assert.doesNotMatch(html, /id="decay"/);
    assert.doesNotMatch(view, /Decay/);
    assert.doesNotMatch(html, /id="stab-scale"/);
    assert.doesNotMatch(html, /Stability scaling/);
    assert.doesNotMatch(html, /id="count-size"/);
    assert.doesNotMatch(html, /Size by count/);
  });

  it("shows Size by age for Conway and hides it for count / MNI", () => {
    const view = viewPanel();
    assert.match(view, /id="stab-size"/);
    assert.match(view, />Size by age</);
    assert.match(view, /id="stab-start"/);
    assert.match(view, /id="stab-tail"/);
    assert.doesNotMatch(view, /id="stab-mode"/);
    assert.doesNotMatch(view, />\s*Focus\s*</);
    assert.doesNotMatch(html, /id="btn-extent"/);
    assert.match(css, /body\.source-count \.encoding-conway\s*\{[^}]*display:\s*none/s);
    assert.equal(DEFAULTS.stabSize, true);
    assert.equal(isCountSourceKind("mni152"), true);
    assert.equal(isCountSourceKind("mni152-low"), true);
    assert.equal(isCountSourceKind("ignition"), true);
    assert.equal(isCountSourceKind("conway"), false);
    assert.equal(isCountSourceKind("npy"), false);
  });
});

describe("desktop accordion rail", () => {
  it("stacks Source and View as one collapsible rail", () => {
    assert.match(html, /id="btn-rail-source"/);
    assert.match(html, /id="btn-rail-view"/);
    assert.match(html, /id="source-body"/);
    assert.match(html, /id="view-body"/);
    assert.match(css, /\.controls\.is-collapsed \.sheet-body\s*\{[^}]*display:\s*none/s);
    const root = css.match(/\.controls-root\s*\{[^}]+\}/)?.[0] || "";
    assert.match(root, /flex-direction:\s*column/);
    assert.doesNotMatch(root, /flex-direction:\s*row/);
  });
});

describe("Random fill and static sources", () => {
  it("clamps fill to the Source slider range", () => {
    assert.equal(clampDensity(DEFAULTS.density), DEFAULTS.density);
    assert.equal(clampDensity(0), DEFAULTS.densityMin);
    assert.equal(clampDensity(1), DEFAULTS.densityMax);
    assert.equal(isStaticSourceKind("mni152"), true);
    assert.equal(isStaticSourceKind("mni152-low"), true);
    assert.equal(isStaticSourceKind("conway"), false);
    assert.equal(isStaticSourceKind("ignition"), false);
  });
});

describe("desktop loop, load, and live-ingest chrome", () => {
  it("has no Now control on the Z stack", () => {
    assert.doesNotMatch(html, /id="btn-stack-now"/);
    assert.doesNotMatch(html, />Now</);
    assert.match(html, /id="stack-axis-z"[\s\S]*class="stack-axis-label">Z</);
  });

  it("picks the loop axis under the slice rails (default Z)", () => {
    const src = sourcePanel();
    assert.doesNotMatch(src, /id="loop-axis-x"/);
    assert.match(html, /class="loop-axes"[\s\S]*id="loop-axis-x"/);
    assert.match(html, /id="loop-axis-y"/);
    assert.match(html, /id="loop-axis-z"/);
    assert.match(html, /aria-label="Loop axis"/);
    assert.match(html, /id="loop-axis-z"[^>]*aria-pressed="true"/);
    assert.equal(DEFAULTS.loopAxis, "z");
    assert.doesNotMatch(html, /id="loop-axis-x"[^>]*aria-pressed="true"/);
  });

  it("puts Load NumPy in the Source list and keeps Streamer hidden", () => {
    assert.match(html, /<option value="count" hidden>/);
    assert.match(html, /id="source-count"[^>]*\bhidden\b/);
    assert.match(css, /body\.source-count #source-count\s*\{[^}]*display:\s*none/s);
    assert.match(html, /id="count-file"/);
    assert.match(html, /id="wolke-url"/);
    assert.match(html, /id="btn-wolke-connect"/);
    assert.match(html, /id="drop-overlay"/);
    assert.match(html, /id="ingest-dialog"/);
    assert.match(html, /id="ingest-reduce"/);
    assert.match(html, /id="ingest-preview"/);
    assert.match(html, /id="ingest-preview-frame"/);
    assert.match(css, /dialog\.ingest-dialog:not\(:open\)\s*\{[^}]*display:\s*none\s*!important/s);
    assert.match(css, /\.ingest-preview\s*\{[^}]*width:\s*100%/s);
    assert.doesNotMatch(html, /id="ingest-chip"/);
    assert.doesNotMatch(html, /id="ingest-open"/);
    const src = sourcePanel();
    assert.doesNotMatch(src, /Drop \.npy/);
    assert.doesNotMatch(src, /id="drop-overlay"/);
    assert.match(src, /<option value="mni152-low"[^>]*selected[^>]*>Brain MRI Low</);
    assert.match(src, /<option value="mni152">Brain MRI High</);
    assert.match(src, /<option value="ignition">Lighter Ignition</);
    assert.match(src, /<option value="conway">Game of Life</);
    assert.match(src, /<option value="npy">Load NumPy</);
    assert.doesNotMatch(src, /id="source-welcome"/);
    assert.match(src, /id="source-blurb"/);
    assert.match(html, /id="btn-rail-source"[\s\S]*id="btn-about"/);
    assert.match(html, />About Data</);
    assert.match(html, /id="about-dialog"/);
    assert.match(html, /id="btn-about-legal"/);
  });

  it("shows a Loading indicator on the Source fold and canvas", () => {
    assert.match(html, /id="load-overlay"/);
    assert.match(html, /id="source-load"/);
    assert.match(html, /class="load-spin"/);
    assert.match(css, /body\.is-loading \.load-overlay/);
    assert.match(css, /body\.is-loading \.source-load/);
    assert.match(css, /@keyframes load-spin/);
  });

  it("keeps View Loop under the rails for MNI (static volumes slice-scan)", () => {
    assert.doesNotMatch(css, /body\.source-static \.inspect-transport/);
    assert.match(sourcePanel(), /id="btn-play"/);
    assert.match(html, /id="inspect-transport"[\s\S]*id="btn-loop"/);
    assert.match(html, /id="inspect-transport"[\s\S]*id="loop-speed"/);
  });

  it("uses visitor Source labels and About copy", () => {
    assert.equal(sourceGuide("conway").label, "Game of Life");
    assert.equal(sourceGuide("ignition").label, "Lighter Ignition");
    assert.equal(sourceGuide("mni152").label, "Brain MRI High");
    assert.equal(sourceGuide("mni152-low").label, "Brain MRI Low");
    assert.equal(startShadeFor("conway"), "hull");
    assert.equal(startShadeFor("mni152-low"), "ghost");
    assert.equal(startShadeFor("mni152"), "ghost");
    assert.equal(startShadeFor("ignition"), "ghost");
    assert.equal(startShadeFor("count"), "ghost");
    assert.equal(DEFAULTS.sourceKind, "mni152-low");
    assert.equal(DEFAULTS.shadeMode, "ghost");
    assert.equal(DEFAULTS.hideCenter, true);
    assert.equal(DEFAULTS.hideOuter, true);
    assert.doesNotMatch(html, /id="source-welcome"/);
    assert.match(html, />Game of Life</);
    assert.match(html, />Lighter Ignition</);
    assert.match(html, />Brain MRI Low</);
    assert.match(html, />Brain MRI High</);
    assert.match(html, />Load NumPy</);
    assert.match(html, />About Data</);
    assert.match(html, /id="about-dialog"/);
    assert.match(html, /\?src=ignition/);
    assert.match(css, /\.about-dialog/);
    assert.match(css, /button\.btn-link\.source-about-data\s*\{[^}]*font-size:\s*0\.5rem/s);
  });

  it("offers an opt-in Guide beside the brand chip", () => {
    assert.equal(GUIDE_STEPS.length, 7);
    assert.deepEqual(
      GUIDE_STEPS.map((s) => s.title),
      ["Orbit", "Source", "Play vs Loop", "Rails", "Viewcube", "Inspect", "Look"],
    );
    assert.deepEqual(GUIDE_STEPS[0].targets, ["view"]);
    assert.deepEqual(GUIDE_STEPS[1].targets, ["source-kind"]);
    assert.deepEqual(GUIDE_STEPS[2].targets, ["btn-play", "btn-loop"]);
    assert.deepEqual(GUIDE_STEPS[3].targets, ["stack-axis-z", "loop-axis-z"]);
    assert.deepEqual(GUIDE_STEPS[4].targets, ["gizmo-hit", "btn-hide-center", "btn-hide-outer"]);
    assert.deepEqual(GUIDE_STEPS[5].targets, ["shade-hull", "shade-ghost", "shade-triple"]);
    assert.deepEqual(GUIDE_STEPS[6].targets, ["quality-medium", "btn-parallax", "btn-reset-planes"]);
    assert.equal(GUIDE_STEPS[1].fold, "source");
    assert.match(GUIDE_STEPS[1].body, /Load NumPy/);
    assert.equal(GUIDE_STEPS[3].fold, "");
    assert.equal(GUIDE_STEPS[5].fold, "");
    assert.equal(GUIDE_STEPS[6].fold, "view");
    assert.match(GUIDE_STEPS[6].body, /Quality → Low/);
    const first = guideStepAt(0);
    assert.equal(first.isFirst, true);
    assert.equal(first.isLast, false);
    assert.equal(first.title, "Orbit");
    assert.deepEqual(first.targets, ["view"]);
    const last = guideStepAt(99);
    assert.equal(last.index, 6);
    assert.equal(last.isLast, true);
    assert.equal(guideStepAt(-1).index, 0);
    assert.match(html, /class="brand-cluster"/);
    assert.match(html, /<\/header>\s*<button[^>]*id="btn-guide"/);
    const brand = html.match(/<header class="brand">[\s\S]*?<\/header>/)?.[0] || "";
    assert.doesNotMatch(brand, /id="btn-guide"/);
    assert.match(html, /id="guide-overlay"/);
    assert.doesNotMatch(html, /id="guide-dialog"/);
    assert.match(html, /id="btn-guide-next"/);
    assert.match(html, /id="btn-guide-back"/);
    assert.match(html, /id="btn-guide-done"/);
    assert.match(css, /\.brand-cluster/);
    assert.match(css, /\.brand-cluster\s*\{[^}]*max-width:\s*var\(--rail-w\)/s);
    assert.match(html, /class="tagline">Xplore Data in 3D/);
    assert.match(css, /\.brand-guide/);
    assert.match(css, /\.guide-overlay/);
    assert.match(css, /\.inner-fold/);
    assert.match(css, /\.conway-setup\[hidden\]/);
    assert.match(css, /body\.is-ar \.guide-overlay/);
  });
});
