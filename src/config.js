/** DONNER defaults and M.E.S.S. / WETTER palette. */

export const VERSION = "0.1.0-dev";

export const COLOR = {
  bg: 0x0b0f14,
  gold: 0xffc53d,
  cyan: 0x00fff2,
  blitz: 0xff5a4f,
  grid: 0x3a4a58,
  gridDiv: 0x1a242e,
};

export const DEFAULTS = {
  width: 32,
  height: 32,
  wrap: true,
  pattern: "Glider",
  seed: 42,
  density: 0.28,
  gensPerSec: 8,
  decay: 0.12,
  history: 48,
  cellSize: 1,
  timeScale: 1,
  maxInstances: 200_000,
  maxHistory: 96,
  maxStepCatchUp: 8,
};

export const GRID_PRESETS = [16, 24, 32, 48, 64];
