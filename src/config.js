/** DONNER defaults and M.E.S.S. / WETTER palette. */

import {
  MAX_STAB_GENS,
  STAB_START_MAX,
  STAB_START_MIN,
  STAB_START_STEP,
  STAB_TAIL_MAX,
  STAB_TAIL_MIN,
} from "./dynamics.js";

export { MAX_STAB_GENS, STAB_START_MAX, STAB_START_MIN, STAB_START_STEP, STAB_TAIL_MAX, STAB_TAIL_MIN };

export const VERSION = "0.12.2";

export const COLOR = {
  bg: 0x0b0f14,
  gold: 0xffc53d,
  cyan: 0x00fff2,
  blitz: 0xff5a4f,
  unsettled: 0xb388ff,
  base: 0x8a9aa8,
  warmup: 0x8a9aa8,
  grid: 0x3a4a58,
  gridDiv: 0x1a242e,
  frame: 0xffc53d,
};

/** Product-axis language (gizmo, planes, rails). Not the encoding LUT. */
export const AXIS_COLOR = {
  x: 0x5b8cff,
  y: 0xe8c547,
  z: 0x3ecf8e,
};

export function hexCss(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, "0")}`;
}

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
  densityMin: 0.05,
  densityMax: 0.9,
  densityStep: 0.01,
  gensPerSec: 8,
  decay: false,
  history: 48,
  cellSize: 1,
  timeScale: 1,
  /** Extra lattice spacing as a fraction of cube edge. 0 packs faces. */
  voxelGap: 0,
  maxInstances: 200_000,
  /** CPU path timers + GPU probe. Off the hot path until the View checkbox is on. */
  bench: false,
  cubeCapMin: 20_000,
  cubeCapMax: 4_000_000,
  alignZ: true,
  parallax: true,
  sliceAxis: "z",
  /** Axis View Loop walks on a volume. Not the viewcube / camera axis. */
  loopAxis: "z",
  /** Playhead steps per second while View Loop is on. */
  loopPerSec: 8,
  shadeMode: "hull",
  maxVisible: 128,
  maxStepCatchUp: 8,
  stabSize: true,
  stabStart: 0.5,
  stabTail: MAX_STAB_GENS,
  dynamics: true,
  encodingMinimal: false,
  countCmap: "donner",
  forceFullRebuild: false,
  viewQuality: "medium",
  maxTapeSlices: 4096,
  maxTapeEvents: 400_000,
  sourceKind: "conway",
  countDemoUrl: "data/ignition_stack.npy",
  countDemoName: "ignition_stack",
  wolkeUrl: "http://127.0.0.1:5055",
  wolkeToken: "evt",
};

/** Visitor-facing Source copy. Ids stay `conway` / `ignition` / `mni152`. */
export const SOURCE_WELCOME =
  "DONNER shows structured data as a 3D brick. Drag to orbit. Pick an example below; View is look, color, and quality. Starts at Medium. Choppy? Quality → Low. Pretty GPU? Quality → High.";

export const SOURCE_GUIDE = {
  conway: {
    label: "Game of Life",
    blurb: "A generator: each cube is a living cell, Z is generations. Starts paused. Play grows the stack.",
    cite: "",
  },
  ignition: {
    label: "Lighter Ignition",
    blurb: "Event-camera count cube of a lighter strike. Sparse XY; Z is time. Loop scrubs the recording.",
    cite: "Own recording. Cubes are event counts per pixel per Δt, not a video frame.",
  },
  mni152: {
    label: "Brain MRI",
    blurb: "Example T1 atlas. All three axes are space. Loop walks a cut. Not a patient scan.",
    cite: "Derived from ICBM 152 Nonlinear 2009 (McGill) via NiiVue demo images (BSD-2-Clause). See data/NOTICE.md.",
  },
};

export function sourceGuide(kind) {
  return SOURCE_GUIDE[kind] || SOURCE_GUIDE.conway;
}

/** Count-cube demos under `data/` (committed copies for GitHub Pages). */
export const COUNT_DEMOS = {
  ignition: {
    url: "data/ignition_stack.npy",
    name: "ignition_stack",
    label: SOURCE_GUIDE.ignition.label,
  },
  mni152: {
    url: "data/mni152_stack.npy",
    name: "mni152_stack",
    label: SOURCE_GUIDE.mni152.label,
  },
};

export function isCountSourceKind(kind) {
  return kind === "count" || Boolean(COUNT_DEMOS[kind]);
}

/** MRI / static volumes: no Conway Play/Speed transport. */
export function isStaticSourceKind(kind) {
  return kind === "mni152";
}

export function clampDensity(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.density;
  return Math.min(DEFAULTS.densityMax, Math.max(DEFAULTS.densityMin, v));
}

export const GRID_PRESETS = [16, 24, 32, 48, 64];

/** View Gap slider: 0 packs MRI; 5 leaves five cube-widths of air. */
export const VOXEL_GAP_MIN = 0;
export const VOXEL_GAP_MAX = 5;
export const VOXEL_GAP_STEP = 0.05;

export function clampVoxelGap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.voxelGap;
  return Math.min(VOXEL_GAP_MAX, Math.max(VOXEL_GAP_MIN, v));
}

export function clampCubeCap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.maxInstances;
  return Math.min(DEFAULTS.cubeCapMax, Math.max(DEFAULTS.cubeCapMin, Math.round(v)));
}

export function clampStabStart(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.stabStart;
  return Math.min(STAB_START_MAX, Math.max(STAB_START_MIN, v));
}

export function clampStabTail(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.stabTail;
  return Math.min(STAB_TAIL_MAX, Math.max(STAB_TAIL_MIN, Math.round(v)));
}
