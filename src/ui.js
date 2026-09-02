import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS, STAB_START_MAX, STAB_START_MIN, STAB_START_STEP, STAB_TAIL_MAX, STAB_TAIL_MIN, VOXEL_GAP_MAX, VOXEL_GAP_MIN, VOXEL_GAP_STEP, clampCubeCap, clampDensity, clampStabStart, clampStabTail, clampVoxelGap, isCountSourceKind, isStaticSourceKind } from "./config.js";
import { normalizeViewQuality } from "./quality.js";
import { countCmapCss, DEFAULT_COUNT_CMAP, normalizeCountCmap } from "./encoding.js";
import { formatCacheStatus } from "./spacetime.js";
import { clampSlab, playheadCrossesMid, playheadMidBack, stackThumbFrac, stackTickMarks } from "./axes.js";
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
  const loopBtn = $("btn-loop");
  const playArBtn = $("btn-play-ar");
  const arBtn = $("btn-ar");
  const xrExit = $("btn-xr-exit");
  const arReset = $("btn-ar-reset");
  const arSearch = $("btn-ar-search");
  const arMag = $("ar-mag");
  const arHeight = $("ar-height");
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
  const countFile = $("count-file");
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
  if (fill) {
    fill.min = String(DEFAULTS.densityMin);
    fill.max = String(DEFAULTS.densityMax);
    fill.step = String(DEFAULTS.densityStep);
    fill.value = String(DEFAULTS.density);
  }
  if (alignZ) alignZ.checked = DEFAULTS.alignZ;
  if (cubeCap) cubeCap.value = String(DEFAULTS.maxInstances);
  if (bench) bench.checked = DEFAULTS.bench;
  if (sourceKind) sourceKind.value = DEFAULTS.sourceKind;
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
  };
  syncLabels();

  playBtn?.addEventListener("click", () => on.togglePlay());
  loopBtn?.addEventListener("click", () => on.toggleLoop?.());
  playArBtn?.addEventListener("click", () => on.togglePlay());
  if (arBtn && on.enterAr) arBtn.addEventListener("click", () => on.enterAr());
  if (xrExit && on.exitAr) xrExit.addEventListener("click", () => on.exitAr());
  if (arSearch && on.searchArAnchor) arSearch.addEventListener("click", () => on.searchArAnchor());
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
  if (arHeight && on.arHeight) arHeight.addEventListener("input", () => on.arHeight());
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
    on.sourceKind?.();
  });
  countFile?.addEventListener("change", () => {
    const file = countFile.files && countFile.files[0];
    countFile.value = "";
    if (file) on.countFile?.(file);
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
        forceFullRebuild: DEFAULTS.forceFullRebuild,
        sourceKind: sourceKind ? sourceKind.value : DEFAULTS.sourceKind,
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
      for (const btn of [playBtn, playArBtn]) {
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
    setArActive(active, { locked = false, searching = false } = {}) {
      if (xrExit) xrExit.hidden = !active;
      if (playArBtn) playArBtn.hidden = !active;
      if (arSearch) {
        arSearch.hidden = !active || locked;
        arSearch.disabled = Boolean(!active || locked || searching);
        arSearch.classList.toggle("is-on", Boolean(active && searching && !locked));
        arSearch.setAttribute("aria-pressed", active && searching && !locked ? "true" : "false");
      }
      if (arReset) {
        arReset.hidden = !active || !locked;
        arReset.disabled = !locked;
      }
      if (arBtn) arBtn.hidden = !arSupported || active;
    },
    getArMag() {
      return arMag ? Number(arMag.value) : 1;
    },
    getArHeight() {
      return arHeight ? Number(arHeight.value) : 0;
    },
    setArHeight(h) {
      if (arHeight) arHeight.value = String(h);
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
      if (sourceKind) sourceKind.value = k;
      document.body.classList.toggle("source-count", isCountSourceKind(k));
      document.body.classList.toggle("source-static", isStaticSourceKind(k));
      if (conwayLive && isCountSourceKind(k)) conwayLive.hidden = true;
      if (playBtn && !playBtn.classList.contains("is-live")) playBtn.textContent = "Play";
      if (loopBtn) loopBtn.disabled = false;
      syncFillVisibility();
    },
    setCountMeta(text) {
      if (countMeta) countMeta.textContent = text || "";
    },
    setCountHint(text) {
      if (countHint) countHint.textContent = text;
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
    setCountLegend(ceiling) {
      const hi = Math.max(1, ceiling | 0);
      const mid = Math.max(1, Math.round((1 + hi) / 2));
      if (countLegLo) countLegLo.textContent = "1";
      if (countLegMid) countLegMid.textContent = String(mid);
      if (countLegHi) countLegHi.textContent = String(hi);
      if (countCmapBar) {
        countCmapBar.style.background = countCmapCss(countCmap ? countCmap.value : DEFAULT_COUNT_CMAP);
      }
    },
    setHint(text) {
      if (hint) hint.textContent = text;
    },
  };
}
