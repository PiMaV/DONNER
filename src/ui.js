import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS } from "./config.js";

const STAB_HINT = {
  none: "None: equal cubes. Occupancy only — start here if size is confusing.",
  time: "Time: each slice is as full as that cell already was at that generation. Bottom of a new run is smaller until it locks.",
  focus: "Focus: one size from the gold plane, copied down the whole column. Unstable-at-focus cells look tiny all the way down. Learn Time first.",
};

const PATTERN_HINT = {
  Blinker:
    "Blinker (read this first): gold core stays on. Cyan tips flash every other generation — empty = dead, not a missing color.",
  Toad: "Toad: period-2 oscillator, two rows. Watch cyan occupancy flip along Y, not XY motion.",
  Beacon: "Beacon: period-2. Two blocks trade a corner; gold cores, cyan flicker.",
  Glider:
    "Glider: coral space-time tube (transit). It does not oscillate in place — cyan/gold would mean the ship sat still. Follow the curve in XZ+Y.",
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
  const focus = $("focus");
  const focusVal = $("focus-val");
  const focusNow = $("btn-focus-now");
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
  focus.value = "0";
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
  focus.addEventListener("input", () => on.focus());
  focusNow.addEventListener("click", () => on.focusNow());
  fold.addEventListener("click", () => {
    const open = panel.classList.toggle("is-open");
    fold.setAttribute("aria-expanded", open ? "true" : "false");
    fold.textContent = open ? "Controls ▾" : "Controls ▸";
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
        focusBack: Number.parseInt(focus.value, 10) || 0,
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
    setFocus(back, maxBack) {
      focus.max = String(Math.max(0, maxBack));
      focus.value = String(back);
      focusVal.textContent = back === 0 ? "Now" : `−${back}`;
    },
    setHint(text) {
      hint.textContent = text;
    },
  };
}
