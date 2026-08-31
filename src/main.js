import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { COLOR, DEFAULTS, VERSION } from "./config.js";
import {
  BENCH_PRESETS,
  PathTimer,
  formatBenchHud,
  formatGpuHud,
  inferBound,
  probeGpu,
} from "./bench.js";
import { ConwayWorld, gridsEqual, seedPattern } from "./conway.js";
import { countVolumeFromNpy } from "./count.js";
import { CONWAY_KIND_HEX, CONWAY_WARMUP_K, countKindHex, encodingCubeFill } from "./encoding.js";
import { focusGeneration } from "./focus.js";
import { drawSparkline, FrameClock, formatSourceHud, formatViewHud } from "./hud.js";
import { cellFromWorldXZ } from "./observe.js";
import { mulberry32 } from "./rng.js";
import {
  CubeRenderer,
  FocusFrame,
  HoverOutlines,
  IsolateBeacon,
  createFocusSurface,
  createNowGrid,
} from "./renderer.js";
import { CoordinateFrame, PlaneHairlines } from "./coords.js";
import {
  EventSoA,
  eventAt,
  GenerationRing,
  fadePastSpan,
  visibleTimeSpan,
} from "./spacetime.js";
import { clampSlab, slabGenerations } from "./axes.js";
import {
  fitOrbitDistance,
  pinOrbitToAxis,
  placeOnViewRay,
  playfieldHalfExtent,
  slabYRange,
  volumeRadius,
} from "./orbit.js";
import { bindUI } from "./ui.js";
import {
  applyBirdAspect,
  createBirdCamera,
  enterBirdEye,
  exitBirdEye,
  fitBirdFrustum,
} from "./view.js";
import {
  XR_BOARD_METERS,
  XR_MAG_DEFAULT,
  arBottomLift,
  clampArMag,
  isImmersiveArSupported,
  requestImmersiveAr,
  requestViewerHitTestSource,
  viewerFrontPosition,
  xrStageScale,
} from "./xr.js";

const canvas = document.getElementById("view");
const hudViewEl = document.getElementById("hud-view");
const hudSrcEl = document.getElementById("hud-src");
const hudSparkEl = document.getElementById("hud-spark");
const hudBenchEl = document.getElementById("hud-bench");
const hudGpuEl = document.getElementById("hud-gpu");
const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = `v${VERSION}`;

const coarse = window.matchMedia("(pointer: coarse)").matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !coarse,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setClearColor(COLOR.bg, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const fog = new THREE.Fog(COLOR.bg, 48, 160);
scene.fog = fog;
const stage = new THREE.Group();
stage.name = "stage";
scene.add(stage);
const reticle = createArReticle();
scene.add(reticle);
const xrSelect = renderer.xr.getController(0);
xrSelect.addEventListener("select", onArSelect);
scene.add(xrSelect);
const _xrPos = new THREE.Vector3();
const _xrQuat = new THREE.Quaternion();
const _xrScale = new THREE.Vector3();
const _xrUp = new THREE.Vector3();
const arAnchorPos = new THREE.Vector3();
const arAnchorQuat = new THREE.Quaternion();
const _hitLocal = new THREE.Vector3();

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
camera.position.set(22, 16, 28);
const birdCam = createBirdCamera();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 6;
controls.maxDistance = 160;
controls.enablePan = false;
controls.minZoom = 0.35;
controls.maxZoom = 8;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI - 0.08;
controls.target.set(0, -6, 0);
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x0a0e13, 0.72);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe6c0, 0.9);
key.position.set(18, 32, 22);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88ddff, 0.22);
fill.position.set(-20, 8, -12);
scene.add(fill);

const soa = new EventSoA(DEFAULTS.maxInstances);
const cubes = new CubeRenderer(stage, {
  maxCount: DEFAULTS.maxInstances,
  cellSize: DEFAULTS.cellSize,
});
const playfield = new FocusFrame(stage, COLOR.cyan);
const clipNearFrame = new FocusFrame(stage, COLOR.gold);
const clipFarFrame = new FocusFrame(stage, COLOR.gold);
clipNearFrame.setVisible(false);
clipFarFrame.setVisible(false);
const axes = new CoordinateFrame(stage);
const hairlines = new PlaneHairlines(stage);
const beacon = new IsolateBeacon(stage, DEFAULTS.cellSize);
const hover = new HoverOutlines(stage, DEFAULTS.cellSize);

let world;
let ring;
let tape;
let tapeMode = false;
let sourceId = "conway";
let countVol = null;
let countSizeByCount = false;
let focusSurface;
let nowGrid;
let playing = false;
let editing = false;
let birdEye = false;
let gensPerSec = DEFAULTS.gensPerSec;
let decay = DEFAULTS.decay;
let historyLen = DEFAULTS.history;
let gridBrightness = DEFAULTS.gridBrightness;
let stabMode = DEFAULTS.stabMode;
let dynamicsOn = DEFAULTS.dynamics;
let neighborhoodRadius = DEFAULTS.neighborhoodRadius;
let stabScaleOn = DEFAULTS.stabScale;
let encodingMinimal = DEFAULTS.encodingMinimal;
let forceFullRebuild = DEFAULTS.forceFullRebuild;
let focusBack = 0;
let clipNearBack = 0;
let clipFarBack = 0;
let acc = 0;
let lastStepAt = 0;
let measuredGps = 0;
let gpsWindow = 0;
let gpsSteps = 0;
let pointerDown = null;
let hoverCell = null;
let hoverKey = "";
let dirtySource = true;
let dirtyView = true;
let dirtyEncoding = true;
let lastWork = "soa";
let lastSpanKey = "";
let stableStreak = 0;
let stoppedStable = false;
let prevGrid = new Uint8Array(0);
let arPlacePending = false;
let arHitTestSource = null;
let arPlaced = false;
let arUseHitTest = false;
let arAnchored = false;
let arLocked = false;
let arMag = XR_MAG_DEFAULT;

