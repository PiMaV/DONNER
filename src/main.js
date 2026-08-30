import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { COLOR, DEFAULTS, VERSION } from "./config.js";
import { ConwayWorld, seedPattern } from "./conway.js";
import { clampFocusBack, focusGeneration } from "./focus.js";
import { FrameClock, formatHud } from "./hud.js";
import { mulberry32 } from "./rng.js";
import {
  CubeRenderer,
  FocusFrame,
  createFocusSurface,
  createHoverMarker,
  createNowGrid,
} from "./renderer.js";
import { EventSoA, GenerationRing } from "./spacetime.js";
import { bindUI } from "./ui.js";

const canvas = document.getElementById("view");
const hudEl = document.getElementById("hud-stats");
const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = `v${VERSION}`;

const coarse = window.matchMedia("(pointer: coarse)").matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !coarse,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setClearColor(COLOR.bg, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLOR.bg, 48, 160);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
camera.position.set(22, 16, 28);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 6;
controls.maxDistance = 160;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI - 0.08;
controls.target.set(0, -6, 0);
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

scene.add(new THREE.HemisphereLight(0xb8c8e0, 0x0a0e13, 0.72));
const key = new THREE.DirectionalLight(0xffe6c0, 0.9);
key.position.set(18, 32, 22);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88ddff, 0.22);
fill.position.set(-20, 8, -12);
scene.add(fill);

const soa = new EventSoA(DEFAULTS.maxInstances);
const cubes = new CubeRenderer(scene, {
  maxCount: DEFAULTS.maxInstances,
  cellSize: DEFAULTS.cellSize,
});
const playfield = new FocusFrame(scene);
const hover = createHoverMarker(DEFAULTS.cellSize);
scene.add(hover);

let world;
let ring;
let focusSurface;
let nowGrid;
let playing = true;
let editing = false;
let gensPerSec = DEFAULTS.gensPerSec;
let decay = DEFAULTS.decay;
let historyLen = DEFAULTS.history;
let gridBrightness = DEFAULTS.gridBrightness;
let stabMode = DEFAULTS.stabMode;
let focusBack = 0;
let acc = 0;
let lastStepAt = 0;
let measuredGps = 0;
let gpsWindow = 0;
let gpsSteps = 0;
let pointerDown = null;

const clock = new FrameClock();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

const ui = bindUI({
  togglePlay,
  toggleEdit,
  step: () => {
    playing = false;
    ui.setPlaying(false);
    stepOnce();
    updateHint();
  },
  reset: () => bootWorld(false),
  rebuild: () => bootWorld(true),
  speed: () => {
    gensPerSec = ui.getConfig().gensPerSec;
  },
  decay: () => {
    decay = ui.getConfig().decay;
  },
  gridBrightness: () => {
    gridBrightness = ui.getConfig().gridBrightness;
    applyGridLook();
  },
  history: () => {
    historyLen = ui.getConfig().history;
    applyFocus(focusBack);
  },
  focus: () => {
    applyFocus(ui.getConfig().focusBack);
  },
  focusNow: () => applyFocus(0),
  stabMode: () => {
    stabMode = ui.getConfig().stabMode;
  },
});

function tFocus() {
  return focusGeneration(world.generation, focusBack);
}

function maxFocusBack() {
  return Math.min(world.generation, historyLen);
}

function applyFocus(back) {
  focusBack = clampFocusBack(back, world.generation, historyLen);
  ui.setFocus(focusBack, maxFocusBack());
  updateHint();
}

function setLineOpacity(obj, opacity) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) {
    m.transparent = true;
    m.opacity = opacity;
  }
}

function bootWorld(resizeGrid) {
  const cfg = ui.getConfig();
  gensPerSec = cfg.gensPerSec;
  decay = cfg.decay;
  historyLen = cfg.history;
  gridBrightness = cfg.gridBrightness;
  stabMode = cfg.stabMode;

  if (focusSurface) scene.remove(focusSurface);
  if (nowGrid) scene.remove(nowGrid);

  world = new ConwayWorld({
    width: cfg.width,
    height: cfg.height,
    wrap: cfg.wrap,
  });
  const rng = mulberry32(cfg.seed >>> 0);
  world.load(seedPattern(cfg.pattern, cfg.height, cfg.width, rng, DEFAULTS.density));

  ring = new GenerationRing(DEFAULTS.maxHistory, cfg.width * cfg.height);
  ring.pushGrid(world.grid, world.width, world.height, world.generation);

  focusSurface = createFocusSurface(cfg.width, cfg.height, DEFAULTS.cellSize);
  nowGrid = createNowGrid(cfg.width, cfg.height, DEFAULTS.cellSize);
  playfield.setSize(cfg.width, cfg.height, DEFAULTS.cellSize);
  scene.add(focusSurface);
  scene.add(nowGrid);

  acc = 0;
  applyFocus(0);
  if (resizeGrid) {
    const span = Math.max(cfg.width, cfg.height);
    camera.position.set(span * 0.7, span * 0.55, span * 0.9);
    controls.target.set(0, -Math.min(historyLen, span) * 0.2, 0);
  }
  ui.setPlaying(playing);
  ui.setEditing(editing);
  updateHint();
  syncVolume();
}

function togglePlay() {
  playing = !playing;
  if (playing) {
    editing = false;
    hover.visible = false;
    ui.setEditing(false);
  }
  ui.setPlaying(playing);
  updateHint();
}

