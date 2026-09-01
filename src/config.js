/** DONNER defaults and M.E.S.S. / WETTER palette. */

export const VERSION = "0.4.0";

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
  stopWhenStable: true,
  stableHold: 5,
  pattern: "R-pentomino",
  seed: 42,
  density: 0.28,
  gensPerSec: 8,
  decay: true,
  history: 48,
  gridBrightness: 0.4,
  cellSize: 1,
  timeScale: 1,
  maxInstances: 200_000,
  cubeCapMin: 20_000,
  cubeCapMax: 4_000_000,
  alignZ: true,
  parallax: true,
  sliceAxis: "z",
  maxVisible: 128,
  maxStepCatchUp: 8,
  stabMode: "time",
  dynamics: true,
  neighborhoodRadius: 0,
  stabScale: true,
  encodingMinimal: false,
  forceFullRebuild: false,
  maxTapeSlices: 4096,
  maxTapeEvents: 400_000,
  sourceKind: "conway",
  countDemoUrl: "data/ignition_stack.npy",
  countDemoName: "ignition_stack",
  wolkeUrl: "http://127.0.0.1:5055",
  wolkeToken: "evt",
};

export const GRID_PRESETS = [16, 24, 32, 48, 64];

export function clampCubeCap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.maxInstances;
  return Math.min(DEFAULTS.cubeCapMax, Math.max(DEFAULTS.cubeCapMin, Math.round(v)));
}