const clock = new FrameClock();
const paths = new PathTimer();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let gpuInfo = null;

const ui = bindUI({
  togglePlay,
  toggleEdit,
  toggleBird,
  fitVolume,
  step: () => {
    if (sourceId === "count") {
      playing = false;
      ui.setPlaying(false);
      stepCountPlayhead();
      updateHint();
      return;
    }
    if (tapeMode) return;
    enterInspect();
    stepOnce();
    updateHint();
  },
  reset: () => (sourceId === "count" ? applyFocus(0) : bootWorld(false)),
  rebuild: () => bootWorld(true),
  speed: () => {
    gensPerSec = ui.getConfig().gensPerSec;
  },
  decay: () => {
    decay = ui.getConfig().decay;
    dirtyView = true;
  },
  gridBrightness: () => {
    gridBrightness = ui.getConfig().gridBrightness;
    applyGridLook();
  },
  history: () => applyRingCapacity(),
  focus: () => {
    const cfg = ui.getConfig();
    enterInspect();
    clipNearBack = cfg.clipNearBack;
    clipFarBack = cfg.clipFarBack;
    applyFocus(cfg.focusBack);
  },
  focusNow: () => {
    if (playing) return;
    clipNearBack = 0;
    applyFocus(0);
  },
  stabMode: () => {
    stabMode = ui.getConfig().stabMode;
    dirtyEncoding = true;
  },
  benchFlags: () => {
    const cfg = ui.getConfig();
    dynamicsOn = cfg.dynamics;
    neighborhoodRadius = cfg.neighborhoodRadius;
    stabScaleOn = cfg.stabScale;
    encodingMinimal = cfg.encodingMinimal;
    forceFullRebuild = cfg.forceFullRebuild;
    dirtyEncoding = true;
  },
  preset: () => {
    const id = ui.getConfig().preset;
    const p = BENCH_PRESETS.find((x) => x.id === id);
    if (!p) return;
    playing = true;
    editing = false;
    ui.setPlaying(true);
    ui.setEditing(false);
    ui.applyPreset(p);
    tapeMode = false;
    bootWorld(true);
  },
  sourceKind: () => {
    switchSource(ui.getConfig().sourceKind);
  },
  countDemo: () => {
    loadCountDemo();
  },
  countFile: (file) => {
    loadCountFromFile(file);
  },
  countSize: () => {
    countSizeByCount = ui.getConfig().countSize;
    dirtyEncoding = true;
  },
  enterAr,
  exitAr,
  arMag: () => {
    arMag = clampArMag(ui.getArMag());
    applyArStagePose();
  },
});

function activeCamera() {
  return birdEye ? birdCam : camera;
}

function arPillar() {
  return arPresenting() && Boolean(tape);
}

function viewNow() {
  return (tapeMode || arPillar()) && tape ? tape.newestT() : world.generation;
}

function viewStore() {
  return (tapeMode || arPillar()) && tape ? tape : ring;
}

function tFocus() {
  return focusGeneration(viewNow(), focusBack);
}

function inspectMode() {
  return Boolean(tapeMode && tape);
}

function volumeSpan() {
  if (inspectMode()) {
    const { tLo, tHi } = slabGenerations(viewNow(), clipNearBack, clipFarBack);
    const oldest = viewStore().oldestT();
    const newest = viewNow();
    return {
      tLo: Math.max(oldest, Math.min(tLo, tHi)),
      tHi: Math.min(newest, Math.max(tLo, tHi)),
    };
  }
  if (arPillar()) {
    return { tLo: tape.oldestT(), tHi: viewNow() };
  }
  return visibleTimeSpan(
    tFocus(),
    viewNow(),
    viewStore().oldestT(),
    historyLen,
  );
}

function volumeWindow() {
  if (inspectMode() || arPillar()) {
    const span = volumeSpan();
    return Math.max(1, span.tHi - span.tLo + 1);
  }
  return Math.max(1, historyLen);
}

function maxFocusBack() {
  if (inspectMode()) return Math.max(0, tape.newestT() - tape.oldestT());
  return Math.min(world.generation, historyLen);
}

function createArReticle() {
  const group = new THREE.Group();
  group.name = "ar-reticle";
  group.matrixAutoUpdate = false;
  group.visible = false;
  const hw = XR_BOARD_METERS * 0.5;
  const square = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, 0.002, -hw),
    new THREE.Vector3(hw, 0.002, -hw),
    new THREE.Vector3(hw, 0.002, hw),
    new THREE.Vector3(-hw, 0.002, hw),
  ]);
  const loop = new THREE.LineLoop(
    square,
    new THREE.LineBasicMaterial({
      color: COLOR.gold,
      depthWrite: false,
    }),
  );
  loop.frustumCulled = false;
  loop.renderOrder = 10;
  group.add(loop);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.028, 0.042, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: COLOR.cyan,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    }),
  );
  ring.position.y = 0.003;
  ring.renderOrder = 11;
  group.add(ring);
  return group;
}

