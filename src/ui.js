import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS, VOXEL_GAP_MAX, VOXEL_GAP_MIN, VOXEL_GAP_STEP, clampCubeCap, clampDensity, clampVoxelGap, isCountSourceKind, isStaticSourceKind } from "./config.js";
import { formatCacheStatus } from "./spacetime.js";
import { clampSlab, stackThumbFrac, stackTickMarks } from "./axes.js";
import { arOverlaySelectShouldGuard } from "./xr.js";

const STAB_HINT = {
  none: "None: equal cubes. Occupancy only — start here if size is confusing.",
  time: "Time: each slice is as full as that cell already was at that generation. Bottom of a new run is smaller until it locks.",
  focus: "Focus: one size from the cyan plane, copied down the whole column. Unstable-at-focus cells look tiny all the way down. Learn Time first.",
};

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

  const applyDrag = (kind, back) => {
    const foc = Number(stack.value) || 0;
    if (kind === "near") commitSlab(back, foc, clipFarBack, "near");
    else if (kind === "far") commitSlab(clipNearBack, foc, back, "far");
    else commitSlab(clipNearBack, back, clipFarBack, "focus");
  };

  stackTrack.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    const kind = kindFromPointer(e);
    if (!kind) return;
    e.preventDefault();
    stackDrag = kind;
    on.activeAxis?.(axis);
    on.slabHold?.(true);
    stackTrack.setPointerCapture(e.pointerId);
    applyDrag(kind, backFromPointer(e));
  });
  stackTrack.addEventListener("pointermove", (e) => {
    if (!stackDrag) return;
    applyDrag(stackDrag, backFromPointer(e));
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
      applyDrag("focus", (Number(stack.value) || 0) + dir);
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
  const extentBtn = $("btn-extent");
  const resetPlanesBtn = $("btn-reset-planes");
  const alignZ = $("align-z");
  const arYaw = $("ar-yaw");
  const arStandBtns = ["x", "y", "z"].map((axis) => $(`ar-stand-${axis}`));
  const shadeHull = $("shade-hull");
  const shadeGhost = $("shade-ghost");
  const shadeTriple = $("shade-triple");
  const cubeCap = $("cube-cap");
  const fpsChip = $("hud-fps");
  const viewFps = $("view-fps");
  const hudViewFold = $("btn-hud-view");
  const pattern = $("pattern");
  const seed = $("seed");
  const speed = $("speed");
  const speedVal = $("speed-val");
  const cacheStatus = $("cache-status");
  const history = $("history");
  const historyVal = $("history-val");
  const voxelGap = $("voxel-gap");
  const voxelGapVal = $("voxel-gap-val");
  const btnHideCenter = $("btn-hide-center");
  const btnHideOuter = $("btn-hide-outer");
  const stackNow = $("btn-stack-now");
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
  const stabMode = $("stab-mode");
  const stabHint = $("stab-hint");
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
  history.value = String(DEFAULTS.history);
  if (voxelGap) {
    voxelGap.min = String(VOXEL_GAP_MIN);
    voxelGap.max = String(VOXEL_GAP_MAX);
    voxelGap.step = String(VOXEL_GAP_STEP);
    voxelGap.value = String(DEFAULTS.voxelGap);
  }
  wrap.checked = DEFAULTS.wrap;
  if (stopStable) stopStable.checked = DEFAULTS.stopWhenStable;
  stabMode.value = DEFAULTS.stabMode;
  if (dyn) dyn.checked = DEFAULTS.dynamics;
  if (fill) {
    fill.min = String(DEFAULTS.densityMin);
    fill.max = String(DEFAULTS.densityMax);
    fill.step = String(DEFAULTS.densityStep);
    fill.value = String(DEFAULTS.density);
  }
  if (alignZ) alignZ.checked = DEFAULTS.alignZ;
  if (cubeCap) cubeCap.value = String(DEFAULTS.maxInstances);
  if (sourceKind) sourceKind.value = DEFAULTS.sourceKind;
  if (wolkeUrl) wolkeUrl.value = DEFAULTS.wolkeUrl;
  if (wolkeToken) wolkeToken.value = DEFAULTS.wolkeToken;
  document.body.classList.toggle("source-count", isCountSourceKind(DEFAULTS.sourceKind));
  document.body.classList.toggle("source-static", isStaticSourceKind(DEFAULTS.sourceKind));
  const syncStabHint = () => {
    const key = stabMode.value;
    stabHint.textContent = STAB_HINT[key] || STAB_HINT.none;
    stabMode.title = STAB_HINT[key] || STAB_HINT.none;
  };
  const syncReadHint = () => {
    readHint.textContent =
      PATTERN_HINT[pattern.value] || PATTERN_HINT.Blinker;
  };
  const syncFillVisibility = () => {
    document.body.classList.toggle("pattern-random", pattern.value === "Random");
  };
  syncStabHint();
  syncReadHint();
  syncFillVisibility();

  const syncLabels = () => {
    speedVal.textContent = `${speed.value}/s`;
    historyVal.textContent = history.value;
    if (voxelGapVal && voxelGap) {
      const g = Number(voxelGap.value);
      voxelGapVal.textContent = !Number.isFinite(g) || g === 0 ? "0" : g.toFixed(2);
    }
    if (fillVal && fill) {
      const d = clampDensity(fill.value);
      fillVal.textContent = `${Math.round(d * 100)}%`;
    }
  };
  syncLabels();

  playBtn?.addEventListener("click", () => on.togglePlay());
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
  extentBtn?.addEventListener("click", () => on.resetClips?.());
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
  cubeCap?.addEventListener("change", () => {
    if (applying) return;
    cubeCap.value = String(clampCubeCap(cubeCap.value));
    on.cubeCap?.();
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
  stabMode.addEventListener("change", () => {
    syncStabHint();
    on.stabMode();
  });
  speed.addEventListener("input", () => {
    syncLabels();
    on.speed();
  });
  history.addEventListener("input", () => {
    syncLabels();
    on.history();
  });
  voxelGap?.addEventListener("input", () => {
    syncLabels();
    on.voxelGap?.();
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
  stackNow?.addEventListener("click", () => on.focusNow());
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
        slabs: {
          x: rails.x?.get() || { focusBack: 0, clipNearBack: 0, clipFarBack: 0 },
          y: rails.y?.get() || { focusBack: 0, clipNearBack: 0, clipFarBack: 0 },
          z: rails.z?.get() || { focusBack: 0, clipNearBack: 0, clipFarBack: 0 },
        },
        width: g,
        height: g,
        wrap: wrap.checked,
        stopWhenStable: stopStable ? stopStable.checked : DEFAULTS.stopWhenStable,
        stabMode: stabMode.value,
        dynamics: dyn ? dyn.checked : DEFAULTS.dynamics,
        density: fill ? clampDensity(fill.value) : DEFAULTS.density,
        encodingMinimal: DEFAULTS.encodingMinimal,
        forceFullRebuild: DEFAULTS.forceFullRebuild,
        sourceKind: sourceKind ? sourceKind.value : DEFAULTS.sourceKind,
        countSize: false,
        wolkeUrl: wolkeUrl ? wolkeUrl.value : DEFAULTS.wolkeUrl,
        wolkeToken: wolkeToken ? wolkeToken.value : DEFAULTS.wolkeToken,
        alignZ: alignZ ? alignZ.checked : DEFAULTS.alignZ,
        maxInstances: cubeCap ? clampCubeCap(cubeCap.value) : DEFAULTS.maxInstances,
      };
    },
    setPlaying(playing) {
      const label = playing ? "Pause" : "Play";
      for (const btn of [playBtn, playArBtn]) {
        if (!btn) continue;
        btn.textContent = label;
        btn.setAttribute("aria-pressed", playing ? "true" : "false");
        btn.classList.toggle("is-live", playing);
      }
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
    setActiveAxis(axis) {
      const a = axis === "x" || axis === "y" ? axis : "z";
      for (const id of ["x", "y", "z"]) {
        const el = $(`stack-axis-${id}`);
        el?.classList.toggle("is-active", id === a);
      }
    },
    setFps(fps) {
      const text = `${Number(fps).toFixed(0)} FPS`;
      if (fpsChip) fpsChip.textContent = text;
      if (viewFps) viewFps.textContent = text;
    },
    setSlabs({ activeAxis = "z", x, y, z }) {
      const a = activeAxis === "x" || activeAxis === "y" ? activeAxis : "z";
      if (x) rails.x?.set({ ...x, active: a === "x" });
      if (y) rails.y?.set({ ...y, active: a === "y" });
      if (z) rails.z?.set({ ...z, active: a === "z" });
      const zLive = Boolean(z?.live);
      const zNow = zLive || (z && (z.back | 0) === 0);
      stackNow?.classList.toggle("is-on", zNow);
      stackNow?.setAttribute("aria-pressed", zNow ? "true" : "false");
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
    },
    setHint(text) {
      if (hint) hint.textContent = text;
    },
  };
}
