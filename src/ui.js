import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS, STAB_START_MAX, STAB_START_MIN, STAB_START_STEP, STAB_TAIL_MAX, STAB_TAIL_MIN, VOXEL_GAP_MAX, VOXEL_GAP_MIN, VOXEL_GAP_STEP, clampCubeCap, clampDensity, clampStabStart, clampStabTail, clampVoxelGap, guideStepAt, isCountSourceKind, isStaticSourceKind, sourceGuide } from "./config.js";
import { normalizeViewQuality } from "./quality.js";
import { countCmapCss, DEFAULT_COUNT_CMAP, DEFAULT_COUNT_TRIM, grayToCmapRgba, normalizeCountCmap, normalizeCountTrim } from "./encoding.js";
import { formatCacheStatus } from "./spacetime.js";
import { clampSlab, playheadCrossesMid, playheadMidBack, stackThumbFrac, stackTickMarks } from "./axes.js";
import { landscapePreview } from "./volume-prep.js";
import { arOverlaySelectShouldGuard } from "./xr.js";

const PATTERN_HINT = {
  Blinker:
    "Blinker (read this first): gold core stays on. Cyan tips flash every other generation — empty = dead, not a missing color.",
  Toad: "Toad: period-2 oscillator, two rows. Watch cyan occupancy flip along Z (time), not XY motion.",
  Beacon: "Beacon: period-2. Two blocks trade a corner; gold cores, cyan flicker.",
  Glider:
    "Glider: occupancy looks gold/cyan on cells the ship crosses. Translating tubes are not a separate class.",
  "R-pentomino": "R-pentomino: long chaotic unsettled, then stills/oscillators lock in place.",
  "Gosper gun": "Gosper gun needs grid ≥ 48. Gliders peel off as occupancy trails.",
  Random: "Random soup: violet unsettled until islands lock. Fill sets occupancy (sparse ↔ dense).",
};

function $(id) {
  return document.getElementById(id);
}

function fillSelect(el, values, selected) {
  el.replaceChildren();
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    if (String(v) === String(selected)) opt.selected = true;
    el.appendChild(opt);
  }
}

function bindAxisRail(axis, { on, narrow }) {
  const stack = $(`stack-slider-${axis}`);
  const stackTrack = $(`stack-track-${axis}`);
  const stackSlab = $(`stack-slab-${axis}`);
  const zFocus = $(`z-focus-${axis}`);
  const zClipNear = $(`z-clip-near-${axis}`);
  const zClipFar = $(`z-clip-far-${axis}`);
  const stackBot = $(`stack-bot-${axis}`);
  const stackTicks = $(`stack-ticks-${axis}`);
  const stackThumbTime = $(`stack-thumb-time-${axis}`);
  const axisEl = $(`stack-axis-${axis}`);
  if (!stack || !stackTrack) return null;
  let tickMax = -1;
  let clipNearBack = 0;
  let clipFarBack = 0;
  let stackDrag = null;
  let midLatch = false;
  let midLatchPos = 0;
  const MID_LATCH_PX = 12;

  const goldOn = () => document.body.classList.contains("is-inspect");

  const layoutStack = () => {
    const max = Number(stack.max) || 0;
    const foc = Number(stack.value) || 0;
    const nf = stackThumbFrac(clipNearBack, max);
    const ff = stackThumbFrac(clipFarBack, max);
    const pf = stackThumbFrac(foc, max);
    zClipNear.style.setProperty("--frac", nf.toFixed(4));
    zClipFar.style.setProperty("--frac", ff.toFixed(4));
    zFocus.style.setProperty("--frac", pf.toFixed(4));
    stackSlab.style.setProperty("--near", nf.toFixed(4));
    stackSlab.style.setProperty("--far", ff.toFixed(4));
    stackThumbTime.style.setProperty("--frac", pf.toFixed(4));
  };

  const commitSlab = (top, foc, bot, dragged = "focus") => {
    const max = Number(stack.max) || 0;
    const slab = clampSlab(top, foc, bot, max, dragged);
    clipNearBack = slab.topBack;
    clipFarBack = slab.botBack;
    stack.value = String(slab.focusBack);
    layoutStack();
    on.slab?.({
      axis,
      near: clipNearBack,
      focus: slab.focusBack,
      far: clipFarBack,
      dragged,
    });
  };

  const backFromPointer = (e) => {
    const r = stackTrack.getBoundingClientRect();
    const max = Number(stack.max) || 0;
    const frac = narrow.matches
      ? 1 - (e.clientX - r.left) / Math.max(1, r.width)
      : (e.clientY - r.top) / Math.max(1, r.height);
    return Math.round(Math.min(1, Math.max(0, frac)) * max);
  };

  const handlePad = window.matchMedia("(pointer: coarse)").matches ? 22 : 12;
  const handleKindAt = (e) => {
    const x = e.clientX;
    const y = e.clientY;
    const hits = [];
    const consider = (el, kind) => {
      if (!el || el.disabled) return;
      if (kind !== "focus" && !goldOn()) return;
      const r = el.getBoundingClientRect();
      if (
        x < r.left - handlePad ||
        x > r.right + handlePad ||
        y < r.top - handlePad ||
        y > r.bottom + handlePad
      ) {
        return;
      }
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;
      hits.push({ kind, d: (x - cx) ** 2 + (y - cy) ** 2 });
    };
    consider(zFocus, "focus");
    if (goldOn()) {
      consider(zClipNear, "near");
      consider(zClipFar, "far");
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.d - b.d);
    return hits[0].kind;
  };

  const kindFromPointer = (e) => {
    if (stack.disabled) return null;
    const fromHandle = handleKindAt(e);
    if (fromHandle) return fromHandle;
    if (!goldOn()) return "focus";
    const back = backFromPointer(e);
    const foc = Number(stack.value) || 0;
    const dN = Math.abs(back - clipNearBack);
    const dF = Math.abs(back - foc);
    const dB = Math.abs(back - clipFarBack);
    const nearest = Math.min(dN, dF, dB);
    if (nearest === dF) return "focus";
    if (nearest === dN) return "near";
    return "far";
  };

  const pointerAlong = (e) => (narrow.matches ? e.clientX : e.clientY);

  const snapFocus = (back, ptr) => {
    const max = Number(stack.max) || 0;
    if (max < 2) return back;
    const prev = Number(stack.value) || 0;
    const mid = playheadMidBack(max);
    if (!midLatch && playheadCrossesMid(prev, back, max)) {
      midLatch = true;
      midLatchPos = ptr != null ? pointerAlong(ptr) : midLatchPos;
      return mid;
    }
    if (midLatch) {
      const pos = ptr != null ? pointerAlong(ptr) : midLatchPos;
      if (Math.abs(pos - midLatchPos) < MID_LATCH_PX) return mid;
      midLatch = false;
    }
    return back;
  };

  const applyDrag = (kind, back, ptr) => {
    const foc = Number(stack.value) || 0;
    const next = kind === "focus" ? snapFocus(back, ptr) : back;
    if (kind === "near") commitSlab(next, foc, clipFarBack, "near");
    else if (kind === "far") commitSlab(clipNearBack, foc, next, "far");
    else commitSlab(clipNearBack, next, clipFarBack, "focus");
  };

  stackTrack.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    const kind = kindFromPointer(e);
    if (!kind) return;
    e.preventDefault();
    stackDrag = kind;
    midLatch = false;
    on.activeAxis?.(axis);
    on.slabHold?.(true);
    stackTrack.setPointerCapture(e.pointerId);
    applyDrag(kind, backFromPointer(e), e);
  });
  stackTrack.addEventListener("pointermove", (e) => {
    if (!stackDrag) return;
    applyDrag(stackDrag, backFromPointer(e), e);
  });
  const endDrag = () => {
    if (!stackDrag) return;
    stackDrag = null;
    on.slabHold?.(false);
  };
  stackTrack.addEventListener("pointerup", endDrag);
  stackTrack.addEventListener("pointercancel", endDrag);
  stackTrack.addEventListener("lostpointercapture", endDrag);
  stackTrack.addEventListener(
    "wheel",
    (e) => {
      if (stack.disabled) return;
      e.preventDefault();
      on.activeAxis?.(axis);
      const dir = Math.sign(e.deltaY) || 1;
      const foc = Number(stack.value) || 0;
      const raw = foc + dir;
      const max = Number(stack.max) || 0;
      const next =
        playheadCrossesMid(foc, raw, max) && raw !== playheadMidBack(max)
          ? playheadMidBack(max)
          : raw;
      midLatch = false;
      applyDrag("focus", next);
    },
    { passive: false },
  );
  const nudgeHandle = (kind, dir) => {
    const foc = Number(stack.value) || 0;
    on.activeAxis?.(axis);
    if (kind === "near") applyDrag("near", clipNearBack + dir);
    else if (kind === "far") applyDrag("far", clipFarBack + dir);
    else applyDrag("focus", foc + dir);
  };
  const bindHandleKeys = (el, kind) => {
    el.addEventListener("keydown", (e) => {
      let dir = 0;
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") dir = 1;
      else if (e.key === "ArrowUp" || e.key === "ArrowRight") dir = -1;
      if (!dir) return;
      e.preventDefault();
      nudgeHandle(kind, dir);
    });
  };
  bindHandleKeys(zFocus, "focus");
  bindHandleKeys(zClipNear, "near");
  bindHandleKeys(zClipFar, "far");

  const syncOrient = () => {
    const horizontal = narrow.matches;
    stack.setAttribute("aria-orientation", horizontal ? "horizontal" : "vertical");
    if (horizontal) stack.removeAttribute("orient");
    else stack.setAttribute("orient", "vertical");
  };
  syncOrient();
  narrow.addEventListener("change", syncOrient);

  return {
    get() {
      return {
        focusBack: Number.parseInt(stack.value, 10) || 0,
        clipNearBack,
        clipFarBack,
      };
    },
    set({
      back = 0,
      maxBack = 0,
      label = 0,
      oldest = 0,
      live = false,
      near = 0,
      far = maxBack,
      active = false,
    }) {
      const max = live ? 0 : Math.max(0, maxBack);
      stack.max = String(max);
      stack.disabled = Boolean(live);
      zFocus.disabled = Boolean(live);
      zClipNear.disabled = Boolean(live);
      zClipFar.disabled = Boolean(live);
      const slab = live
        ? { topBack: 0, focusBack: 0, botBack: 0 }
        : clampSlab(near, back, far, max);
      clipNearBack = slab.topBack;
      clipFarBack = slab.botBack;
      stack.value = String(live ? 0 : slab.focusBack);
      stackBot.textContent = live ? "LIVE" : String(oldest);
      if (max !== tickMax) {
        tickMax = max;
        const frag = document.createDocumentFragment();
        for (const mark of stackTickMarks(max)) {
          const el = document.createElement("span");
          el.className = mark.major ? "stack-tick is-major" : "stack-tick";
          if (mark.mid) el.classList.add("is-mid");
          el.style.setProperty("--frac", mark.frac.toFixed(4));
          frag.appendChild(el);
        }
        stackTicks.replaceChildren(frag);
      }
      stackThumbTime.textContent = String(label);
      if (axisEl) axisEl.classList.toggle("is-active", Boolean(active));
      layoutStack();
    },
  };
}