function arPresenting() {
  return renderer.xr.isPresenting;
}

function resetStageOrbit() {
  stage.position.set(0, 0, 0);
  stage.quaternion.identity();
  stage.scale.setScalar(1);
  stage.visible = true;
}

function stopHitTest() {
  if (arHitTestSource && typeof arHitTestSource.cancel === "function") {
    arHitTestSource.cancel();
  }
  arHitTestSource = null;
  arUseHitTest = false;
  arPlaced = false;
  arAnchored = false;
  arLocked = false;
  reticle.visible = false;
}

/** Oldest slice of the full pillar, not the live wake or a clipped slab. */
function arPillarYMin() {
  const store = viewStore();
  if (!store) return 0;
  return slabYRange(tFocus(), store.oldestT(), viewNow(), DEFAULTS.timeScale).yMin;
}

function applyArStagePose() {
  if (!arPresenting() || !arAnchored || !world) return;
  const s = xrStageScale(DEFAULTS.cellSize, arMag);
  stage.quaternion.copy(arAnchorQuat);
  stage.scale.setScalar(s);
  const lift = arBottomLift(arPillarYMin(), s);
  _xrUp.set(0, 1, 0).applyQuaternion(arAnchorQuat);
  stage.position.copy(arAnchorPos).addScaledVector(_xrUp, lift);
  stage.visible = true;
}

function placeStageInFrontOfViewer() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.updateMatrixWorld();
  cam.getWorldPosition(_xrPos);
  cam.getWorldQuaternion(_xrQuat);
  const front = viewerFrontPosition(
    { x: _xrPos.x, y: _xrPos.y, z: _xrPos.z },
    { x: _xrQuat.x, y: _xrQuat.y, z: _xrQuat.z, w: _xrQuat.w },
  );
  arAnchorPos.set(front.x, front.y, front.z);
  arAnchorQuat.identity();
  arAnchored = true;
  arPlaced = true;
  arLocked = true;
  applyArStagePose();
}

function placeStageFromReticle() {
  if (arLocked || !reticle.visible) return;
  reticle.matrix.decompose(arAnchorPos, arAnchorQuat, _xrScale);
  arAnchored = true;
  arPlaced = true;
  arLocked = true;
  reticle.visible = false;
  applyArStagePose();
  updateHint();
}

function onArSelect() {
  if (!arPresenting() || !arUseHitTest || arLocked) return;
  placeStageFromReticle();
}

function updateReticle(xrFrame) {
  if (!arPresenting() || !arUseHitTest || !arHitTestSource || !xrFrame || arLocked) {
    reticle.visible = false;
    return;
  }
  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace || typeof xrFrame.getHitTestResults !== "function") {
    reticle.visible = false;
    return;
  }
  const hits = xrFrame.getHitTestResults(arHitTestSource);
  if (!hits.length) {
    reticle.visible = false;
    return;
  }
  const pose = hits[0].getPose(refSpace);
  if (!pose) {
    reticle.visible = false;
    return;
  }
  reticle.visible = true;
  reticle.matrix.fromArray(pose.transform.matrix);
}

async function enterAr() {
  if (arPresenting()) return;
  if (birdEye) toggleBird();
  const xr = navigator.xr;
  if (!(await isImmersiveArSupported(xr))) return;
  const overlay = document.getElementById("xr-overlay") || document.body;
  try {
    const session = await requestImmersiveAr(xr, overlay);
    await renderer.xr.setSession(session);
  } catch (err) {
    console.warn("WebXR session failed", err);
  }
}

function exitAr() {
  const session = renderer.xr.getSession();
  if (session) session.end();
}

async function onArSessionStart() {
  document.documentElement.classList.add("is-ar");
  document.body.classList.add("is-ar");
  renderer.setClearAlpha(0);
  controls.enabled = false;
  arPlacePending = false;
  arPlaced = false;
  arLocked = false;
  arUseHitTest = false;
  stage.visible = false;
  reticle.visible = false;
  const session = renderer.xr.getSession();
  arHitTestSource = await requestViewerHitTestSource(session);
  arUseHitTest = Boolean(arHitTestSource);
  if (!arUseHitTest) {
    arPlacePending = true;
    stage.visible = true;
  }
  dirtySource = true;
  dirtyView = true;
  syncFog();
  ui.setArActive(true);
  updateHint();
}

function onArSessionEnd() {
  document.documentElement.classList.remove("is-ar");
  document.body.classList.remove("is-ar");
  renderer.setClearAlpha(1);
  controls.enabled = true;
  arPlacePending = false;
  stopHitTest();
  resetStageOrbit();
  dirtySource = true;
  dirtyView = true;
  syncFog();
  pinOrbitPivot();
  ui.setArActive(false);
  updateHint();
}

function syncFog() {
  const inspect = inspectMode();
  const ar = arPresenting();
  scene.fog = birdEye || inspect || ar ? null : fog;
  hemi.intensity = inspect || ar ? 1.08 : 0.72;
  key.intensity = inspect || ar ? 1.05 : 0.9;
}

