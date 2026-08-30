import { PATTERN_NAMES } from "./conway.js";
import { DEFAULTS, GRID_PRESETS } from "./config.js";

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
  const pattern = $("pattern");
  const seed = $("seed");
  const speed = $("speed");
  const speedVal = $("speed-val");
  const decay = $("decay");
  const decayVal = $("decay-val");
  const history = $("history");
  const historyVal = $("history-val");
  const grid = $("grid");
  const wrap = $("wrap");
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
  history.value = String(DEFAULTS.history);
  wrap.checked = DEFAULTS.wrap;

  const syncLabels = () => {
    speedVal.textContent = `${speed.value}/s`;
    decayVal.textContent = Number(decay.value).toFixed(2);
    historyVal.textContent = history.value;
  };
  syncLabels();

  playBtn.addEventListener("click", () => on.togglePlay());
  stepBtn.addEventListener("click", () => on.step());
  resetBtn.addEventListener("click", () => on.reset());
  randBtn.addEventListener("click", () => {
    seed.value = String((Math.random() * 0x7fffffff) | 0);
    on.reset();
  });
  pattern.addEventListener("change", () => on.reset());
  seed.addEventListener("change", () => on.reset());
  grid.addEventListener("change", () => on.rebuild());
  wrap.addEventListener("change", () => on.reset());
  speed.addEventListener("input", () => {
    syncLabels();
    on.speed();
  });
  decay.addEventListener("input", () => {
    syncLabels();
    on.decay();
  });
  history.addEventListener("input", () => {
    syncLabels();
    on.history();
  });
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
        history: Number.parseInt(history.value, 10),
        width: g,
        height: g,
        wrap: wrap.checked,
      };
    },
    setPlaying(playing) {
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      playBtn.classList.toggle("is-live", playing);
    },
    setHint(text) {
      hint.textContent = text;
    },
  };
}
