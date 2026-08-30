/** DONNER defaults and M.E.S.S. / WETTER palette. */

export const VERSION = "0.1.0-dev";

export const COLOR = {
  bg: 0x0b0f14,
  gold: 0xffc53d,
  cyan: 0x00fff2,
  blitz: 0xff5a4f,
  warmup: 0x8a9aa8,
  grid: 0x3a4a58,
  gridDiv: 0x1a242e,
  frame: 0xffc53d,
};

export const GHOST_OPACITY = 0.22;
export const GHOST_FALLOFF = 0.12;

/** Dim factor for cells that are not the isolated worldline. */
export const ISOLATE_FIELD = 0.12;

export const DEFAULTS = {
  width: 32,
  height: 32,
  wrap: true,
  pattern: "Blinker",
  seed: 42,
  density: 0.28,
  gensPerSec: 8,
  decay: 0.12,
  history: 48,
  gridBrightness: 0.4,
  cellSize: 1,
  timeScale: 1,
  maxInstances: 200_000,
  maxHistory: 96,
  maxStepCatchUp: 8,
  stabMode: "time",
};

export const GRID_PRESETS = [16, 24, 32, 48, 64];