function syncViewRange() {
  if (inspectMode() && tape) {
    const h = Math.max(24, (tape.newestT() - tape.oldestT() + 1) * DEFAULTS.timeScale);
    controls.maxDistance = Math.min(2400, Math.max(220, h * 1.85));
    camera.far = Math.max(400, controls.maxDistance * 2.4);
  } else {
    controls.maxDistance = 160;
    camera.far = 400;
  }
  camera.updateProjectionMatrix();
}

/** Depth: grow the wake ring, do not reset Conway. Tape stays as recorded. */
function applyRingCapacity() {
  const cfg = ui.getConfig();
  historyLen = cfg.history;
  if (ring && ring.capacity !== historyLen) ring.resize(historyLen);
  applyFocus(focusBack);
  syncBeacon();
  dirtySource = true;
}

function currentSlabY() {
  const span = volumeSpan();
  return slabYRange(tFocus(), span.tLo, span.tHi, DEFAULTS.timeScale);
}

function pinOrbitPivot() {
  if (arPresenting() || birdEye || !world) return;
  const { yMid } = currentSlabY();
  if (!Number.isFinite(yMid)) return;
  if (!Number.isFinite(camera.position.x)) {
    camera.position.set(22, 16, 28);
    controls.target.set(0, 0, 0);
  }
  const pinned = pinOrbitToAxis(camera.position, controls.target, yMid);
  if (!Number.isFinite(pinned.cam.x) || !Number.isFinite(pinned.target.y)) return;
  camera.position.set(pinned.cam.x, pinned.cam.y, pinned.cam.z);
  controls.target.set(pinned.target.x, pinned.target.y, pinned.target.z);
  camera.lookAt(controls.target);
}

function fitVolume() {
  if (!world || arPresenting()) return;
  if (birdEye) {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    fitBirdFrustum(birdCam, world.width, world.height, DEFAULTS.cellSize, aspect);
    return;
  }
  const { yMin, yMax, yMid } = currentSlabY();
  const { hx, hz } = playfieldHalfExtent(world.width, world.height, DEFAULTS.cellSize);
  const radius = volumeRadius(hx, hz, yMin, yMax);
  const dist = fitOrbitDistance(camera.fov, radius, 1.28);
  controls.target.set(0, yMid, 0);
  const pos = placeOnViewRay(camera.position, controls.target, dist);
  camera.position.set(pos.x, pos.y, pos.z);
  controls.maxDistance = Math.min(2400, Math.max(controls.maxDistance, dist * 1.4, 220));
  camera.far = Math.max(camera.far, dist + radius * 3, 400);
  camera.updateProjectionMatrix();
  pinOrbitPivot();
  controls.update();
}

function applyFocus(back) {
  const live = playing && !tapeMode;
  const max = live ? 0 : maxFocusBack();
  const now = viewNow();
  const slab = live
    ? { topBack: 0, focusBack: 0, botBack: 0 }
    : clampSlab(clipNearBack, back, clipFarBack, max, "focus");
  clipNearBack = slab.topBack;
  clipFarBack = slab.botBack;
  focusBack = live ? 0 : slab.focusBack;
  ui.setFocus(focusBack, max, tFocus(), now - max, live, clipNearBack, clipFarBack);
  syncClipPlanes();
  pinOrbitPivot();
  updateHint();
  dirtyView = true;
  if (stabScaleOn && stabMode === "focus") dirtyEncoding = true;
}

function enterInspect() {
  if (tapeMode && !playing) return;
  playing = false;
  tapeMode = true;
  clipNearBack = 0;
  clipFarBack = maxFocusBack();
  ui.setPlaying(false);
  dirtySource = true;
  syncCacheUi();
  syncFog();
  syncViewRange();
}

function enterLive() {
  tapeMode = false;
  playing = true;
  editing = false;
  stoppedStable = false;
  acc = 0;
  clipNearBack = 0;
  clipFarBack = 0;
  clearHover();
  applyFocus(0);
  ui.setPlaying(true);
  ui.setEditing(false);
  dirtySource = true;
  syncFog();
  syncViewRange();
}

function syncCacheUi() {
  if (!tape) return;
  ui.setCache({
    gens: tape.size,
    events: tape.eventCount,
    full: tape.stopped,
    inspect: tapeMode,
    atNow: focusBack === 0,
    tick: sourceId === "count" ? "t" : "gen",
    source: sourceId,
  });
}

function setLineOpacity(obj, opacity) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) {
    m.transparent = true;
    m.opacity = opacity;
  }
}

function syncBeacon() {
  beacon.setCell(
    null,
    world.width,
    world.height,
    DEFAULTS.cellSize,
    volumeWindow(),
    DEFAULTS.timeScale,
  );
}

function layoutPlayfield(width, height) {
  if (focusSurface) stage.remove(focusSurface);
  if (nowGrid) stage.remove(nowGrid);
  focusSurface = createFocusSurface(width, height, DEFAULTS.cellSize);
  nowGrid = createNowGrid(width, height, DEFAULTS.cellSize);
  playfield.setSize(width, height, DEFAULTS.cellSize);
  clipNearFrame.setSize(width, height, DEFAULTS.cellSize);
  clipFarFrame.setSize(width, height, DEFAULTS.cellSize);
  axes.setSize(width, height, DEFAULTS.cellSize);
  stage.add(focusSurface);
  stage.add(nowGrid);
  if (hoverCell && (hoverCell.x >= width || hoverCell.y >= height)) {
    hoverCell = null;
  }
}

