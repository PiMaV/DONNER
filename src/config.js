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

export const VERSION = "1.3.0";

/** Browser tab and similar chrome — same digits as the footer (`vX.Y.Z`). */
export function pageTitle(version = VERSION) {
  return `DONNER v${version}`;
}

/**
 * Grouped integer for HUD / ingest counts.
 * Apostrophe thousands (Swiss / scientific): unambiguous next to locale
 * decimals (Gap `0,01`) and denser than a space in Orbitron/hint text.
 */
export function formatGroupedInt(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return "0";
  const neg = v < 0;
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return neg ? `-${s}` : s;
}

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
  /** Silent Conway steps on boot so the default brick has Z depth. Stay paused. */
  conwayWarmGens: 12,
  decay: false,
  history: 48,
  cellSize: 1,
  timeScale: 1,
  /** Extra lattice spacing as a fraction of cube edge. 0 packs faces. Visitor Brain starts at 0.01. */
  voxelGap: 0.01,
  maxInstances: 250_000,
  /** CPU path timers + GPU probe. Off the hot path until the View checkbox is on. */
  bench: false,
  cubeCapMin: 100_000,
  /** Safety ceiling only (MAX mode follows arrived voxels up to this). */
  cubeCapMax: 100_000_000,
  alignZ: true,
  parallax: true,
  sliceAxis: "z",
  /** Axis View Loop walks on a volume. Not the viewcube / camera axis. */
  loopAxis: "z",
  /** Playhead steps per second while View Loop is on. */
  loopPerSec: 8,
  /** Look-strip Spin: revolutions per second around product Z. */
  spinRevPerSec: 1 / 24,
  /** Visitor Brain starts Ghost; Game of Life overrides via startShadeFor. */
  shadeMode: "ghost",
  /** Visitor Brain shows playhead and outer frames; Game of Life overrides via startPlaneChromeFor. */
  hideCenter: false,
  hideOuter: false,
  maxVisible: 128,
  maxStepCatchUp: 8,
  stabSize: true,
  stabStart: 0.5,
  stabTail: MAX_STAB_GENS,
  dynamics: true,
  encodingMinimal: false,
  countCmap: "donner",
  countTrim: 1,
  countHide: 0,
  forceFullRebuild: false,
  viewQuality: "high",
  maxTapeSlices: 4096,
  maxTapeEvents: 400_000,
  sourceKind: "mni152-low",
  countDemoUrl: "data/ignition_stack.npy",
  countDemoName: "ignition_stack",
  wolkeUrl: "http://127.0.0.1:5055",
  wolkeToken: "evt",
};

/** Visitor-facing Source copy. Ids stay `conway` / `ignition` / `mni152-low` / `mni152`. */
export const SOURCE_GUIDE = {
  conway: {
    label: "Game of Life",
    blurb: "A generator: each cube is a living cell, Z is generations. A short run fills the brick; Play grows it further.",
    cite: "",
  },
  ignition: {
    label: "Lighter Ignition",
    blurb: "Event-camera count cube of a lighter strike. X is sensor width; Y is time; Z is sensor height. Loop Y scrubs the recording.",
    cite: "Own recording. Cubes are event counts per pixel per Δt, not a video frame.",
  },
  "mni152-low": {
    label: "Brain MRI Low",
    blurb: "Example T1 atlas, 2× mean-binned for a lighter load. All three axes are space. Loop walks a cut.",
    cite: "",
  },
  mni152: {
    label: "Brain MRI High",
    blurb: "Example T1 atlas at native grid. All three axes are space. Loop walks a cut. Larger download.",
    cite: "",
  },
  count: {
    label: "Own cube",
    blurb: "Dropped .npy count cube (T × H × W). Loop scrubs the stack.",
    cite: "",
  },
};

export function sourceGuide(kind) {
  return SOURCE_GUIDE[kind] || SOURCE_GUIDE.conway;
}

/**
 * Look shade when a source boots or the visitor picks it.
 * Game of Life is Hull; Brain, Ignition, and own cubes are Ghost.
 */
export function startShadeFor(kind) {
  return kind === "conway" ? "hull" : "ghost";
}

/**
 * Plane chrome when a source boots or the visitor picks it.
 * Every public source starts with center and outer frames visible.
 */
export function startPlaneChromeFor(_kind) {
  return { hideCenter: false, hideOuter: false };
}

/** Face hides playhead and clip frames so the overlay is the head, not the box. */
export function facePlaneChrome() {
  return { hideCenter: true, hideOuter: true };
}

/**
 * View Gap when a source boots or the visitor picks it.
 * Brain MRI (and loaded cubes) get a hair of air; Game of Life and Ignition open more.
 */
