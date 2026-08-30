import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { COLOR, DEFAULTS, VERSION } from "./config.js";
import { ConwayWorld, countLive, seedPattern } from "./conway.js";
import { FrameClock, formatHud } from "./hud.js";
import { mulberry32 } from "./rng.js";
import { CubeRenderer, createNowGrid, createNowPlane } from "./renderer.js";
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
controls.target.set(0, -8, 0);
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

let world;
let ring;
let nowPlane;
let nowGrid;
let playing = true;
let gensPerSec = DEFAULTS.gensPerSec;
let decay = DEFAULTS.decay;
let historyLen = DEFAULTS.history;
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
  history: () => {
    historyLen = ui.getConfig().history;
  },
});

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

  if (nowPlane) scene.remove(nowPlane);
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

  nowPlane = createNowPlane(cfg.width, cfg.height, DEFAULTS.cellSize);
  nowGrid = createNowGrid(cfg.width, cfg.height, DEFAULTS.cellSize);
  scene.add(nowPlane);
  scene.add(nowGrid);

  acc = 0;
  if (resizeGrid) {
    const span = Math.max(cfg.width, cfg.height);
    camera.position.set(span * 0.7, span * 0.55, span * 0.9);
    controls.target.set(0, -Math.min(historyLen, span) * 0.25, 0);
  }
  ui.setPlaying(playing);
  updateHint();
  syncVolume();
}

function togglePlay() {
  playing = !playing;
  ui.setPlaying(playing);
  updateHint();
}

function updateHint() {
  ui.setHint(
    playing
      ? "Orbit · pinch zoom · two-finger pan"
      : "Paused — tap the now-plane to toggle a cell",
  );
  if (nowGrid) setLineOpacity(nowGrid, playing ? 0.22 : 0.5);
}

function stepOnce() {
  world.step();
  ring.pushGrid(world.grid, world.width, world.height, world.generation);
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
  ring.fillSoA(soa, world.generation, historyLen);
  cubes.setEvents(soa, {
    tRef: world.generation,
    decay,
    timeScale: DEFAULTS.timeScale,
    width: world.width,
    height: world.height,
    history: historyLen,
    cellSize: DEFAULTS.cellSize,
  });
}

function paintAt(event) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(nowPlane);
  if (!hits.length) return;
  const p = hits[0].point;
  const ox = (world.width - 1) * 0.5;
  const oz = (world.height - 1) * 0.5;
  const x = Math.round(p.x / DEFAULTS.cellSize + ox);
  const y = Math.round(p.z / DEFAULTS.cellSize + oz);
  if (world.toggle(x, y)) {
    ring.replaceGrid(world.grid, world.width, world.height, world.generation);
  }
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
window.addEventListener("pointerup", (e) => {
  if (!pointerDown) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  pointerDown = null;
  if (playing) return;
  if (dx * dx + dy * dy > 36) return;
  if (e.target !== canvas) return;
  paintAt(e);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea, button")) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.code === "Period" || e.code === "KeyN") {
    playing = false;
    ui.setPlaying(false);
    stepOnce();
    updateHint();
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

  hudEl.textContent = formatHud({
    generation: world.generation,
    live: countLive(world.grid),
    instances: cubes.count,
    truncated: soa.truncated,
    fps: clock.displayFps || 1000 / clock.emaMs,
    ms: clock.displayMs || clock.emaMs,
    gps: playing ? measuredGps || gensPerSec : 0,
    playing,
  });

  requestAnimationFrame(frame);
}

resize();
bootWorld(true);
ui.setPlaying(playing);
requestAnimationFrame(frame);