function countWorld(vol) {
  return {
    width: vol.width,
    height: vol.height,
    generation: vol.newestT(),
    wrap: false,
    grid: new Uint8Array(0),
    step() {},
    toggle() {
      return false;
    },
  };
}

function stabForFill() {
  if (sourceId === "count") return countSizeByCount ? "time" : "none";
  return stabScaleOn ? stabMode : "none";
}

function encodingWarmupK() {
  return sourceId === "count" ? -1 : CONWAY_WARMUP_K;
}

function markGps() {
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

function stepCountPlayhead() {
  const max = maxFocusBack();
  if (max <= 0) return;
  if (focusBack <= 0) applyFocus(max);
  else applyFocus(focusBack - 1);
  markGps();
}

function bootCount(vol) {
  sourceId = "count";
  countVol = vol;
  countSizeByCount = ui.getConfig().countSize;
  gensPerSec = ui.getConfig().gensPerSec;
  decay = ui.getConfig().decay;
  historyLen = ui.getConfig().history;
  gridBrightness = ui.getConfig().gridBrightness;
  encodingMinimal = ui.getConfig().encodingMinimal;
  forceFullRebuild = ui.getConfig().forceFullRebuild;
  playing = false;
  editing = false;
  tapeMode = true;
  stoppedStable = false;
  world = countWorld(vol);
  ring = null;
  tape = vol;
  layoutPlayfield(vol.width, vol.height);
  cubes.setKindHex(countKindHex(vol.ceiling), -1);
  ui.setSourceKind("count");
  ui.setCountLegend(vol.ceiling);
  ui.setCountMeta(
    `${vol.name} · ${vol.nT} × ${vol.height} × ${vol.width} · max ${vol.ceiling} · ${vol.count} voxels`,
  );
  acc = 0;
  clipNearBack = 0;
  clipFarBack = Math.max(0, vol.newestT() - vol.oldestT());
  applyFocus(0);
  syncFog();
  syncViewRange();
  const span = Math.max(vol.width, vol.height);
  camera.position.set(span * 0.55, Math.max(24, vol.nT * 0.45), span * 0.7);
  controls.target.set(0, -Math.min(vol.nT, span) * 0.15, 0);
  if (birdEye) {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    fitBirdFrustum(birdCam, vol.width, vol.height, DEFAULTS.cellSize, aspect);
  }
  pinOrbitPivot();
  ui.setPlaying(false);
  ui.setEditing(false);
  ui.setBird(birdEye);
  syncBeacon();
  lastSpanKey = "";
  hoverKey = "";
  dirtySource = true;
  dirtyView = true;
  dirtyEncoding = true;
  paths.reset();
  clock.reset();
  fillAndUpload();
  syncCacheUi();
  fitVolume();
  updateHint();
}

async function loadCountFromUrl(url, name) {
  ui.setSourceKind("count");
  ui.setCountHint(`Loading ${name}…`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = await res.arrayBuffer();
    bootCount(countVolumeFromNpy(buf, name));
    ui.setCountHint("EVT count cube (T × H × W). Integer events per pixel per Δt.");
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    ui.setCountHint(`Could not load ${name}. Use Load .npy (${msg}).`);
    if (!countVol) {
      ui.setSourceKind("conway");
      sourceId = "conway";
    }
    updateHint();
  }
}

function loadCountDemo() {
  return loadCountFromUrl(DEFAULTS.countDemoUrl, DEFAULTS.countDemoName);
}

async function loadCountFromFile(file) {
  ui.setCountHint(`Loading ${file.name}…`);
  try {
    const buf = await file.arrayBuffer();
    const name = String(file.name || "count").replace(/\.npy$/i, "");
    bootCount(countVolumeFromNpy(buf, name));
    ui.setCountHint("EVT count cube (T × H × W). Integer events per pixel per Δt.");
  } catch (err) {
    ui.setCountHint(err && err.message ? err.message : String(err));
    updateHint();
  }
}

function switchSource(kind) {
  if (kind === "count") {
    if (countVol) bootCount(countVol);
    else loadCountDemo();
    return;
  }
  bootWorld(true);
}

function bootWorld(resizeGrid) {
  const cfg = ui.getConfig();
  sourceId = "conway";
  gensPerSec = cfg.gensPerSec;
  decay = cfg.decay;
  historyLen = cfg.history;
  gridBrightness = cfg.gridBrightness;
  stabMode = cfg.stabMode;
  dynamicsOn = cfg.dynamics;
  neighborhoodRadius = cfg.neighborhoodRadius;
  stabScaleOn = cfg.stabScale;
  encodingMinimal = cfg.encodingMinimal;
  forceFullRebuild = cfg.forceFullRebuild;
  tapeMode = !playing;

  world = new ConwayWorld({
    width: cfg.width,
    height: cfg.height,
    wrap: cfg.wrap,
  });
  const rng = mulberry32(cfg.seed >>> 0);
  world.load(seedPattern(cfg.pattern, world.height, world.width, rng, DEFAULTS.density));

  ring = new GenerationRing(historyLen, cfg.width * cfg.height);
  tape = new GenerationRing(64, cfg.width * cfg.height, {
    appendOnly: true,
    maxCapacity: DEFAULTS.maxTapeSlices,
    maxEvents: DEFAULTS.maxTapeEvents,
  });
  ring.pushGrid(world.grid, world.width, world.height, world.generation);
  tape.pushGrid(world.grid, world.width, world.height, world.generation);
  layoutPlayfield(cfg.width, cfg.height);
  cubes.setKindHex(CONWAY_KIND_HEX, CONWAY_WARMUP_K);
  ui.setSourceKind("conway");

  acc = 0;
  stableStreak = 0;
  stoppedStable = false;
  clipNearBack = 0;
  clipFarBack = tapeMode ? Math.max(0, tape.newestT() - tape.oldestT()) : 0;
  applyFocus(0);
  syncFog();
  syncViewRange();
  if (resizeGrid) {
    const span = Math.max(cfg.width, cfg.height);
    camera.position.set(span * 0.7, span * 0.55, span * 0.9);
    controls.target.set(0, -Math.min(historyLen, span) * 0.2, 0);
    if (birdEye) {
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      fitBirdFrustum(birdCam, cfg.width, cfg.height, DEFAULTS.cellSize, aspect);
    }
  }
  pinOrbitPivot();
  ui.setPlaying(playing);
  ui.setEditing(editing);
  ui.setBird(birdEye);
  syncBeacon();
  lastSpanKey = "";
  hoverKey = "";
  dirtySource = true;
  dirtyView = true;
  dirtyEncoding = true;
  paths.reset();
  clock.reset();
  fillAndUpload();
  syncCacheUi();
  updateHint();
}

function togglePlay() {
  if (sourceId === "count") {
    if (playing) {
      playing = false;
      ui.setPlaying(false);
    } else {
      playing = true;
      ui.setPlaying(true);
      if (focusBack === 0) applyFocus(maxFocusBack());
    }
    updateHint();
    return;
  }
  if (playing) {
    editing = false;
    ui.setEditing(false);
    enterInspect();
    applyFocus(0);
  } else {
    enterLive();
  }
  syncCacheUi();
  updateHint();
}

function toggleEdit() {
  if (sourceId === "count") return;
  if (tapeMode && focusBack !== 0) return;
  if (playing) {
    enterInspect();
    applyFocus(0);
  }
  editing = !editing;
  if (editing) {
    applyFocus(0);
    ui.setPlaying(false);
  }
  ui.setEditing(editing);
  updateHint();
}

function toggleBird() {
  if (arPresenting()) return;
  birdEye = !birdEye;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  if (birdEye) {
    enterBirdEye({
      persp: camera,
      bird: birdCam,
      controls,
      width: world.width,
      height: world.height,
      cellSize: DEFAULTS.cellSize,
      aspect,
    });
  } else {
    exitBirdEye({ persp: camera, controls });
    pinOrbitPivot();
  }
  controls.enablePan = birdEye;
  syncFog();
  ui.setBird(birdEye);
  dirtyView = true;
  updateHint();
}

function applyGridLook() {
  const b = Math.min(1, Math.max(0, gridBrightness));
  if (nowGrid) setLineOpacity(nowGrid, 0.04 + b * 0.82);
  if (focusSurface) {
    focusSurface.material.opacity = 0.02 + b * 0.14;
  }
}

function syncClipPlanes() {
  const inspect = inspectMode();
  const ts = DEFAULTS.timeScale;
  const showNear = inspect && clipNearBack !== focusBack;
  const showFar = inspect && clipFarBack !== focusBack;
  clipNearFrame.setVisible(showNear);
  clipFarFrame.setVisible(showFar);
  if (showNear) clipNearFrame.setY((focusBack - clipNearBack) * ts);
  if (showFar) clipFarFrame.setY((focusBack - clipFarBack) * ts);
}

function updateHint() {
  const atNow = focusBack === 0;
  if (arPresenting()) {
    if (arUseHitTest && !arPlaced) {
      ui.setHint("AR — point at a table until the gold square appears, then tap");
    } else if (arUseHitTest) {
      ui.setHint("AR — pillar at 0 · Play grows up from the table · Exit returns to orbit");
    } else {
      ui.setHint("AR — volume is world-locked in front of you · Exit returns to orbit");
    }
  } else if (sourceId === "count") {
    ui.setHint(
      playing
        ? "Count stack — Play scrubs Z through the recording · Pause to inspect"
        : "Count stack — cyan plane · gold cuts · Play scrubs Z · Load another .npy in Source",
    );
  } else if (tapeMode && stoppedStable) {
    ui.setHint(
      `Inspect — still for ${DEFAULTS.stableHold} gens · cyan plane · gold cuts · Play is live`,
    );
  } else if (tapeMode) {
    ui.setHint("Inspect — cyan plane · gold rings are the cuts · Fit frames the slab · Play returns to live");
  } else if (editing && atNow) {
    ui.setHint("Edit — tap a cell inside the frame · drag to orbit");
  } else if (editing && !atNow) {
    ui.setHint("Focus is in the past — Now on the Z stack (or Home), then tap to paint");
  } else if (birdEye) {
    ui.setHint("Bird-eye — pan / pinch, Shift+wheel scrubs time · B to leave");
  } else if (playing && cubes.count > 20000) {
    ui.setHint(
      `INST ${cubes.count} — depth is filling; Pause to see GPU-only (soa now should be 0)`,
    );
  } else if (playing) {
    ui.setHint("Live — Pause to inspect the cache · orbit · pinch zoom");
  } else {
    ui.setHint("Inspect — cyan plane · gold rings are the cuts · Fit frames the slab · Play returns to live");
  }
  applyGridLook();
  playfield.setEditing(editing);
}

function maybeStopStable() {
  if (!playing || tapeMode) return;
  if (!ui.getConfig().stopWhenStable) return;
  if (stableStreak < DEFAULTS.stableHold) return;
  stoppedStable = true;
  enterInspect();
  applyFocus(0);
}

function stepOnce() {
  if (sourceId === "count") return;
  if (prevGrid.length !== world.grid.length) prevGrid = new Uint8Array(world.grid.length);
  prevGrid.set(world.grid);
  world.step();
  const changed = !gridsEqual(prevGrid, world.grid);
  ring.pushGrid(world.grid, world.width, world.height, world.generation);
  tape.pushGrid(world.grid, world.width, world.height, world.generation);
  applyFocus(focusBack);
  if (changed) {
    stableStreak = 0;
    stoppedStable = false;
  } else {
    stableStreak += 1;
    maybeStopStable();
  }
  markGps();
  dirtySource = true;
}

function fillVolume() {
  const store = viewStore();
  const span = inspectMode() || arPillar() ? volumeSpan() : null;
  store.fillSoA(soa, viewNow(), volumeWindow(), world.width, {
    tFocus: tFocus(),
    stabMode: stabForFill(),
    height: world.height,
    wrap: world.wrap,
    dynamics: dynamicsOn,
    neighborhoodRadius,
    stabScale: stabScaleOn,
    ...(span ? { tLo: span.tLo, tHi: span.tHi } : {}),
  });
}

function fadeSpan() {
  return fadePastSpan(tFocus(), volumeSpan().tLo);
}

function uploadInstances() {
  cubes.setEvents(soa, {
    tFocus: tFocus(),
    decay: arPresenting() ? false : decay,
    fadeSpan: fadeSpan(),
    timeScale: DEFAULTS.timeScale,
    width: world.width,
    height: world.height,
    history: volumeWindow(),
    stabMode: stabForFill(),
    cellSize: DEFAULTS.cellSize,
    isolate: null,
    sliceOnly: birdEye,
    encodingMinimal,
  });
}

function fillAndUpload() {
  paths.measure("soa", fillVolume);
  paths.measure("inst", uploadInstances);
  lastWork = "soa";
  dirtySource = false;
  dirtyView = false;
  dirtyEncoding = false;
  hoverKey = "";
}

function spanKey() {
  const span = volumeSpan();
  return `${span.tLo}:${span.tHi}`;
}

function syncVolume() {
  if (forceFullRebuild) {
    dirtySource = true;
  }
  const sk = spanKey();
  if (sk !== lastSpanKey) {
    lastSpanKey = sk;
    dirtySource = true;
  }
  if (dirtySource || dirtyEncoding) {
    fillAndUpload();
    return;
  }
  paths.record("soa", 0);
  if (dirtyView) {
    paths.measure("inst", uploadInstances);
    lastWork = "inst";
    dirtyView = false;
    hoverKey = "";
    return;
  }
  paths.record("inst", 0);
  lastWork = "rend";
}

function hitCell(event, cubesToo = false) {
  if (!focusSurface) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, activeCamera());
  const objs = cubesToo ? [cubes.solid, cubes.ghost, focusSurface] : [focusSurface];
  const hits = raycaster.intersectObjects(objs, false);
  if (!hits.length) return null;
  _hitLocal.copy(hits[0].point);
  stage.worldToLocal(_hitLocal);
  return cellFromWorldXZ(
    _hitLocal.x,
    _hitLocal.z,
    world.width,
    world.height,
    DEFAULTS.cellSize,
  );
}