export function startVoxelGapFor(kind) {
  return kind === "conway" || kind === "ignition" ? 0.05 : 0.01;
}

/** Loop axis when a source boots. Ignition walks Y (time) after the Y/Z swap. */
export function startLoopAxisFor(kind) {
  const a = COUNT_DEMOS[kind]?.loopAxis;
  return a === "x" || a === "y" ? a : "z";
}

/** Opt-in Look walkthrough. About stays identity; this is how to look. */
export const GUIDE_STEPS = [
  {
    title: "Orbit",
    body: "Drag to orbit, scroll to zoom, right-drag to pan. Phone: one-finger orbit, pinch zoom.",
    targets: ["view"],
    fold: "",
  },
  {
    title: "Source",
    body: "Pick Source on the left (phone: the Source fold): Game of Life, Lighter Ignition, Brain MRI Low or High, or Load NumPy. Drag-and-drop onto the volume always works. Game of Life keeps Play here; Pattern and grid sit under Setup.",
    targets: ["source-kind"],
    fold: "source",
  },
  {
    title: "Play vs Loop",
    body: "Game of Life Play grows the stack. Loop, under the rails, walks a cut of that tape. Ignition and Brain MRI Low / High scrub with Loop.",
    targets: ["btn-play", "btn-loop"],
    fold: "source",
  },
  {
    title: "Rails",
    body: "The three colored rails are X, Y, and Z. Drag a playhead, or grab a matching frame edge in the volume. Loop axis X / Y / Z sits under the rails.",
    targets: ["stack-axis-z", "loop-axis-z"],
    fold: "",
  },
  {
    title: "Viewcube",
    body: "Face-click the cube for an ortho cut. Hide center / Hide outer sit under the cube. Brain and Game of Life start with both frames on. Phone: use the rails; the cube is desktop-only.",
    targets: ["gizmo-hit", "btn-hide-center", "btn-hide-outer"],
    fold: "",
  },
  {
    title: "Inspect",
    body: "Hull is the solid crop. Ghost keeps a glass hull and a solid plane. Cuts shows three slices. Grab a colored frame edge to peek.",
    targets: ["shade-hull", "shade-ghost", "shade-triple"],
    fold: "",
  },
  {
    title: "Look",
    body: "Quality starts at High. Cubes above 500k occupied cells drop to Medium. Low is only if you pick it. Parallax is perspective. Fit frames the crop. Spin (Look strip) turns around Z; Loop can run at the same time. Reset Planes opens clips and centers the playheads.",
    targets: ["quality-high", "btn-parallax", "btn-reset-planes", "btn-spin"],
    fold: "view",
  },
];

export function guideStepAt(index) {
  const total = GUIDE_STEPS.length;
  const last = Math.max(0, total - 1);
  const i = Math.max(0, Math.min(last, Number(index) || 0));
  const step = GUIDE_STEPS[i] || GUIDE_STEPS[0];
  return {
    index: i,
    total,
    title: step.title,
    body: step.body,
    targets: step.targets || [],
    fold: step.fold || "",
    isFirst: i === 0,
    isLast: i === last,
  };
}

/** Count-cube demos under `data/` (committed copies for GitHub Pages). */
export const COUNT_DEMOS = {
  ignition: {
    url: "data/ignition_stack.npy",
    name: "ignition_stack",
    label: SOURCE_GUIDE.ignition.label,
    /** File export sits Y/Z wrong: swap, then mirror Z. Loop walks Y (time) toward later frames. */
    swapYZ: true,
    flipZ: true,
    loopAxis: "y",
  },
  "mni152-low": {
    url: "data/mni152_low_stack.npy",
    name: "mni152_low_stack",
    label: SOURCE_GUIDE["mni152-low"].label,
    static: true,
  },
  mni152: {
    url: "data/mni152_stack.npy",
    name: "mni152_stack",
    label: SOURCE_GUIDE.mni152.label,
    static: true,
  },
};

/** Load remap for a COUNT_DEMOS id. Own cubes / drops stay file order. */
export function countDemoLoadOpts(kind) {
  const d = COUNT_DEMOS[kind];
  if (!d) return {};
  return {
    swapYZ: Boolean(d.swapYZ),
    flipX: Boolean(d.flipX),
    flipY: Boolean(d.flipY),
    flipZ: Boolean(d.flipZ),
  };
}

export function isCountSourceKind(kind) {
  return kind === "count" || Boolean(COUNT_DEMOS[kind]);
}

/** MRI / static volumes: no Conway Play/Speed transport. */
export function isStaticSourceKind(kind) {
  return Boolean(COUNT_DEMOS[kind]?.static);
}

