import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS, clampCubeCap } from "./config.js";
import { BENCH_PRESETS } from "./bench.js";
import { formatCacheStatus } from "./spacetime.js";
import { clampSlab, stackThumbFrac, stackTickMarks } from "./axes.js";

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
    "Glider: occupancy-only looks gold/cyan on cells the ship crosses. Set Neighborhood 3×3 or 5×5 for the coral transit tube.",
  "R-pentomino": "R-pentomino: long chaotic transit, then stills/oscillators appear in place.",
  "Gosper gun": "Gosper gun needs grid ≥ 48. Gliders peel off as coral trails.",
  Random: "Random soup: occupancy until islands lock. Neighborhood 3×3/5×5 for transit tubes.",
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

export function bindUI(on) {
  const playBtn = $("btn-play");
  const arBtn = $("btn-ar");
  const xrExit = $("btn-xr-exit");
  const arMag = $("ar-mag");
  const stepBtn = $("btn-step");
  const resetBtn = $("btn-reset");
  const randBtn = $("btn-random");
  const editBtn = $("btn-edit");
  const parallaxBtn = $("btn-parallax");
  const fitBtn = $("btn-fit");
  const alignZ = $("align-z");
  const sliceX = $("slice-x");
  const sliceY = $("slice-y");
  const sliceZ = $("slice-z");
  const cubeCap = $("cube-cap");
  const fpsChip = $("hud-fps");
  const hudViewFold = $("btn-hud-view");
  const pattern = $("pattern");
  const seed = $("seed");
  const speed = $("speed");
  const speedVal = $("speed-val");
  const decay = $("decay");
  const cacheStatus = $("cache-status");
  const gridBright = $("grid-bright");
  const gridBrightVal = $("grid-bright-val");
  const history = $("history");
  const historyVal = $("history-val");
  const stack = $("stack-slider");
  const stackTrack = $("stack-track");
  const stackSlab = $("stack-slab");
  const zFocus = $("z-focus");
  const zClipNear = $("z-clip-near");
  const zClipFar = $("z-clip-far");
  const stackNow = $("btn-stack-now");
  const stackBot = $("stack-bot");
  const stackTicks = $("stack-ticks");
  const stackThumbTime = $("stack-thumb-time");
  let tickMax = -1;
  let clipNearBack = 0;
  let clipFarBack = 0;
  let stackDrag = null;
  let arSupported = false;
  const grid = $("grid");
  const wrap = $("wrap");
  const stopStable = $("stop-stable");
  const stabMode = $("stab-mode");
  const stabHint = $("stab-hint");
  const readHint = $("read-hint");
  const foldView = $("btn-fold-view");
  const foldSource = $("btn-fold-source");
  const panelView = $("panel-view");
  const panelSource = $("panel-source");
  const hint = $("hint");
  const sourceKind = $("source-kind");
  const countFile = $("count-file");
  const countDemo = $("btn-count-demo");
  const countMeta = $("count-meta");
  const countHint = $("count-hint");
  const wolkeUrl = $("wolke-url");
  const wolkeToken = $("wolke-token");
  const wolkeConnect = $("btn-wolke-connect");
  const wolkeStatus = $("wolke-status");
  const countSize = $("count-size");
  const countLegLo = $("count-leg-lo");
  const countLegMid = $("count-leg-mid");
  const countLegHi = $("count-leg-hi");
  const preset = $("bench-preset");
  const presetHint = $("preset-hint");
  const dyn = $("bench-dynamics");
  const neigh = $("bench-neighborhood");
  const stabScale = $("bench-stab-scale");
  const encMin = $("bench-encoding-min");
  const fullRebuild = $("bench-full-rebuild");
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
  preset.replaceChildren();
  for (const p of BENCH_PRESETS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    if (p.id === "teaching") opt.selected = true;
    preset.appendChild(opt);
  }

  seed.value = String(DEFAULTS.seed);
  speed.value = String(DEFAULTS.gensPerSec);
  decay.checked = DEFAULTS.decay;
  gridBright.value = String(DEFAULTS.gridBrightness);
  history.value = String(DEFAULTS.history);
  wrap.checked = DEFAULTS.wrap;
  if (stopStable) stopStable.checked = DEFAULTS.stopWhenStable;
  stabMode.value = DEFAULTS.stabMode;
  dyn.checked = DEFAULTS.dynamics;
  neigh.value = String(DEFAULTS.neighborhoodRadius);
  stabScale.checked = DEFAULTS.stabScale;
  encMin.checked = DEFAULTS.encodingMinimal;
  fullRebuild.checked = DEFAULTS.forceFullRebuild;
  if (alignZ) alignZ.checked = DEFAULTS.alignZ;
  if (cubeCap) cubeCap.value = String(DEFAULTS.maxInstances);
  if (sourceKind) sourceKind.value = DEFAULTS.sourceKind;
  if (countSize) countSize.checked = false;
  if (wolkeUrl) wolkeUrl.value = DEFAULTS.wolkeUrl;
  if (wolkeToken) wolkeToken.value = DEFAULTS.wolkeToken;
  document.body.classList.toggle("source-count", DEFAULTS.sourceKind === "count");
  const syncStabHint = () => {
    const key = stabMode.value;
    stabHint.textContent = STAB_HINT[key] || STAB_HINT.none;
    stabMode.title = STAB_HINT[key] || STAB_HINT.none;
  };
  const syncReadHint = () => {
    readHint.textContent =
      PATTERN_HINT[pattern.value] || PATTERN_HINT.Blinker;
  };
  const syncPresetHint = () => {
    const p = BENCH_PRESETS.find((x) => x.id === preset.value);
    presetHint.textContent = p ? p.blurb : "";
  };
  syncStabHint();
  syncReadHint();
  syncPresetHint();

  const syncLabels = () => {
    speedVal.textContent = `${speed.value}/s`;
    gridBrightVal.textContent = Number(gridBright.value).toFixed(2);
    historyVal.textContent = history.value;
  };
  syncLabels();

  playBtn.addEventListener("click", () => on.togglePlay());
  if (arBtn && on.enterAr) arBtn.addEventListener("click", () => on.enterAr());
  if (xrExit && on.exitAr) xrExit.addEventListener("click", () => on.exitAr());
  if (arMag && on.arMag) arMag.addEventListener("input", () => on.arMag());
  stepBtn.addEventListener("click", () => on.step());
  resetBtn.addEventListener("click", () => on.reset());
  editBtn.addEventListener("click", () => on.toggleEdit());
  parallaxBtn?.addEventListener("click", () => on.toggleParallax());
  fitBtn?.addEventListener("click", () => on.fitVolume());
  alignZ?.addEventListener("change", () => on.alignZ?.());
  const onSlice = (axis) => () => on.sliceAxis?.(axis);
  sliceX?.addEventListener("click", onSlice("x"));
  sliceY?.addEventListener("click", onSlice("y"));
  sliceZ?.addEventListener("click", onSlice("z"));
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
  decay.addEventListener("change", () => {
    on.decay();
  });
  gridBright.addEventListener("input", () => {
    syncLabels();
    on.gridBrightness();
  });
  history.addEventListener("input", () => {
    syncLabels();
    on.history();
  });
  const onBenchFlag = () => {
    if (applying) return;
    on.benchFlags();
  };
  dyn.addEventListener("change", onBenchFlag);
  neigh.addEventListener("change", onBenchFlag);
  stabScale.addEventListener("change", onBenchFlag);
  encMin.addEventListener("change", onBenchFlag);
  fullRebuild.addEventListener("change", onBenchFlag);
  preset.addEventListener("change", () => {
    if (applying) return;
    on.preset();
  });
  sourceKind?.addEventListener("change", () => {
    if (applying) return;
    on.sourceKind?.();
  });
  countDemo?.addEventListener("click", () => on.countDemo?.());
  countFile?.addEventListener("change", () => {
    const file = countFile.files && countFile.files[0];
    countFile.value = "";
    if (file) on.countFile?.(file);
  });
  countSize?.addEventListener("change", () => {
    if (applying) return;
    on.countSize?.();
  });
  wolkeConnect?.addEventListener("click", () => on.wolkeConnect?.());
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
    on.focus();
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
        if (
          kind !== "focus" &&
          !document.body.classList.contains("is-inspect") &&
          !document.body.classList.contains("has-slab")
        ) {
          return;
        }
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
    if (
      document.body.classList.contains("is-inspect") ||
      document.body.classList.contains("has-slab")
    ) {
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
    if (
      !document.body.classList.contains("is-inspect") &&
      !document.body.classList.contains("has-slab")
    ) {
      return "focus";
    }
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
    stackTrack.setPointerCapture(e.pointerId);
    applyDrag(kind, backFromPointer(e));
  });
  stackTrack.addEventListener("pointermove", (e) => {
    if (!stackDrag) return;
    applyDrag(stackDrag, backFromPointer(e));
  });
  const endDrag = () => {
    stackDrag = null;
  };
  stackTrack.addEventListener("pointerup", endDrag);
  stackTrack.addEventListener("pointercancel", endDrag);
  stackTrack.addEventListener("lostpointercapture", endDrag);
  stackTrack.addEventListener(
    "wheel",
    (e) => {
      if (stack.disabled) return;
      e.preventDefault();
      const dir = Math.sign(e.deltaY) || 1;
      applyDrag("focus", (Number(stack.value) || 0) + dir);
    },
    { passive: false },
  );
  const nudgeHandle = (kind, dir) => {
    const foc = Number(stack.value) || 0;
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
  stackNow.addEventListener("click", () => on.focusNow());
  const narrow = window.matchMedia("(max-width: 720px)");
  const syncStackOrient = () => {
    const horizontal = narrow.matches;
    stack.setAttribute("aria-orientation", horizontal ? "horizontal" : "vertical");
    if (horizontal) stack.removeAttribute("orient");
    else stack.setAttribute("orient", "vertical");
  };
  syncStackOrient();
  narrow.addEventListener("change", syncStackOrient);
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
  fpsChip.addEventListener("click", () => {
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
        decay: decay.checked,
        gridBrightness: Number(gridBright.value),
        history: Number.parseInt(history.value, 10) || DEFAULTS.history,
        focusBack: Number.parseInt(stack.value, 10) || 0,
        clipNearBack: clipNearBack,
        clipFarBack: clipFarBack,
        width: g,
        height: g,
        wrap: wrap.checked,
        stopWhenStable: stopStable ? stopStable.checked : DEFAULTS.stopWhenStable,
        stabMode: stabMode.value,
        dynamics: dyn.checked,
        neighborhoodRadius: Number.parseInt(neigh.value, 10) || 0,
        stabScale: stabScale.checked,
        encodingMinimal: encMin.checked,
        forceFullRebuild: fullRebuild.checked,
        preset: preset.value,
        sourceKind: sourceKind ? sourceKind.value : DEFAULTS.sourceKind,
        countSize: countSize ? countSize.checked : false,
        wolkeUrl: wolkeUrl ? wolkeUrl.value : DEFAULTS.wolkeUrl,
        wolkeToken: wolkeToken ? wolkeToken.value : DEFAULTS.wolkeToken,
        alignZ: alignZ ? alignZ.checked : DEFAULTS.alignZ,
        maxInstances: cubeCap ? clampCubeCap(cubeCap.value) : DEFAULTS.maxInstances,
      };
    },
    applyPreset(p) {
      applying = true;
      if (sourceKind) sourceKind.value = "conway";
      document.body.classList.remove("source-count");
      pattern.value = p.pattern;
      grid.value = String(p.width);
      history.value = String(p.visible);
      stabMode.value = p.stabMode;
      dyn.checked = p.dynamics;
      neigh.value = String(p.neighborhoodRadius ?? 0);
      stabScale.checked = p.stabScale;
      encMin.checked = p.encodingMinimal;
      preset.value = p.id;
      syncStabHint();
      syncReadHint();
      syncPresetHint();
      syncLabels();
      applying = false;
    },
    setPlaying(playing) {
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      playBtn.classList.toggle("is-live", playing);
    },
    setDecay(on) {
      decay.checked = Boolean(on);
    },
    setArAvailable(ok) {
      arSupported = Boolean(ok);
      if (arBtn) arBtn.hidden = !arSupported || document.body.classList.contains("is-ar");
    },
    setArActive(active) {
      if (xrExit) xrExit.hidden = !active;
      if (arBtn) arBtn.hidden = !arSupported || active;
    },
    getArMag() {
      return arMag ? Number(arMag.value) : 1;
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
    setSliceAxis(axis) {
      const a = axis === "x" || axis === "y" ? axis : "z";
      const buttons = [
        [sliceX, "x"],
        [sliceY, "y"],
        [sliceZ, "z"],
      ];
      for (const [el, id] of buttons) {
        if (!el) continue;
        const on = id === a;
        el.classList.toggle("is-on", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      }
      document.body.classList.toggle("has-slab", a !== "z");
    },
    setFps(fps) {
      fpsChip.textContent = `${Number(fps).toFixed(0)} FPS`;
    },
    setFocus(back, maxBack, tFocus = 0, oldest = 0, live = false, nearBack = 0, farBack = maxBack) {
      const max = live ? 0 : Math.max(0, maxBack);
      stack.max = String(max);
      stack.value = String(live ? 0 : back);
      stack.disabled = Boolean(live);
      zFocus.disabled = Boolean(live);
      zClipNear.disabled = Boolean(live);
      zClipFar.disabled = Boolean(live);
      const slab = live
        ? { topBack: 0, focusBack: 0, botBack: 0 }
        : clampSlab(nearBack, back, farBack, max);
      clipNearBack = slab.topBack;
      clipFarBack = slab.botBack;
      stack.value = String(live ? 0 : slab.focusBack);
      stackNow.classList.toggle("is-on", live || slab.focusBack === 0);
      stackNow.setAttribute("aria-pressed", live || slab.focusBack === 0 ? "true" : "false");
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
      stackThumbTime.textContent = String(tFocus);
      layoutStack();
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
      const spatial = document.body.classList.contains("has-slab");
      editBtn.disabled = count || spatial || (Boolean(inspect) && !atNow);
      stepBtn.disabled = count ? false : Boolean(inspect);
      document.body.classList.toggle("is-inspect", Boolean(inspect));
    },
    setSourceKind(kind) {
      const count = kind === "count";
      if (sourceKind) sourceKind.value = count ? "count" : "conway";
      document.body.classList.toggle("source-count", count);
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
      hint.textContent = text;
    },
  };
}