function paintAt(event) {
  if (sourceId === "count" || !editing || focusBack !== 0) return;
  const cell = hitCell(event);
  if (!cell) return;
  if (world.toggle(cell.x, cell.y)) {
    ring.replaceGrid(world.grid, world.width, world.height, world.generation);
    tape.replaceGrid(world.grid, world.width, world.height, world.generation);
    stableStreak = 0;
    stoppedStable = false;
    dirtySource = true;
  }
}

function clearHover() {
  hoverCell = null;
  hoverKey = "";
  hairlines.hide();
  axes.setHover(null);
  hover.hide();
}

function syncHover() {
  if (!hoverCell || !world) {
    hover.hide();
    return;
  }
  const foc = tFocus();
  const key = `${hoverCell.x},${hoverCell.y},${foc},${soa.count},${stabForFill()}`;
  if (key === hoverKey) return;
  hoverKey = key;
  const fill = encodingCubeFill(
    eventAt(soa, hoverCell.x, hoverCell.y, foc),
    stabForFill(),
    encodingWarmupK(),
  );
  hover.set(hoverCell, world.width, world.height, DEFAULTS.cellSize, fill);
}

function updateHover(event) {
  const cell = hitCell(event);
  hoverCell = cell;
  hairlines.setCell(cell, world.width, world.height, DEFAULTS.cellSize);
  axes.setHover(cell);
  syncHover();
}