export function clampDensity(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.density;
  return Math.min(DEFAULTS.densityMax, Math.max(DEFAULTS.densityMin, v));
}

export const GRID_PRESETS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512];

/** View Gap spinner: 0 packs MRI faces; 5 leaves five cube-widths of air. */
export const VOXEL_GAP_MIN = 0;
export const VOXEL_GAP_MAX = 5;
export const VOXEL_GAP_STEP = 0.01;

export function clampVoxelGap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.voxelGap;
  return Math.min(VOXEL_GAP_MAX, Math.max(VOXEL_GAP_MIN, v));
}

/** Wheel-up (deltaY < 0) grows Gap. Snaps to `step`. */
export function stepVoxelGap(current, deltaY, step = VOXEL_GAP_STEP) {
  const dir = Math.sign(Number(deltaY) || 0);
  if (!dir) return clampVoxelGap(current);
  const span = Number(step);
  const inc = Number.isFinite(span) && span > 0 ? span : VOXEL_GAP_STEP;
  const next = clampVoxelGap(current) - dir * inc;
  return clampVoxelGap(Math.round(next / inc) * inc);
}

/** Readable Cube-cap steps (dropdown). MAX is separate — all arrived voxels. */
export const CUBE_CAP_PRESETS = Object.freeze([
  100_000,
  250_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
  10_000_000,
]);

/** Select value for “draw everything that arrived”. */
export const CUBE_CAP_MAX = "max";

export function isCubeCapMaxChoice(choice) {
  return String(choice || "") === CUBE_CAP_MAX;
}

export function formatCubeCapLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return formatCubeCapLabel(DEFAULTS.maxInstances);
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    const s = Number.isInteger(m) ? String(m) : String(Math.round(m * 10) / 10);
    return `${s}M`;
  }
  return `${Math.round(v / 1000)}k`;
}

/** Snap a numeric choice to the nearest fixed preset. */
export function clampCubeCap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.maxInstances;
  let best = CUBE_CAP_PRESETS[0];
  let bestDist = Infinity;
  for (const p of CUBE_CAP_PRESETS) {
    const d = Math.abs(p - v);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** Absolute allocation guard (MAX mode and wild streams). */
export function clampCubeCapHard(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return DEFAULTS.maxInstances;
  return Math.min(DEFAULTS.cubeCapMax, Math.max(CUBE_CAP_PRESETS[0], v));
}

/** Smallest fixed preset that can hold `cells` (or the top fixed step). */
export function cubeCapAtLeast(cells) {
  const n = Number(cells);
  if (!Number.isFinite(n) || n <= 0) return DEFAULTS.maxInstances;
  for (const p of CUBE_CAP_PRESETS) {
    if (p >= n) return p;
  }
  return CUBE_CAP_PRESETS[CUBE_CAP_PRESETS.length - 1];
}

/**
 * Resolve the GPU envelope from the dropdown choice + arrived voxel count.
 * MAX = all arrived cells (hard-clamped). Fixed steps snap to presets.
 */
export function resolveCubeCap(choice, arrivedCells = 0) {
  if (isCubeCapMaxChoice(choice)) {
    const need = Math.max(Number(arrivedCells) || 0, DEFAULTS.maxInstances);
    return clampCubeCapHard(need);
  }
  return clampCubeCap(choice);
}

/**
 * Cube cap after a count cube is on screen, or after Game of Life Pause.
 * Raise to the next *fixed* preset that covers drawn instances. Never lowers.
 * Callers on MAX mode skip this and use resolveCubeCap(..., arrived) instead.
 */
export function cubeCapForLoadedCells(cells, current = DEFAULTS.maxInstances) {
  const have = clampCubeCap(current);
  const need = cubeCapAtLeast(cells);
  return need > have ? need : have;
}

/**
 * Estimate a lower fixed Cube-cap preset from live FPS and drawn instances.
 * Assumes roughly FPS ∝ 1/N (GPU fill). Target ~30 FPS for the tip.
 * @returns {number | null} preset value, or null if no useful step
 */
export function suggestCubeCapPreset(fps, instances, targetFps = 30) {
  const f = Number(fps);
  const n = Number(instances);
  const goal = Number(targetFps);
  if (!(f > 0) || !(n > 0) || !(goal > 0)) return null;
  if (f >= goal) return null;
  const ideal = Math.floor(n * (f / goal));
  let sug = CUBE_CAP_PRESETS[0];
  for (const p of CUBE_CAP_PRESETS) {
    if (p <= ideal) sug = p;
  }
  if (sug >= n) {
    sug = CUBE_CAP_PRESETS[0];
    for (const p of CUBE_CAP_PRESETS) {
      if (p < n) sug = p;
    }
  }
  if (sug >= n) return null;
  return sug;
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
