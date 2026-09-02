import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DEFAULTS, clampDensity, isCountSourceKind, isStaticSourceKind } from "../src/config.js";

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

describe("Source | View information architecture", () => {
  it("has no Bench tab, Config tab, or Neighborhood control", () => {
    assert.doesNotMatch(html, /id="slot-bench"|id="sheet-bench"|Bench/);
    assert.doesNotMatch(html, /id="bench-preset"|id="bench-neighborhood"|id="bench-dynamics"/);
    assert.doesNotMatch(html, /Neighborhood|Config tab|btn-start/i);
    assert.equal((html.match(/id="panel-view"/g) || []).length, 1);
    assert.equal((html.match(/id="panel-source"/g) || []).length, 1);
  });

  it("labels Color coding in View, not Dynamics", () => {
    const view = viewPanel();
    assert.match(view, />Color coding</);
    assert.match(view, /id="color-coding"/);
    assert.doesNotMatch(view, />Dynamics</);
    assert.match(html, /id="sheet-encoding"[^>]*>Color coding</);
  });

  it("puts Play and Random fill in Source, cube cap in View", () => {
    const src = sourcePanel();
    const view = viewPanel();
    assert.match(src, /id="btn-play"/);
    assert.match(src, /id="random-fill"/);
    assert.match(src, />Fill /);
    assert.doesNotMatch(view, /id="btn-play"/);
    assert.match(view, /id="cube-cap"/);
    assert.match(view, /id="view-fps"/);
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

  it("keeps AR overlay Play separate from the Source transport", () => {
    assert.match(html, /id="btn-play-ar"/);
    assert.match(css, /body\.is-ar:not\(\.is-ar-placed\)\s+\.btn-play/);
  });

  it("puts source stats in the Source fold, not a second HUD card", () => {
    const src = sourcePanel();
    assert.match(src, /id="hud-src"/);
    assert.match(src, /class="hud-stats source-stats"/);
    assert.doesNotMatch(html, /class="hud-source"/);
    assert.doesNotMatch(viewPanel(), /id="hud-src"/);
  });
});

describe("View sheet vs gizmo chrome", () => {
  it("keeps Hide center and Hide outer under the viewcube only", () => {
    const gizmo = gizmoCol();
    const view = viewPanel();
    assert.match(gizmo, /id="btn-hide-center"/);
    assert.match(gizmo, /id="btn-hide-outer"/);
    assert.doesNotMatch(view, /id="hide-center"|id="hide-outer"|id="btn-hide-center"|id="btn-hide-outer"/);
    assert.doesNotMatch(view, />Hide center</);
    assert.doesNotMatch(view, />Hide outer</);
  });

  it("has no Decay control and no Stability scaling checkbox", () => {
    const view = viewPanel();
    assert.doesNotMatch(html, /id="decay"/);
    assert.doesNotMatch(view, /Decay/);
    assert.doesNotMatch(html, /id="stab-scale"/);
    assert.doesNotMatch(html, /Stability scaling/);
    assert.doesNotMatch(html, /id="count-size"/);
    assert.doesNotMatch(html, /Size by count/);
  });

  it("shows Stability color options for Conway and hides them for count / MNI", () => {
    const view = viewPanel();
    assert.match(view, /class="field encoding-conway"/);
    assert.match(view, /id="stab-mode"/);
    assert.match(view, />\s*None\s*</);
    assert.match(view, />\s*Time\s*</);
    assert.match(view, />\s*Focus\s*</);
    assert.match(css, /body\.source-count \.encoding-conway\s*\{[^}]*display:\s*none/s);
    assert.equal(isCountSourceKind("mni152"), true);
    assert.equal(isCountSourceKind("ignition"), true);
    assert.equal(isCountSourceKind("conway"), false);
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
    assert.equal(isStaticSourceKind("conway"), false);
    assert.equal(isStaticSourceKind("ignition"), false);
  });
});
