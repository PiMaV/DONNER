import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS } from "./config.js";
import { stackThumbFrac, stackTickMarks } from "./axes.js";

const STAB_HINT = {
  none: "None: equal cubes. Occupancy only — start here if size is confusing.",
  time: "Time: each slice is as full as that cell already was at that generation. Bottom of a new run is smaller until it locks.",
  focus: "Focus: one size from the gold plane, copied down the whole column. Unstable-at-focus cells look tiny all the way down. Learn Time first.",
};

const PATTERN_HINT = {
  Blinker:
    "Blinker (read this first): gold core stays on. Cyan tips flash every other generation — empty = dead, not a missing color.",
  Toad: "Toad: period-2 oscillator, two rows. Watch cyan occupancy flip along Z (time), not XY motion.",
  Beacon: "Beacon: period-2. Two blocks trade a corner; gold cores, cyan flicker.",
  Glider:
    "Glider: coral space-time tube (transit). It does not oscillate in place — cyan/gold would mean the ship sat still. Follow the curve in XY+Z.",
  "R-pentomino": "R-pentomino: long chaotic transit, then stills/oscillators appear in place.",
  "Gosper gun": "Gosper gun needs grid ≥ 48. Gliders peel off as coral trails.",
  Random: "Random soup: transit (coral) until islands lock into gold/cyan.",
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
  const stepBtn = $("btn-step");
  const resetBtn = $("btn-reset");
  const randBtn = $("btn-random");
  const editBtn = $("btn-edit");
  const birdBtn = $("btn-bird");
  const fpsChip = $("hud-fps");
  const pattern = $("pattern");
  const seed = $("seed");
  const speed = $("speed");
  const speedVal = $("speed-val");
  const decay = $("decay");
  const decayVal = $("decay-val");
  const gridBright = $("grid-bright");
  const gridBrightVal = $("grid-bright-val");
  const history = $("history");
  const historyVal = $("history-val");
  const stack = $("stack-slider");
  const stackNow = $("btn-stack-now");
  const stackBot = $("stack-bot");
  const stackTicks = $("stack-ticks");
  const stackThumbTime = $("stack-thumb-time");
  let tickMax = -1;
  const grid = $("grid");
  const wrap = $("wrap");
  const stabMode = $("stab-mode");
  const stabHint = $("stab-hint");
  const readHint = $("read-hint");
  const fold = $("btn-fold");
  const panel = $("controls");
  const hint = $("hint");

  fillSelect(pattern, PATTERN_NAMES, DEFAULTS.pattern);
  fillSelect(
    grid,
    GRID_PRESETS.map((n) => `${n}×${n}`),
    `${DEFAULTS.width}×${DEFAULTS.height}`,
  );

  seed.value = String(DEFAULTS.seed);
  speed.value = String(DEFAULTS.gensPerSec);
  decay.value = String(DEFAULTS.decay);
  gridBright.value = String(DEFAULTS.gridBrightness);
  history.value = String(DEFAULTS.history);
  wrap.checked = DEFAULTS.wrap;
  stabMode.value = DEFAULTS.stabMode;
  const syncStabHint = () => {
    const key = stabMode.value;
    stabHint.textContent = STAB_HINT[key] || STAB_HINT.none;
    stabMode.title = STAB_HINT[key] || STAB_HINT.none;
  };
  syncStabHint();
  const syncReadHint = () => {
    readHint.textContent =
      PATTERN_HINT[pattern.value] || PATTERN_HINT.Blinker;
  };
  syncReadHint();

  const syncLabels = () => {
    speedVal.textContent = `${speed.value}/s`;
    decayVal.textContent = Number(decay.value).toFixed(2);
    gridBrightVal.textContent = Number(gridBright.value).toFixed(2);
    historyVal.textContent = history.value;
  };
  syncLabels();

  playBtn.addEventListener("click", () => on.togglePlay());
  stepBtn.addEventListener("click", () => on.step());
  resetBtn.addEventListener("click", () => on.reset());
  editBtn.addEventListener("click", () => on.toggleEdit());
  birdBtn.addEventListener("click", () => on.toggleBird());
  randBtn.addEventListener("click", () => {
    seed.value = String((Math.random() * 0x7fffffff) | 0);
    on.reset();
  });
  pattern.addEventListener("change", () => {
    syncReadHint();
    on.reset();
  });
  seed.addEventListener("change", () => on.reset());
  grid.addEventListener("change", () => on.rebuild());
  wrap.addEventListener("change", () => on.reset());
  stabMode.addEventListener("change", () => {
    syncStabHint();
    on.stabMode();
  });
  speed.addEventListener("input", () => {
    syncLabels();
    on.speed();
  });
  decay.addEventListener("input", () => {
    syncLabels();
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
  stack.addEventListener("input", () => on.focus());
  stack.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const max = Number(stack.max) || 0;
      const dir = Math.sign(e.deltaY) || 1;
      const next = Math.min(max, Math.max(0, Number(stack.value) + dir));
      if (String(next) === stack.value) return;
      stack.value = String(next);
      on.focus();
    },
    { passive: false },
  );
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
  fold.addEventListener("click", () => {
    const open = panel.classList.toggle("is-open");
    fold.setAttribute("aria-expanded", open ? "true" : "false");
    fold.textContent = open ? "Controls ▾" : "Controls ▸";
  });
  fpsChip.addEventListener("click", () => {
    const open = document.body.classList.toggle("hud-view-open");
    fpsChip.setAttribute("aria-expanded", open ? "true" : "false");
  });

  return {
    getConfig() {
      const g = Number.parseInt(grid.value, 10);
      return {
        pattern: pattern.value,
        seed: Number.parseInt(seed.value, 10) || 0,
        gensPerSec: Number(speed.value),
        decay: Number(decay.value),
        gridBrightness: Number(gridBright.value),
        history: Number.parseInt(history.value, 10),
        focusBack: Number.parseInt(stack.value, 10) || 0,
        width: g,
        height: g,
        wrap: wrap.checked,
        stabMode: stabMode.value,
      };
    },
    setPlaying(playing) {
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      playBtn.classList.toggle("is-live", playing);
    },
    setEditing(editing) {
      editBtn.classList.toggle("is-on", editing);
      editBtn.setAttribute("aria-pressed", editing ? "true" : "false");
    },
    setBird(on) {
      birdBtn.classList.toggle("is-on", on);
      birdBtn.setAttribute("aria-pressed", on ? "true" : "false");
    },
    setFps(fps) {
      fpsChip.textContent = `${Number(fps).toFixed(0)} FPS`;
    },
    setFocus(back, maxBack, tFocus = 0) {
      const max = Math.max(0, maxBack);
      stack.max = String(max);
      stack.value = String(back);
      stackNow.classList.toggle("is-on", back === 0);
      stackNow.setAttribute("aria-pressed", back === 0 ? "true" : "false");
      stackBot.textContent = max === 0 ? "—" : `−${max}`;
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
      stackThumbTime.style.setProperty(
        "--frac",
        stackThumbFrac(back, max).toFixed(4),
      );
    },
    setHint(text) {
      hint.textContent = text;
    },
  };
}