function resize() {
  if (arPresenting()) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const aspect = w / Math.max(1, h);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  applyBirdAspect(birdCam, aspect);
  refreshGpu();
}

function refreshGpu() {
  gpuInfo = probeGpu(renderer, {
    dpr: renderer.getPixelRatio(),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });
  document.body.classList.toggle("is-software", Boolean(gpuInfo.software));
  if (hudGpuEl) {
    hudGpuEl.textContent = formatGpuHud(gpuInfo);
    hudGpuEl.classList.toggle("is-soft", Boolean(gpuInfo.software));
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  pointerDown = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", (e) => {
  updateHover(e);
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
canvas.addEventListener("pointerleave", () => {
  clearHover();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const dir = Math.sign(e.deltaY) || 1;
    enterInspect();
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
    if (sourceId !== "count") toggleEdit();
  } else if (e.code === "KeyB") {
    toggleBird();
  } else if (e.code === "KeyF") {
    fitVolume();
  } else if (e.code === "Escape") {
    if (arPresenting()) exitAr();
    else if (birdEye) toggleBird();
  } else if (e.code === "Period" || e.code === "KeyN") {
    if (sourceId === "count") {
      playing = false;
      ui.setPlaying(false);
      stepCountPlayhead();
      updateHint();
      return;
    }
    if (tapeMode) return;
    enterInspect();
    stepOnce();
    updateHint();
  } else if (e.code === "BracketLeft" || e.code === "ArrowDown") {
    enterInspect();
    applyFocus(focusBack + 1);
  } else if (e.code === "BracketRight" || e.code === "ArrowUp") {
    enterInspect();
    applyFocus(focusBack - 1);
  } else if (e.code === "Home") {
    clipNearBack = 0;
    applyFocus(0);
  } else if (e.code === "KeyR") {
    if (sourceId === "count") applyFocus(0);
    else bootWorld(false);
  }
});

window.addEventListener("resize", resize);

function frame(now, xrFrame) {
  const dt = clock.tick(now);
  if (playing) {
    acc += dt * gensPerSec;
    let steps = 0;
    paths.measure("sim", () => {
      while (playing && acc >= 1 && steps < DEFAULTS.maxStepCatchUp) {
        acc -= 1;
        if (sourceId === "count") stepCountPlayhead();
        else stepOnce();
        steps += 1;
      }
    });
    if (acc > 1) acc = 1;
  } else {
    lastStepAt = 0;
    paths.record("sim", 0);
  }

  syncVolume();
  paths.measure("hover", syncHover);
  if (arPresenting()) {
    updateReticle(xrFrame);
    if (arPlacePending) {
      placeStageInFrontOfViewer();
      arPlacePending = false;
    }
    if (arPlaced) applyArStagePose();
  } else {
    pinOrbitPivot();
    controls.update();
  }
  paths.measure("rend", () => {
    renderer.render(scene, activeCamera());
  });

  paths.measure("hud", () => {
    const foc = tFocus();
    const store = viewStore();
    const fps = clock.displayFps || 1000 / clock.emaMs;
    const ms = clock.displayMs || clock.emaMs;
    hudViewEl.textContent = formatViewHud({
      fps,
      avgFps: clock.avgFps,
      low1Fps: clock.displayLow1 || clock.low1Fps,
      low01Fps: clock.displayLow01 || clock.low01Fps,
      ms,
      instances: cubes.count,
      truncated: soa.truncated,
      focus: foc,
      playing,
      bird: birdEye,
      software: Boolean(gpuInfo && gpuInfo.software),
    });
    ui.setFps(fps);
    hudSrcEl.textContent = formatSourceHud({
      generation: tapeMode ? foc : world.generation,
      live: store.liveAt(foc),
      gps: playing ? measuredGps || gensPerSec : 0,
      editing,
      tape: tapeMode,
      kind: sourceId,
      sum: sourceId === "count" && countVol ? countVol.sumAt(foc) : 0,
      ceiling: sourceId === "count" && countVol ? countVol.ceiling : 0,
    });
    if (tape) {
      ui.setCache({
        gens: tape.size,
        events: tape.eventCount,
        full: tape.stopped,
        inspect: tapeMode,
        atNow: focusBack === 0,
        tick: sourceId === "count" ? "t" : "gen",
        source: sourceId,
      });
    }
    drawSparkline(hudSparkEl, clock);
    if (hudBenchEl) {
      const rows = paths.snapshot();
      hudBenchEl.textContent = formatBenchHud({
        rows,
        work: lastWork,
        forceFull: forceFullRebuild,
        frameMs: ms,
        bound: inferBound(rows, ms, lastWork),
      });
    }
  });
}

resize();
bootWorld(true);
ui.setPlaying(playing);
renderer.xr.addEventListener("sessionstart", onArSessionStart);
renderer.xr.addEventListener("sessionend", onArSessionEnd);
isImmersiveArSupported().then((ok) => ui.setArAvailable(ok));
renderer.setAnimationLoop(frame);