function toggleEdit() {
  editing = !editing;
  if (editing) {
    playing = false;
    applyFocus(0);
    ui.setPlaying(false);
  } else {
    hover.visible = false;
  }
  ui.setEditing(editing);
  updateHint();
}

function applyGridLook() {
  const b = Math.min(1, Math.max(0, gridBrightness));
  if (nowGrid) setLineOpacity(nowGrid, 0.04 + b * 0.82);
  if (focusSurface) {
    focusSurface.material.opacity = 0.02 + b * 0.14;
  }
}

function updateHint() {
  const atNow = focusBack === 0;
  if (editing && atNow) {
    ui.setHint("Edit — tap a cell inside the frame · drag to orbit");
  } else if (editing && !atNow) {
    ui.setHint("Focus is in the past — Now, then tap to paint");
  } else if (playing) {
    ui.setHint("Orbit · Shift+wheel scrubs time · two-finger pan");
  } else {
    ui.setHint("Paused — Focus slider walks generations · Edit to paint");
  }
  applyGridLook();
  playfield.setEditing(editing);
}

function stepOnce() {
  world.step();
  ring.pushGrid(world.grid, world.width, world.height, world.generation);
  applyFocus(focusBack);
  const now = performance.now();
  if (lastStepAt) {
    gpsSteps += 1;
    gpsWindow += (now - lastStepAt) / 1000;
    if (gpsWindow >= 0.4) {
      measuredGps = gpsSteps / gpsWindow;
      gpsSteps = 0;
      gpsWindow = 0;
    }
  }
  lastStepAt = now;
}

function syncVolume() {
  ring.fillSoA(soa, world.generation, historyLen, world.width, {
    tFocus: tFocus(),
    stabMode,
    height: world.height,
    wrap: world.wrap,
  });
  cubes.setEvents(soa, {
    tFocus: tFocus(),
    decay,
    timeScale: DEFAULTS.timeScale,
    width: world.width,
    height: world.height,
    history: historyLen,
    stabMode,
    cellSize: DEFAULTS.cellSize,
  });
}

function hitCell(event) {
  if (!focusSurface) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(focusSurface);
  if (!hits.length) return null;
  const p = hits[0].point;
  const ox = (world.width - 1) * 0.5;
  const oz = (world.height - 1) * 0.5;
  const x = Math.round(p.x / DEFAULTS.cellSize + ox);
  const y = Math.round(p.z / DEFAULTS.cellSize + oz);
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  return { x, y };
}

function paintAt(event) {
  if (!editing || focusBack !== 0) return;
  const cell = hitCell(event);
  if (!cell) return;
  if (world.toggle(cell.x, cell.y)) {
    ring.replaceGrid(world.grid, world.width, world.height, world.generation);
  }
}

function updateHover(event) {
  if (!editing || focusBack !== 0) {
    hover.visible = false;
    return;
  }
  const cell = hitCell(event);
  if (!cell) {
    hover.visible = false;
    return;
  }
  const ox = (world.width - 1) * 0.5;
  const oz = (world.height - 1) * 0.5;
  hover.position.set(
    (cell.x - ox) * DEFAULTS.cellSize,
    0.08,
    (cell.y - oz) * DEFAULTS.cellSize,
  );
  hover.visible = true;
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  pointerDown = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", (e) => {
  if (editing) updateHover(e);
});
window.addEventListener("pointerup", (e) => {
  if (!pointerDown) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  pointerDown = null;
  if (dx * dx + dy * dy > 36) return;
  if (e.target !== canvas) return;
  paintAt(e);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const dir = Math.sign(e.deltaY) || 1;
    applyFocus(focusBack + dir);
  },
  { capture: true, passive: false },
);

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea, button")) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "KeyE") {
    toggleEdit();
  } else if (e.code === "Period" || e.code === "KeyN") {
    playing = false;
    ui.setPlaying(false);
    stepOnce();
    updateHint();
  } else if (e.code === "BracketLeft" || e.code === "ArrowDown") {
    applyFocus(focusBack + 1);
  } else if (e.code === "BracketRight" || e.code === "ArrowUp") {
    applyFocus(focusBack - 1);
  } else if (e.code === "Home") {
    applyFocus(0);
  } else if (e.code === "KeyR") {
    bootWorld(false);
  }
});

window.addEventListener("resize", resize);

function frame(now) {
  const dt = clock.tick(now);
  if (playing) {
    acc += dt * gensPerSec;
    let steps = 0;
    while (acc >= 1 && steps < DEFAULTS.maxStepCatchUp) {
      acc -= 1;
      stepOnce();
      steps += 1;
    }
    if (acc > 1) acc = 1;
  } else {
    lastStepAt = 0;
  }

  syncVolume();
  controls.update();
  renderer.render(scene, camera);

  const foc = tFocus();
  hudEl.textContent = formatHud({
    generation: world.generation,
    focus: foc,
    live: ring.liveAt(foc),
    instances: cubes.count,
    truncated: soa.truncated,
    fps: clock.displayFps || 1000 / clock.emaMs,
    ms: clock.displayMs || clock.emaMs,
    gps: playing ? measuredGps || gensPerSec : 0,
    playing,
    editing,
  });

  requestAnimationFrame(frame);
}

resize();
bootWorld(true);
ui.setPlaying(playing);
requestAnimationFrame(frame);