export function bindUI(on) {
  const playBtn = $("btn-play");
  const playDock = $("btn-play-dock");
  const loopBtn = $("btn-loop");
  const arBtn = $("btn-ar");
  const xrExit = $("btn-xr-exit");
  const arReset = $("btn-ar-reset");
  const arMag = $("ar-mag");
  const stepBtn = $("btn-step");
  const resetBtn = $("btn-reset");
  const randBtn = $("btn-random");
  const editBtn = $("btn-edit");
  const parallaxBtn = $("btn-parallax");
  const fitBtn = $("btn-fit");
  const resetPlanesBtn = $("btn-reset-planes");
  const alignZ = $("align-z");
  const arYaw = $("ar-yaw");
  const arStandBtns = ["x", "y", "z"].map((axis) => $(`ar-stand-${axis}`));
  const shadeHull = $("shade-hull");
  const shadeGhost = $("shade-ghost");
  const shadeTriple = $("shade-triple");
  const arShadeHull = $("ar-shade-hull");
  const arShadeGhost = $("ar-shade-ghost");
  const arShadeTriple = $("ar-shade-triple");
  const qualityLow = $("quality-low");
  const qualityMedium = $("quality-medium");
  const qualityHigh = $("quality-high");
  const cubeCap = $("cube-cap");
  const fpsChip = $("hud-fps");
  const viewFps = $("view-fps");
  const hudViewFps = $("hud-view-fps");
  const bench = $("bench");
  const viewBench = $("view-bench");
  const hudViewFold = $("btn-hud-view");
  const pattern = $("pattern");
  const seed = $("seed");
  const speed = $("speed");
  const speedVal = $("speed-val");
  const loopSpeed = $("loop-speed");
  const loopSpeedVal = $("loop-speed-val");
  const cacheStatus = $("cache-status");
  const history = $("history");
  const historyVal = $("history-val");
  const voxelGap = $("voxel-gap");
  const voxelGapVal = $("voxel-gap-val");
  const btnHideCenter = $("btn-hide-center");
  const btnHideOuter = $("btn-hide-outer");
  const loopAxisBtns = ["x", "y", "z"].map((axis) => $(`loop-axis-${axis}`));
  const sourceLoad = $("source-load");
  const sourceLoadLabel = $("source-load-label");
  const loadOverlay = $("load-overlay");
  const conwayLive = $("conway-live");
  const narrow = window.matchMedia("(max-width: 720px)");
  const rails = {
    x: bindAxisRail("x", { on, narrow }),
    y: bindAxisRail("y", { on, narrow }),
    z: bindAxisRail("z", { on, narrow }),
  };
  let arSupported = false;
  const grid = $("grid");
  const wrap = $("wrap");
  const stopStable = $("stop-stable");
  const stabSize = $("stab-size");
  const stabRamp = $("stab-ramp");
  const stabStart = $("stab-start");
  const stabStartVal = $("stab-start-val");
  const stabTail = $("stab-tail");
  const stabTailVal = $("stab-tail-val");
  const readHint = $("read-hint");
  const foldView = $("btn-fold-view");
  const foldSource = $("btn-fold-source");
  const railView = $("btn-rail-view");
  const railSource = $("btn-rail-source");
  const panelView = $("panel-view");
  const panelSource = $("panel-source");
  const hint = $("hint");
  const sourceKind = $("source-kind");
  const sourceBlurb = $("source-blurb");
  const sourceCite = $("source-cite");
  const aboutDialog = $("about-dialog");
  const aboutBtns = ["btn-about", "btn-about-legal"].map((id) => $(id));
  const guideOverlay = $("guide-overlay");
  const guideCard = $("guide-card");
  const guideArrows = $("guide-arrows");
  const guideBtn = $("btn-guide");
  const guideStepLabel = $("guide-step-label");
  const guideStepTitle = $("guide-step-title");
  const guideStepBody = $("guide-step-body");
  const guideBack = $("btn-guide-back");
  const guideNext = $("btn-guide-next");
  const guideDone = $("btn-guide-done");
  const foldBar = document.querySelector(".fold-bar");
  let guideIndex = 0;
  let guideOpen = false;
  const guideSpots = [];
  const countFile = $("count-file");
  const dropOverlay = $("drop-overlay");
  const ingestDialog = $("ingest-dialog");
  const ingestFileName = $("ingest-file");
  const ingestMetaLine = $("ingest-meta");
  const ingestWarn = $("ingest-warn");
  const ingestBins = $("ingest-bins");
  const ingestBinList = $("ingest-bin-list");
  const ingestReduce = $("ingest-reduce");
  const ingestPreviewWrap = $("ingest-preview-wrap");
  const ingestPreview = $("ingest-preview");
  const ingestPreviewCap = $("ingest-preview-cap");
  const ingestLoad = $("ingest-load");
  const ingestCancel = $("ingest-cancel");
  const dismissIngest = () => {
    if (ingestPreviewWrap) ingestPreviewWrap.hidden = true;
    ingestDialog?.classList.remove("has-preview");
    if (ingestDialog?.open) ingestDialog.close();
  };
  const countMeta = $("count-meta");
  const countHint = $("count-hint");
  const wolkeUrl = $("wolke-url");
  const wolkeToken = $("wolke-token");
  const wolkeConnect = $("btn-wolke-connect");
  const wolkeStatus = $("wolke-status");
  const countLegLo = $("count-leg-lo");
  const countLegMid = $("count-leg-mid");
  const countLegHi = $("count-leg-hi");
  const countCmap = $("count-cmap");
  const countCmapBar = $("count-cmap-bar");
  const countWinLo = $("count-win-lo");
  const countWinHi = $("count-win-hi");
  const countTrim = $("count-trim");
  const countHide = $("count-hide");
  const countHideVal = $("count-hide-val");
  const dyn = $("color-coding");
  const fill = $("random-fill");
  const fillVal = $("random-fill-val");
  let applying = false;

  fillSelect(pattern, PATTERN_NAMES, DEFAULTS.pattern);
  grid.replaceChildren();
  for (const n of GRID_PRESETS) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = `${n}×${n}`;
    if (n === DEFAULTS.width) opt.selected = true;
    grid.appendChild(opt);
  }

  seed.value = String(DEFAULTS.seed);
  speed.value = String(DEFAULTS.gensPerSec);
  if (loopSpeed) loopSpeed.value = String(DEFAULTS.loopPerSec);
  history.value = String(DEFAULTS.history);
  if (voxelGap) {
    voxelGap.min = String(VOXEL_GAP_MIN);
    voxelGap.max = String(VOXEL_GAP_MAX);
    voxelGap.step = String(VOXEL_GAP_STEP);
    voxelGap.value = String(DEFAULTS.voxelGap);
  }
  wrap.checked = DEFAULTS.wrap;
  if (stopStable) stopStable.checked = DEFAULTS.stopWhenStable;
  if (stabSize) stabSize.checked = DEFAULTS.stabSize;
  if (stabStart) {
    stabStart.min = String(STAB_START_MIN);
    stabStart.max = String(STAB_START_MAX);
    stabStart.step = String(STAB_START_STEP);
    stabStart.value = String(DEFAULTS.stabStart);
  }
  if (stabTail) {
    stabTail.min = String(STAB_TAIL_MIN);
    stabTail.max = String(STAB_TAIL_MAX);
    stabTail.step = "1";
    stabTail.value = String(DEFAULTS.stabTail);
  }
  if (dyn) dyn.checked = DEFAULTS.dynamics;
  if (countCmap) countCmap.value = DEFAULTS.countCmap || DEFAULT_COUNT_CMAP;
  if (countCmapBar) countCmapBar.style.background = countCmapCss(countCmap ? countCmap.value : DEFAULT_COUNT_CMAP);
  if (countTrim) countTrim.value = String(DEFAULTS.countTrim ?? DEFAULT_COUNT_TRIM);
  if (countHide) countHide.value = String(DEFAULTS.countHide || 0);
  if (fill) {
    fill.min = String(DEFAULTS.densityMin);
    fill.max = String(DEFAULTS.densityMax);
    fill.step = String(DEFAULTS.densityStep);
    fill.value = String(DEFAULTS.density);
  }
  if (alignZ) alignZ.checked = DEFAULTS.alignZ;
  if (cubeCap) {
    cubeCap.min = String(DEFAULTS.cubeCapMin);
    cubeCap.max = String(DEFAULTS.cubeCapMax);
    cubeCap.value = String(DEFAULTS.maxInstances);
  }
  if (bench) bench.checked = DEFAULTS.bench;
  if (sourceKind) sourceKind.value = DEFAULTS.sourceKind;
  let lastSourceKind = sourceKind ? sourceKind.value : DEFAULTS.sourceKind;
  const syncSourceCopy = () => {
    const g = sourceGuide(sourceKind ? sourceKind.value : DEFAULTS.sourceKind);
    if (sourceBlurb) sourceBlurb.textContent = g.blurb;
    if (sourceCite) {
      sourceCite.textContent = g.cite || "";
      sourceCite.hidden = !g.cite;
    }
  };
  syncSourceCopy();
  if (wolkeUrl) wolkeUrl.value = DEFAULTS.wolkeUrl;
  if (wolkeToken) wolkeToken.value = DEFAULTS.wolkeToken;
  document.body.classList.toggle("source-count", isCountSourceKind(DEFAULTS.sourceKind));
  document.body.classList.toggle("source-static", isStaticSourceKind(DEFAULTS.sourceKind));
  const syncStabRamp = () => {
    const on = Boolean(stabSize?.checked);
    if (stabRamp) stabRamp.hidden = !on;
  };
  const syncReadHint = () => {
    readHint.textContent =
      PATTERN_HINT[pattern.value] || PATTERN_HINT.Blinker;
  };
  const syncFillVisibility = () => {
    document.body.classList.toggle("pattern-random", pattern.value === "Random");
  };
  syncStabRamp();
  syncReadHint();
  syncFillVisibility();

  const syncLabels = () => {
    speedVal.textContent = `${speed.value}/s`;
    if (loopSpeedVal && loopSpeed) loopSpeedVal.textContent = `${loopSpeed.value}/s`;
    historyVal.textContent = history.value;
    if (voxelGapVal && voxelGap) {
      const g = Number(voxelGap.value);
      voxelGapVal.textContent = !Number.isFinite(g) || g === 0 ? "0" : g.toFixed(2);
    }
    if (stabStartVal && stabStart) {
      const s = clampStabStart(stabStart.value);
      stabStartVal.textContent = s.toFixed(2);
    }
    if (stabTailVal && stabTail) {
      stabTailVal.textContent = String(clampStabTail(stabTail.value));
    }
    if (fillVal && fill) {
      const d = clampDensity(fill.value);
      fillVal.textContent = `${Math.round(d * 100)}%`;
    }
    if (countHideVal && countHide) {
      countHideVal.textContent = String(Math.max(0, countHide.value | 0));
    }
  };
  syncLabels();

  playBtn?.addEventListener("click", () => on.togglePlay());
  playDock?.addEventListener("click", () => on.togglePlay());
  loopBtn?.addEventListener("click", () => on.toggleLoop?.());
  if (arBtn && on.enterAr) arBtn.addEventListener("click", () => on.enterAr());
  if (xrExit && on.exitAr) xrExit.addEventListener("click", () => on.exitAr());
  if (arReset && on.resetArAnchor) arReset.addEventListener("click", () => on.resetArAnchor());
  const xrOverlay = $("xr-overlay");
  xrOverlay?.addEventListener(
    "pointerdown",
    (e) => {
      if (!document.body.classList.contains("is-ar")) return;
      if (arOverlaySelectShouldGuard(e.target, xrOverlay)) on.guardArOverlaySelect?.();
    },
    true,
  );
  if (arMag && on.arMag) arMag.addEventListener("input", () => on.arMag());
  stepBtn.addEventListener("click", () => on.step());
  resetBtn.addEventListener("click", () => on.reset());
  editBtn.addEventListener("click", () => on.toggleEdit());
  parallaxBtn?.addEventListener("click", () => on.toggleParallax());
  fitBtn?.addEventListener("click", () => on.fitVolume());
  resetPlanesBtn?.addEventListener("click", () => on.resetPlanes?.());
  alignZ?.addEventListener("change", () => on.alignZ?.());
  arYaw?.addEventListener("input", (e) => {
    if (applying) return;
    on.yaw?.(Number(e.target.value) || 0);
  });
  for (const btn of arStandBtns) {
    btn?.addEventListener("click", () => on.arStand?.(btn.dataset.axis));
  }
  const syncShadeButtons = (mode) => {
    const m = mode === "ghost" || mode === "triple" ? mode : "hull";
    const map = [
      [shadeHull, "hull"],
      [shadeGhost, "ghost"],
      [shadeTriple, "triple"],
      [arShadeHull, "hull"],
      [arShadeGhost, "ghost"],
      [arShadeTriple, "triple"],
    ];
    for (const [el, id] of map) {
      if (!el) continue;
      const onBtn = id === m;
      el.classList.toggle("is-on", onBtn);
      el.setAttribute("aria-pressed", onBtn ? "true" : "false");
    }
  };
  shadeHull?.addEventListener("click", () => on.shade?.("hull"));
  shadeGhost?.addEventListener("click", () => on.shade?.("ghost"));
  shadeTriple?.addEventListener("click", () => on.shade?.("triple"));
  arShadeHull?.addEventListener("click", () => on.shade?.("hull"));
  arShadeGhost?.addEventListener("click", () => on.shade?.("ghost"));
  arShadeTriple?.addEventListener("click", () => on.shade?.("triple"));
  syncShadeButtons(DEFAULTS.shadeMode);
  const syncQualityButtons = (id) => {
    const q = normalizeViewQuality(id);
    const map = [
      [qualityLow, "low"],
      [qualityMedium, "medium"],
      [qualityHigh, "high"],
    ];
    for (const [el, name] of map) {
      if (!el) continue;
      const onBtn = name === q;
      el.classList.toggle("is-on", onBtn);
      el.setAttribute("aria-pressed", onBtn ? "true" : "false");
    }
  };
  qualityLow?.addEventListener("click", () => on.viewQuality?.("low"));
  qualityMedium?.addEventListener("click", () => on.viewQuality?.("medium"));
  qualityHigh?.addEventListener("click", () => on.viewQuality?.("high"));
  syncQualityButtons(DEFAULTS.viewQuality);
  cubeCap?.addEventListener("change", () => {
    if (applying) return;
    cubeCap.value = String(clampCubeCap(cubeCap.value));
    on.cubeCap?.();
  });
  bench?.addEventListener("change", () => {
    if (applying) return;
    on.bench?.();
  });
  randBtn.addEventListener("click", () => {
    seed.value = String((Math.random() * 0x7fffffff) | 0);
    on.reset();
  });
  pattern.addEventListener("change", () => {
    if (applying) return;
    syncReadHint();
    syncFillVisibility();
    on.reset();
  });
  seed.addEventListener("change", () => {
    if (applying) return;
    on.reset();
  });
  grid.addEventListener("change", () => {
    if (applying) return;
    on.rebuild();
  });
  fill?.addEventListener("input", () => {
    syncLabels();
  });
  fill?.addEventListener("change", () => {
    if (applying) return;
    fill.value = String(clampDensity(fill.value));
    syncLabels();
    on.reset();
  });
  wrap.addEventListener("change", () => {
    if (applying) return;
    on.reset();
  });
  stabSize?.addEventListener("change", () => {
    syncStabRamp();
    on.stabMode?.();
  });
  stabStart?.addEventListener("input", () => {
    syncLabels();
    on.stabMode?.();
  });
  stabTail?.addEventListener("input", () => {
    syncLabels();
    on.stabMode?.();
  });
  speed.addEventListener("input", () => {
    syncLabels();
    on.speed();
  });
  loopSpeed?.addEventListener("input", () => {
    syncLabels();
    on.loopSpeed?.();
  });
  history.addEventListener("input", () => {
    syncLabels();
    on.history();
  });
  voxelGap?.addEventListener("input", () => {
    syncLabels();
    on.voxelGap?.();
  });
  countCmap?.addEventListener("change", () => {
    if (countCmapBar) countCmapBar.style.background = countCmapCss(countCmap.value);
    on.countCmap?.();
  });
  countTrim?.addEventListener("change", () => {
    if (applying) return;
    on.countTrim?.();
  });
  countWinLo?.addEventListener("change", () => {
    if (applying) return;
    on.countWindow?.();
  });
  countWinHi?.addEventListener("change", () => {
    if (applying) return;
    on.countWindow?.();
  });
  countHide?.addEventListener("input", () => {
    syncLabels();
    if (applying) return;
    on.countHide?.(false);
  });
  countHide?.addEventListener("change", () => {
    syncLabels();
    if (applying) return;
    on.countHide?.(true);
  });
  const hidePressed = (btn) => btn?.getAttribute("aria-pressed") === "true";
  const syncPlaneChrome = () => {
    const hc = hidePressed(btnHideCenter);
    const ho = hidePressed(btnHideOuter);
    if (btnHideCenter) btnHideCenter.classList.toggle("is-on", hc);
    if (btnHideOuter) btnHideOuter.classList.toggle("is-on", ho);
  };
  const onPlaneChrome = () => {
    syncPlaneChrome();
    on.planeChrome?.();
  };
  btnHideCenter?.addEventListener("click", () => {
    const next = !hidePressed(btnHideCenter);
    btnHideCenter.setAttribute("aria-pressed", next ? "true" : "false");
    onPlaneChrome();
  });
  btnHideOuter?.addEventListener("click", () => {
    const next = !hidePressed(btnHideOuter);
    btnHideOuter.setAttribute("aria-pressed", next ? "true" : "false");
    onPlaneChrome();
  });
  syncPlaneChrome();
  const onViewFlag = () => {
    if (applying) return;
    on.viewFlags?.();
  };
  dyn?.addEventListener("change", onViewFlag);
  sourceKind?.addEventListener("change", () => {
    if (applying) return;
    if (sourceKind.value === "npy") {
      sourceKind.value = lastSourceKind;
      countFile?.click();
      return;
    }
    lastSourceKind = sourceKind.value;
    syncSourceCopy();
    on.sourceKind?.();
  });
  const openAbout = () => {
    guideOverlay?.dismiss?.();
    dismissIngest();
    on.ingestCancel?.();
    if (typeof aboutDialog?.showModal === "function") aboutDialog.showModal();
  };
  for (const btn of aboutBtns) {
    btn?.addEventListener("click", openAbout);
  }
  countFile?.addEventListener("change", () => {
    const file = countFile.files && countFile.files[0];
    countFile.value = "";
    if (file) on.countFile?.(file);
  });
  const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
  let dragDepth = 0;
  const showDrop = (on) => {
    if (!dropOverlay) return;
    dropOverlay.hidden = !on;
  };
  window.addEventListener("dragenter", (e) => {
    if (document.body.classList.contains("is-ar")) return;
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth += 1;
    showDrop(true);
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showDrop(false);
  });
  window.addEventListener("dragover", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!document.body.classList.contains("is-ar")) showDrop(true);
  });
  window.addEventListener("drop", (e) => {
    dragDepth = 0;
    showDrop(false);
    if (document.body.classList.contains("is-ar")) return;
    if (!isFileDrag(e)) return;
    e.preventDefault();
    const file = e.dataTransfer?.files && e.dataTransfer.files[0];
    if (file) on.countFile?.(file);
  });
  ingestCancel?.addEventListener("click", () => {
    dismissIngest();
    on.ingestCancel?.();
  });
  const ingestPicks = () => {
    const picked = ingestBinList?.querySelector("input[name='ingest-factor']:checked");
    const factor = Number.parseInt(picked && picked.value, 10);
    const reduce = ingestReduce?.querySelector("input[name='ingest-reduce']:checked")?.value;
    return { factor, reduce };
  };
  const emitIngestPreview = () => {
    const picks = ingestPicks();
    if (ingestReduce) ingestReduce.hidden = !picks.factor || picks.factor === 1 || Boolean(ingestBins?.hidden);
    on.ingestPreview?.(picks);
  };
  ingestLoad?.addEventListener("click", () => {
    on.ingestConfirm?.(ingestPicks());
  });
  ingestReduce?.addEventListener("change", emitIngestPreview);
  ingestDialog?.addEventListener("cancel", () => {
    dismissIngest();
    on.ingestCancel?.();
  });
  wolkeConnect?.addEventListener("click", () => on.wolkeConnect?.());
  for (const btn of loopAxisBtns) {
    btn?.addEventListener("click", () => on.loopAxis?.(btn.dataset.axis));
  }
  const setFold = (which) => {
    const viewOpen = which === "view";
    const sourceOpen = which === "source";
    panelView.classList.toggle("is-open", viewOpen);
    panelSource.classList.toggle("is-open", sourceOpen);
    foldView.setAttribute("aria-expanded", viewOpen ? "true" : "false");
    foldSource.setAttribute("aria-expanded", sourceOpen ? "true" : "false");
    foldView.textContent = viewOpen ? "View ▾" : "View ▸";
    foldSource.textContent = sourceOpen ? "Source ▾" : "Source ▸";
  };
  foldView.addEventListener("click", () => {
    setFold(panelView.classList.contains("is-open") ? "" : "view");
  });
  foldSource.addEventListener("click", () => {
    setFold(panelSource.classList.contains("is-open") ? "" : "source");
  });
  const syncRailFold = (panel, btn, name) => {
    if (!panel || !btn) return;
    const collapsed = panel.classList.contains("is-collapsed");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.textContent = collapsed ? `${name} ▸` : `${name} ▾`;
    btn.title = collapsed ? `Expand ${name}` : `Collapse ${name}`;
  };
  const syncRailFolds = () => {
    syncRailFold(panelSource, railSource, "Source");
    syncRailFold(panelView, railView, "View");
  };
  const onRailFold = (panel) => {
    if (narrow.matches) return;
    panel.classList.toggle("is-collapsed");
    syncRailFolds();
  };
  railSource?.addEventListener("click", () => onRailFold(panelSource));
  railView?.addEventListener("click", () => onRailFold(panelView));
  syncRailFolds();
  const conwaySetupBtn = $("btn-conway-setup");
  const conwaySetup = $("conway-setup");
  const syncConwaySetup = () => {
    if (!conwaySetupBtn || !conwaySetup) return;
    const open = !conwaySetup.hidden;
    conwaySetupBtn.setAttribute("aria-expanded", open ? "true" : "false");
    conwaySetupBtn.textContent = open ? "Setup ▾" : "Setup ▸";
    conwaySetupBtn.title = open ? "Collapse Setup" : "Expand Setup";
  };
  conwaySetupBtn?.addEventListener("click", () => {
    if (!conwaySetup) return;
    conwaySetup.hidden = !conwaySetup.hidden;
    syncConwaySetup();
  });
  syncConwaySetup();
  fpsChip?.addEventListener("click", () => {
    const open = document.body.classList.toggle("hud-view-open");
    fpsChip.setAttribute("aria-expanded", open ? "true" : "false");
  });
  const syncHudViewFold = () => {
    if (!hudViewFold) return;
    const collapsed = document.body.classList.contains("hud-view-collapsed");
    hudViewFold.setAttribute("aria-expanded", collapsed ? "false" : "true");
    hudViewFold.textContent = collapsed ? "View ▸" : "View ▾";
    hudViewFold.title = collapsed ? "Expand the View card" : "Collapse the View card";
  };
  hudViewFold?.addEventListener("click", () => {
    document.body.classList.toggle("hud-view-collapsed");
    syncHudViewFold();
  });
  syncHudViewFold();

  const phoneFolds = () => Boolean(foldBar) && getComputedStyle(foldBar).display !== "none";
  const clearGuideSpots = () => {
    for (const el of guideSpots) el.classList.remove("guide-spot");
    guideSpots.length = 0;
  };
  const expandGuideFolds = (fold) => {
    panelSource?.classList.remove("is-collapsed");
    panelView?.classList.remove("is-collapsed");
    syncRailFolds();
    document.body.classList.remove("hud-view-collapsed");
    syncHudViewFold();
    if (phoneFolds()) setFold(fold || "");
  };
  const visibleRect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    return r;
  };
  const clampGuide = (n, a, b) => Math.min(b, Math.max(a, n));
  const edgePoint = (rect, towardX, towardY) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = towardX - cx;
    const dy = towardY - cy;
    if (Math.abs(dx) > Math.abs(dy)) {
      return {
        x: dx > 0 ? rect.right : rect.left,
        y: clampGuide(towardY, rect.top + 6, rect.bottom - 6),
      };
    }
    return {
      x: clampGuide(towardX, rect.left + 6, rect.right - 6),
      y: dy > 0 ? rect.bottom : rect.top,
    };
  };
  const drawGuideArrow = (from, to) => {
    if (!guideArrows) return;
    const ns = "http://www.w3.org/2000/svg";
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.setAttribute("stroke", "#ffc53d");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 11;
    const p1x = to.x - size * Math.cos(angle - Math.PI / 6);
    const p1y = to.y - size * Math.sin(angle - Math.PI / 6);
    const p2x = to.x - size * Math.cos(angle + Math.PI / 6);
    const p2y = to.y - size * Math.sin(angle + Math.PI / 6);
    const head = document.createElementNS(ns, "polygon");
    head.setAttribute("points", `${to.x},${to.y} ${p1x},${p1y} ${p2x},${p2y}`);
    head.setAttribute("fill", "#ffc53d");
    guideArrows.append(line, head);
  };
  const layoutGuide = () => {
    if (!guideOpen || !guideCard || !guideArrows) return;
    clearGuideSpots();
    const step = guideStepAt(guideIndex);
    const targets = [];
    for (const id of step.targets) {
      const el = $(id);
      const rect = visibleRect(el);
      if (!rect) continue;
      if (id !== "view") {
        el.classList.add("guide-spot");
        guideSpots.push(el);
      }
      targets.push({ id, rect });
    }
    const pad = 12;
    const cw = guideCard.offsetWidth || 260;
    const ch = guideCard.offsetHeight || 160;
    const cluster = document.querySelector(".brand-cluster")?.getBoundingClientRect();
    let left;
    let top;
    if (!targets.length || targets[0].id === "view") {
      left = cluster ? cluster.right + 12 : pad;
      top = cluster ? cluster.top : pad;
      if (left + cw > innerWidth - pad) {
        left = cluster ? cluster.left : pad;
        top = cluster ? cluster.bottom + 14 : pad;
      }
    } else {
      const t = targets[0].rect;
      left = t.right + 18;
      top = t.top;
      if (left + cw > innerWidth - pad) left = t.left - cw - 18;
      if (left < pad) left = pad;
    }
    if (top + ch > innerHeight - pad) top = innerHeight - ch - pad;
    if (top < pad) top = pad;
    guideCard.style.left = `${Math.round(left)}px`;
    guideCard.style.top = `${Math.round(top)}px`;
    const cardRect = guideCard.getBoundingClientRect();
    const cardCx = cardRect.left + cardRect.width / 2;
    const cardCy = cardRect.top + cardRect.height / 2;
    guideArrows.replaceChildren();
    guideArrows.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
    guideArrows.setAttribute("width", String(innerWidth));
    guideArrows.setAttribute("height", String(innerHeight));
    for (const t of targets) {
      const to =
        t.id === "view"
          ? { x: t.rect.left + t.rect.width * 0.48, y: t.rect.top + t.rect.height * 0.52 }
          : edgePoint(t.rect, cardCx, cardCy);
      const from = edgePoint(cardRect, to.x, to.y);
      drawGuideArrow(from, to);
    }
  };
  const renderGuide = () => {
    const step = guideStepAt(guideIndex);
    guideIndex = step.index;
    if (guideStepLabel) guideStepLabel.textContent = `${step.index + 1} / ${step.total}`;
    if (guideStepTitle) guideStepTitle.textContent = step.title;
    if (guideStepBody) guideStepBody.textContent = step.body;
    if (guideBack) guideBack.disabled = step.isFirst;
    if (guideNext) guideNext.hidden = step.isLast;
    if (guideDone) guideDone.hidden = !step.isLast;
    expandGuideFolds(step.fold);
    requestAnimationFrame(() => requestAnimationFrame(layoutGuide));
  };
  const closeGuide = () => {
    if (!guideOpen && guideOverlay?.hidden) return;
    guideOpen = false;
    document.body.classList.remove("is-guide");
    if (guideOverlay) guideOverlay.hidden = true;
    guideBtn?.setAttribute("aria-expanded", "false");
    clearGuideSpots();
    guideArrows?.replaceChildren();
  };
  const openGuide = () => {
    if (guideOpen) {
      closeGuide();
      return;
    }
    aboutDialog?.close?.();
    dismissIngest();
    on.ingestCancel?.();
    guideOpen = true;
    guideIndex = 0;
    document.body.classList.add("is-guide");
    if (guideOverlay) guideOverlay.hidden = false;
    guideBtn?.setAttribute("aria-expanded", "true");
    renderGuide();
  };
  if (guideOverlay) guideOverlay.dismiss = closeGuide;
  guideBtn?.addEventListener("click", openGuide);
  guideBack?.addEventListener("click", () => {
    if (!guideOpen) return;
    guideIndex -= 1;
    renderGuide();
  });
  guideNext?.addEventListener("click", () => {
    if (!guideOpen) return;
    guideIndex += 1;
    renderGuide();
  });
  guideDone?.addEventListener("click", closeGuide);
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !guideOpen) return;
    e.preventDefault();
    closeGuide();
  });
  window.addEventListener("resize", () => {
    if (guideOpen) layoutGuide();
  });
  panelSource?.addEventListener("scroll", () => {
    if (guideOpen) layoutGuide();
  });
  panelView?.addEventListener("scroll", () => {
    if (guideOpen) layoutGuide();
  });
  document.querySelector(".controls-root")?.addEventListener("scroll", () => {
    if (guideOpen) layoutGuide();
  });

  return {
    getConfig() {
      const parsed = Number.parseInt(grid.value, 10);
      const g = GRID_PRESETS.includes(parsed) ? parsed : DEFAULTS.width;
      return {
        pattern: pattern.value || DEFAULTS.pattern,
        seed: Number.parseInt(seed.value, 10) || 0,
        gensPerSec: Number(speed.value) || DEFAULTS.gensPerSec,
        loopPerSec: loopSpeed ? Number(loopSpeed.value) || DEFAULTS.loopPerSec : DEFAULTS.loopPerSec,
        decay: DEFAULTS.decay,
        history: Number.parseInt(history.value, 10) || DEFAULTS.history,
        voxelGap: voxelGap ? clampVoxelGap(voxelGap.value) : DEFAULTS.voxelGap,
        hideCenter: hidePressed(btnHideCenter),
        hideOuter: hidePressed(btnHideOuter),
        shadeMode: shadeGhost?.classList.contains("is-on")
          ? "ghost"
          : shadeTriple?.classList.contains("is-on")
            ? "triple"
            : "hull",
        viewQuality: qualityLow?.classList.contains("is-on")
          ? "low"
          : qualityMedium?.classList.contains("is-on")
            ? "medium"
            : "high",
        slabs: {
          x: rails.x?.get() || { focusBack: 0, clipNearBack: 0, clipFarBack: 0 },
          y: rails.y?.get() || { focusBack: 0, clipNearBack: 0, clipFarBack: 0 },
          z: rails.z?.get() || { focusBack: 0, clipNearBack: 0, clipFarBack: 0 },
        },
        width: g,
        height: g,
        wrap: wrap.checked,
        stopWhenStable: stopStable ? stopStable.checked : DEFAULTS.stopWhenStable,
        stabMode: stabSize?.checked ? "time" : "none",
        stabStart: stabStart ? clampStabStart(stabStart.value) : DEFAULTS.stabStart,
        stabTail: stabTail ? clampStabTail(stabTail.value) : DEFAULTS.stabTail,
        dynamics: dyn ? dyn.checked : DEFAULTS.dynamics,
        density: fill ? clampDensity(fill.value) : DEFAULTS.density,
        encodingMinimal: DEFAULTS.encodingMinimal,
        countCmap: countCmap ? normalizeCountCmap(countCmap.value) : DEFAULT_COUNT_CMAP,
        countTrim: countTrim ? normalizeCountTrim(countTrim.value) : DEFAULT_COUNT_TRIM,
        countWinLo: countWinLo ? Number(countWinLo.value) : 1,
        countWinHi: countWinHi ? Number(countWinHi.value) : 1,
        countHide: countHide ? Math.max(0, countHide.value | 0) : 0,
        forceFullRebuild: DEFAULTS.forceFullRebuild,
        sourceKind: sourceKind && sourceKind.value !== "npy" ? sourceKind.value : DEFAULTS.sourceKind,
        countSize: false,
        wolkeUrl: wolkeUrl ? wolkeUrl.value : DEFAULTS.wolkeUrl,
        wolkeToken: wolkeToken ? wolkeToken.value : DEFAULTS.wolkeToken,
        alignZ: alignZ ? alignZ.checked : DEFAULTS.alignZ,
        maxInstances: cubeCap ? clampCubeCap(cubeCap.value) : DEFAULTS.maxInstances,
        bench: bench ? bench.checked : DEFAULTS.bench,
      };
    },
    setPlaying(playing) {
      const live = Boolean(playing);
      document.body.classList.toggle("is-live", live);
      if (conwayLive) conwayLive.hidden = !live || document.body.classList.contains("source-count");
      if (loopBtn) loopBtn.disabled = live && !document.body.classList.contains("source-count");
      for (const btn of [playBtn, playDock]) {
        if (!btn) continue;
        btn.textContent = live ? "Pause" : "Play";
        btn.setAttribute("aria-pressed", live ? "true" : "false");
        btn.classList.toggle("is-live", live);
      }
    },
    setLooping(on) {
      const live = Boolean(on);
      if (!loopBtn) return;
      loopBtn.textContent = live ? "Pause" : "Loop";
      loopBtn.setAttribute("aria-pressed", live ? "true" : "false");
      loopBtn.classList.toggle("is-live", live);
    },
    setDecay() {},
    setPlaneChrome({ hideCenter: hc = false, hideOuter: ho = false } = {}) {
      if (btnHideCenter) btnHideCenter.setAttribute("aria-pressed", hc ? "true" : "false");
      if (btnHideOuter) btnHideOuter.setAttribute("aria-pressed", ho ? "true" : "false");
      syncPlaneChrome();
    },
    setArAvailable(ok) {
      arSupported = Boolean(ok);
      if (arBtn) arBtn.hidden = !arSupported || document.body.classList.contains("is-ar");
    },
    setArActive(active, { locked = false } = {}) {
      if (xrExit) xrExit.hidden = !active;
      if (arReset) {
        arReset.hidden = !active || !locked;
        arReset.disabled = !locked;
      }
      if (arBtn) arBtn.hidden = !arSupported || active;
    },
    getArMag() {
      return arMag ? Number(arMag.value) : 1;
    },
    getYawDegrees() {
      return arYaw ? Number(arYaw.value) || 0 : 0;
    },
    setYawDegrees(deg) {
      const d = ((Number(deg) % 360) + 360) % 360;
      applying = true;
      if (arYaw) arYaw.value = String(Math.round(d));
      applying = false;
    },
    setArYawEnabled(on) {
      if (arYaw) arYaw.disabled = !on;
    },
    setArStandAxis(axis) {
      const a = axis === "x" || axis === "y" ? axis : "z";
      for (const btn of arStandBtns) {
        if (!btn) continue;
        const onBtn = btn.dataset.axis === a;
        btn.classList.toggle("is-on", onBtn);
        btn.setAttribute("aria-pressed", onBtn ? "true" : "false");
      }
    },
    setEditing(editing) {
      editBtn.classList.toggle("is-on", editing);
      editBtn.setAttribute("aria-pressed", editing ? "true" : "false");
    },
    setParallax(on) {
      if (!parallaxBtn) return;
      parallaxBtn.classList.toggle("is-on", on);
      parallaxBtn.setAttribute("aria-pressed", on ? "true" : "false");
    },
    setShade(mode) {
      syncShadeButtons(mode);
    },
    setQuality(id) {
      syncQualityButtons(id);
    },
    setActiveAxis(axis) {
      const a = axis === "x" || axis === "y" ? axis : "z";
      for (const id of ["x", "y", "z"]) {
        const el = $(`stack-axis-${id}`);
        el?.classList.toggle("is-active", id === a);
      }
    },
    setLoopAxis(axis) {
      const a = axis === "x" || axis === "y" ? axis : "z";
      for (const btn of loopAxisBtns) {
        if (!btn) continue;
        const onBtn = btn.dataset.axis === a;
        btn.classList.toggle("is-on", onBtn);
        btn.setAttribute("aria-pressed", onBtn ? "true" : "false");
      }
      for (const id of ["x", "y", "z"]) {
        $(`stack-axis-${id}`)?.classList.toggle("is-loop", id === a);
      }
    },
    setLoading(on, label = "Loading…") {
      const busy = Boolean(on);
      document.body.classList.toggle("is-loading", busy);
      if (sourceLoad) sourceLoad.hidden = !busy;
      if (loadOverlay) loadOverlay.hidden = !busy;
      if (sourceLoadLabel && label) sourceLoadLabel.textContent = label;
      const overlayLabel = loadOverlay?.querySelector(".load-overlay-label");
      if (overlayLabel && label) overlayLabel.textContent = label;
    },
    setFps(fps) {
      const text = `${Number(fps).toFixed(0)} FPS`;
      if (fpsChip) fpsChip.textContent = text;
      if (viewFps) viewFps.textContent = text;
      if (hudViewFps) hudViewFps.textContent = text;
    },
    setBenchHud(text) {
      if (!viewBench) return;
      const on = Boolean(text);
      viewBench.hidden = !on;
      if (on) viewBench.textContent = text;
    },
    setSlabs({ activeAxis = "z", x, y, z }) {
      const a = activeAxis === "x" || activeAxis === "y" ? activeAxis : "z";
      if (x) rails.x?.set({ ...x, active: a === "x" });
      if (y) rails.y?.set({ ...y, active: a === "y" });
      if (z) rails.z?.set({ ...z, active: a === "z" });
    },
    setCache({ gens, events, full, inspect, atNow = true, tick = "gen", source = "conway" }) {
      cacheStatus.textContent = formatCacheStatus({
        gens,
        events,
        full,
        tapeMode: Boolean(inspect),
        tick,
      });
      const count = source === "count";
      editBtn.disabled = count || (Boolean(inspect) && !atNow);
      stepBtn.disabled = count ? false : Boolean(inspect);
      document.body.classList.toggle("is-inspect", Boolean(inspect));
    },
    setSourceKind(kind) {
      const k = isCountSourceKind(kind) ? kind : "conway";
      const countOpt = sourceKind?.querySelector('option[value="count"]');
      if (countOpt && k === "count") countOpt.hidden = false;
      if (sourceKind) sourceKind.value = k;
      lastSourceKind = k;
      document.body.classList.toggle("source-count", isCountSourceKind(k));
      document.body.classList.toggle("source-static", isStaticSourceKind(k));
      if (conwayLive && isCountSourceKind(k)) conwayLive.hidden = true;
      for (const btn of [playBtn, playDock]) {
        if (btn && !btn.classList.contains("is-live")) btn.textContent = "Play";
      }
      if (loopBtn) loopBtn.disabled = false;
      syncFillVisibility();
      syncSourceCopy();
    },
    setCountMeta(text) {
      if (countMeta) countMeta.textContent = text || "";
    },
    setCountHint(text) {
      if (countHint) countHint.textContent = text;
    },
    setCubeCap(n) {
      const cap = clampCubeCap(n);
      if (!cubeCap) return cap;
      applying = true;
      cubeCap.value = String(cap);
      applying = false;
      return cap;
    },
    openIngest(model) {
      const spec = model || {};
      if (ingestFileName) ingestFileName.textContent = spec.name || "";
      if (ingestMetaLine) {
        ingestMetaLine.textContent = spec.canLoad || spec.shapeLine
          ? `${spec.shapeLine} · ${spec.dtype} · ${spec.payload} payload · ${spec.cells} cells · ${spec.axesNote}`
          : "";
      }
      if (ingestWarn) ingestWarn.textContent = spec.warn || "";
      if (ingestWarn) {
        ingestWarn.classList.toggle("is-soft", spec.warnKind === "soft");
        ingestWarn.classList.toggle("is-hard", spec.warnKind === "hard");
      }
      const meanRadio = ingestReduce?.querySelector('input[name="ingest-reduce"][value="mean"]');
      if (meanRadio) meanRadio.checked = true;
      if (ingestPreviewWrap) ingestPreviewWrap.hidden = true;
      const paintIngestWarn = (opt) => {
        if (!ingestWarn || !opt) return;
        ingestWarn.textContent = opt.warn || spec.warn || "";
        ingestWarn.classList.toggle("is-soft", opt.warnKind === "soft");
        ingestWarn.classList.toggle("is-hard", opt.warnKind === "hard");
      };
      if (ingestBinList) {
        ingestBinList.replaceChildren();
        for (const opt of spec.options || []) {
          const lab = document.createElement("label");
          lab.className = "ingest-bin-opt";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "ingest-factor";
          input.value = String(opt.factor);
          input.disabled = !opt.ok;
          input.dataset.cells = String(opt.cells || 0);
          if (opt.ok && opt.factor === spec.suggested) input.checked = true;
          const span = document.createElement("span");
          span.textContent = opt.label;
          lab.append(input, span);
          ingestBinList.append(lab);
          input.addEventListener("change", () => {
            if (!input.checked) return;
            paintIngestWarn(opt);
            emitIngestPreview();
          });
        }
        if (!ingestBinList.querySelector("input:checked")) {
          const firstOk = ingestBinList.querySelector("input:not(:disabled)");
          if (firstOk) firstOk.checked = true;
        }
        const chosen = (spec.options || []).find((o) => o.ok && o.factor === spec.suggested)
          || (spec.options || []).find((o) => o.ok);
        paintIngestWarn(chosen);
      }
      if (ingestBins) ingestBins.hidden = !spec.canLoad;
      if (ingestReduce) ingestReduce.hidden = !spec.canLoad;
      if (ingestLoad) ingestLoad.disabled = !spec.canLoad;
      aboutDialog?.close?.();
      guideOverlay?.dismiss?.();
      if (typeof ingestDialog?.showModal === "function" && !ingestDialog.open) ingestDialog.showModal();
      if (spec.canLoad) emitIngestPreview();
      else if (ingestPreviewWrap) ingestPreviewWrap.hidden = true;
    },
    closeIngest() {
      dismissIngest();
    },
    setIngestPreview(shot) {
      if (!ingestPreview || !ingestPreviewWrap) return;
      if (!shot || !shot.width || !shot.height || !shot.gray || !ingestDialog?.open) {
        ingestPreviewWrap.hidden = true;
        return;
      }
      const view = landscapePreview(shot);
      ingestPreview.width = view.width;
      ingestPreview.height = view.height;
      const ctx = ingestPreview.getContext("2d");
      if (!ctx) {
        ingestPreviewWrap.hidden = true;
        return;
      }
      const img = ctx.createImageData(view.width, view.height);
      img.data.set(grayToCmapRgba(view.gray, "plasma"));
      ctx.putImageData(img, 0, 0);
      ingestPreview.style.width = "100%";
      ingestPreview.style.height = "auto";
      ingestPreviewWrap.hidden = false;
      if (ingestPreviewCap) {
        const base = view.frames > 1
          ? `First output plane (${view.frames} source frames)`
          : "First plane";
        ingestPreviewCap.textContent = view.rotated ? `${base} · rotated 90° to fit` : base;
      }
    },
    setWolkeConnected(on) {
      if (!wolkeConnect) return;
      wolkeConnect.textContent = on ? "Disconnect" : "Connect";
      wolkeConnect.setAttribute("aria-pressed", on ? "true" : "false");
      wolkeConnect.classList.toggle("is-on", Boolean(on));
    },
    setWolkeStatus(text) {
      if (wolkeStatus) wolkeStatus.textContent = text || "";
    },
    setCountLegend(spec) {
      const dataMin = Math.max(1, (spec && spec.dataMin) != null ? spec.dataMin | 0 : spec | 0 || 1);
      const dataMax = Math.max(dataMin, (spec && spec.dataMax) != null ? spec.dataMax | 0 : spec | 0 || dataMin);
      const winLo = spec && spec.winLo != null ? spec.winLo : dataMin;
      const winHi = spec && spec.winHi != null ? spec.winHi : dataMax;
      if (countLegLo) countLegLo.textContent = String(dataMin);
      if (countLegMid) countLegMid.textContent = `${winLo}–${winHi}`;
      if (countLegHi) countLegHi.textContent = String(dataMax);
      if (countCmapBar) {
        countCmapBar.style.background = countCmapCss(countCmap ? countCmap.value : DEFAULT_COUNT_CMAP);
      }
    },
    setCountScale(spec) {
      const s = spec || {};
      const dataMin = Math.max(1, s.dataMin | 0 || 1);
      const dataMax = Math.max(dataMin, s.dataMax | 0 || dataMin);
      const winLo = s.winLo != null ? s.winLo : dataMin;
      const winHi = s.winHi != null ? s.winHi : dataMax;
      const hide = Math.max(0, s.hideBelow | 0);
      const trim = normalizeCountTrim(s.trim != null ? s.trim : DEFAULT_COUNT_TRIM);
      applying = true;
      if (countWinLo) {
        countWinLo.min = String(dataMin);
        countWinLo.max = String(dataMax);
        countWinLo.value = String(winLo);
      }
      if (countWinHi) {
        countWinHi.min = String(dataMin);
        countWinHi.max = String(dataMax);
        countWinHi.value = String(winHi);
      }
      if (countTrim) countTrim.value = String(trim);
      if (countHide) {
        countHide.min = "0";
        countHide.max = String(dataMax);
        countHide.value = String(Math.min(dataMax, hide));
      }
      applying = false;
      syncLabels();
      this.setCountLegend({ dataMin, dataMax, winLo, winHi });
    },
    setHint(text) {
      if (hint) hint.textContent = text;
    },
    collapsePhoneSourceFold() {
      if (phoneFolds()) setFold("");
    },
  };
}
