import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { COLOR, DEFAULTS, VERSION, clampCubeCap } from "./config.js";
import {
  BENCH_PRESETS,
  PathTimer,
  formatBenchHud,
  formatGpuHud,
  inferBound,
  probeGpu,
} from "./bench.js";
import { ConwayWorld, gridCyclePeriod, seedPattern } from "./conway.js";
import { MAX_OSC_PERIOD } from "./dynamics.js";
import { countVolumeFromNpy, isDenseCount } from "./count.js";
import { CONWAY_KIND_HEX, CONWAY_WARMUP_K, countKindHex, encodingCubeFill } from "./encoding.js";
import { focusGeneration } from "./focus.js";
import { drawSparkline, FrameClock, formatSourceHud, formatViewHud } from "./hud.js";
import { cellFromWorldXZ } from "./observe.js";
import { mulberry32 } from "./rng.js";
import { io } from "../vendor/socket.io/socket.io.esm.min.js";
import { WolkeViewer } from "./wolke.js";
import {
  CubeRenderer,
  FocusFrame,
  HoverOutlines,
  IsolateBeacon,
  createFocusSurface,
  createSliceGrid,
  orientSlicePlane,
} from "./renderer.js";
import { CoordinateFrame, PlaneHairlines } from "./coords.js";
import {
  EventSoA,
  eventAt,
  GenerationRing,
  fadePastSpan,
  visibleTimeSpan,
} from "./spacetime.js";
import {
  aabbFromSlabs,
  axisIndexFromBack,
  clampSlab,
  effectiveShade,
  fociFromSlabs,
  normalizeSliceAxis,
  planeLockShouldExit,
  productViewDir,
  slabGenerations,
  sliceMaxBack,
  sliceOnlyFromPlaneLock,
  stepFocusBack,
} from "./axes.js";
import {
  fitOrbitDistance,
  offsetLength,
  pinOrbitHeight,
  pinOrbitToAxis,
  placeOnViewRay,
  slabYRange,
  snapPose,
  volumeRadius,
} from "./orbit.js";
import {
  wrapTurntableYaw,
  yawDegrees,
  yawDeltaFromDrag,
  yawFromDegrees,
} from "./turntable.js";
import { bindUI } from "./ui.js";
import {
  applyOrthoAspect,
  createOrthoCamera,
  enterOrtho,
  exitOrtho,
  setOrthoFrustum,
} from "./view.js";
import { ViewGizmo, gizmoOnScreen } from "./gizmo.js";
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
const gizmoNarrowMq = window.matchMedia("(max-width: 720px)");
function showGizmo() {
  return gizmoOnScreen({
    coarse,
    narrow: gizmoNarrowMq.matches,
    ar: arPresenting(),
  });
}

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
renderer.autoClear = true;

const scene = new THREE.Scene();
const fog = new THREE.Fog(COLOR.bg, 48, 160);
scene.fog = fog;
const stage = new THREE.Group();
stage.name = "stage";
scene.add(stage);
const turntable = new THREE.Group();
turntable.name = "turntable";
stage.add(turntable);
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
const orthoCam = createOrthoCamera();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 6;
controls.maxDistance = 160;
controls.enablePan = false;
controls.minZoom = 0.35;
controls.maxZoom = 8;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.target.set(0, -6, 0);
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

const gizmo = new ViewGizmo({ coarse });
const gizmoHit = document.getElementById("gizmo-hit");
const gizmoSlot = document.getElementById("gizmo-slot");
function syncGizmoChrome() {
  const on = showGizmo();
  if (gizmoHit) gizmoHit.hidden = !on;
  if (gizmoSlot) gizmoSlot.hidden = !on;
}
syncGizmoChrome();

const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x0a0e13, 0.72);
scene.add(hemi);
const lightRig = new THREE.Group();
lightRig.name = "lightRig";
scene.add(lightRig);
const key = new THREE.DirectionalLight(0xffe6c0, 0.9);
key.position.set(18, 32, 22);
lightRig.add(key);
const fill = new THREE.DirectionalLight(0x88ddff, 0.22);
fill.position.set(-20, 8, -12);
lightRig.add(fill);

let soa = new EventSoA(DEFAULTS.maxInstances);
let cubes = new CubeRenderer(turntable, {
  maxCount: DEFAULTS.maxInstances,
  cellSize: DEFAULTS.cellSize,
});
const playfields = {
  x: new FocusFrame(turntable, COLOR.cyan),
  y: new FocusFrame(turntable, COLOR.cyan),
  z: new FocusFrame(turntable, COLOR.cyan),
};
const clipNearFrame = new FocusFrame(turntable, COLOR.gold);
const clipFarFrame = new FocusFrame(turntable, COLOR.gold);
clipNearFrame.setVisible(false);
clipFarFrame.setVisible(false);
const axes = new CoordinateFrame(turntable);
const hairlines = new PlaneHairlines(turntable);
const beacon = new IsolateBeacon(turntable, DEFAULTS.cellSize);
const hover = new HoverOutlines(turntable, DEFAULTS.cellSize);

let world;
let ring;
let tape;
let tapeMode = false;
let sourceId = "conway";
let countVol = null;
let countSizeByCount = false;
const wolke = new WolkeViewer({ io });
const COUNT_HINT =
  "EVT count cube (T × H × W). Integer events per pixel per Δt. Stream: sidecar Send as counts.";
let focusSurfaces = { x: null, y: null, z: null };
let nowGrid;
let playing = false;
let editing = false;
let parallax = DEFAULTS.parallax;
let alignZ = DEFAULTS.alignZ;
let activeAxis = DEFAULTS.sliceAxis;
let shadeMode = DEFAULTS.shadeMode;
let shadeHeld = false;
let planeLock = false;
let slabs = {
  x: { near: 0, focus: 0, far: 0 },
  y: { near: 0, focus: 0, far: 0 },
  z: { near: 0, focus: 0, far: 0 },
};
let gensPerSec = DEFAULTS.gensPerSec;
let decay = DEFAULTS.decay;
let historyLen = DEFAULTS.history;
let stabMode = DEFAULTS.stabMode;
let dynamicsOn = DEFAULTS.dynamics;
let neighborhoodRadius = DEFAULTS.neighborhoodRadius;
let stabScaleOn = DEFAULTS.stabScale;
let encodingMinimal = DEFAULTS.encodingMinimal;
let forceFullRebuild = DEFAULTS.forceFullRebuild;
let acc = 0;
let lastStepAt = 0;
let measuredGps = 0;
let gpsWindow = 0;
let gpsSteps = 0;
let pointerDown = null;
let planeDrag = null;
let hoverCell = null;
let hoverKey = "";
let dirtySource = true;
let dirtyView = true;
let dirtyEncoding = true;
let lastWork = "soa";
let lastSpanKey = "";
let stableStreak = 0;
let stoppedStable = false;
/** Newest-first copies of recent grids (`[0]` = t-1) for ash cycle detection. */
const gridHistory = [];
let arPlacePending = false;
let arHitTestSource = null;
let arPlaced = false;
let arUseHitTest = false;
let arAnchored = false;
let arLocked = false;
let arMag = XR_MAG_DEFAULT;
let turntableYaw = 0;
let lightAzimuth = 0;
let yawDrag = null;

const clock = new FrameClock();
const paths = new PathTimer();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let gpuInfo = null;

const ui = bindUI({
  togglePlay,
  toggleEdit,
  toggleParallax,
  fitVolume,
  alignZ: () => {
    alignZ = ui.getConfig().alignZ;
    syncOrbitPan();
    pinOrbitPivot();
  },
  yaw: (deg) => {
    setTurntableYaw(yawFromDegrees(deg ?? ui.getYawDegrees()));
  },
  light: (deg) => {
    setLightAzimuth(yawFromDegrees(deg ?? ui.getLightDegrees()));
  },
  sliceAxis: (axis) => setActiveAxis(axis),
  activeAxis: (axis) => setActiveAxis(axis),
  shade: (mode) => setShadeMode(mode),
  slab: (next) => {
    enterInspect();
    applySlab(next.axis, next, next.dragged || "focus");
  },
  slabHold: (held) => setShadeHeld(held),
  cubeCap: () => applyCubeCap(),
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
  reset: () => (sourceId === "count" ? resetCountView() : bootWorld(false)),
  rebuild: () => bootWorld(true),
  speed: () => {
    gensPerSec = ui.getConfig().gensPerSec;
  },
  decay: () => {
    decay = ui.getConfig().decay;
    dirtyView = true;
  },
  history: () => applyRingCapacity(),
  focusNow: () => {
    if (stackLiveLocked()) return;
    slabs.z.near = 0;
    applySlab("z", { ...slabs.z, focus: 0 }, "focus");
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
  wolkeConnect: () => {
    if (wolke.listening) disconnectWolke();
    else connectWolke();
  },
  enterAr,
  exitAr,
  arMag: () => {
    arMag = clampArMag(ui.getArMag());
    applyArStagePose();
  },
});

function activeCamera() {
  return parallax ? camera : orthoCam;
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
  return focusGeneration(viewNow(), slabs.z.focus);
}

function inspectMode() {
  return Boolean(tapeMode && tape);
}

function volumeSpan() {
  if (inspectMode()) {
    const { tLo, tHi } = slabGenerations(viewNow(), slabs.z.near, slabs.z.far);
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

function maxTimeBack() {
  if (inspectMode()) return Math.max(0, tape.newestT() - tape.oldestT());
  return Math.min(world.generation, historyLen);
}

function axisMaxBack(axis = activeAxis) {
  const a = normalizeSliceAxis(axis);
  if (a === "z") return maxTimeBack();
  if (!world) return 0;
  return sliceMaxBack(a, world.width, world.height, 0);
}

function stackLiveLocked() {
  return playing && !tapeMode;
}

function spatialCoord(back, axis) {
  if (!world) return 0;
  const a = normalizeSliceAxis(axis);
  const max = sliceMaxBack(a, world.width, world.height, 0);
  const idx = axisIndexFromBack(back, max);
  const cs = DEFAULTS.cellSize;
  if (a === "x") return (idx - (world.width - 1) * 0.5) * cs;
  return (idx - (world.height - 1) * 0.5) * cs;
}

function sliceWorldCoord(back, axis = activeAxis) {
  const a = normalizeSliceAxis(axis);
  if (a === "z") return (slabs.z.focus - back) * DEFAULTS.timeScale;
  return spatialCoord(back, a);
}

function cropAabb() {
  if (!world || (!inspectMode() && !arPillar())) return null;
  return aabbFromSlabs(
    slabs,
    world.width,
    world.height,
    viewNow(),
    viewStore().oldestT(),
  );
}

function cropFoci() {
  if (!world) return { x: 0, y: 0, z: tFocus() };
  return fociFromSlabs(slabs, world.width, world.height, viewNow());
}

function inspectShade() {
  if (!inspectMode() || arPresenting()) return null;
  return effectiveShade(shadeMode, shadeHeld);
}

function railUi(axis) {
  const a = normalizeSliceAxis(axis);
  const live = a === "z" && stackLiveLocked();
  const max = live ? 0 : axisMaxBack(a);
  const s = slabs[a];
  const label = a === "z" ? (live ? viewNow() : tFocus()) : axisIndexFromBack(s.focus, max);
  const oldest = a === "z" ? viewNow() - max : 0;
  return {
    back: s.focus,
    maxBack: max,
    label,
    oldest,
    live,
    near: s.near,
    far: s.far,
  };
}

function syncStackUi() {
  ui.setSlabs({
    activeAxis,
    x: railUi("x"),
    y: railUi("y"),
    z: railUi("z"),
  });
  ui.setActiveAxis(activeAxis);
  ui.setShade(shadeMode);
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

function syncTurntableVisual() {
  turntable.rotation.y = arPresenting() ? turntableYaw : 0;
}

function syncLightRig() {
  lightRig.rotation.y = arPresenting() ? 0 : lightAzimuth;
}

function setTurntableYaw(rad) {
  turntableYaw = wrapTurntableYaw(rad);
  syncTurntableVisual();
  ui.setYawDegrees(yawDegrees(turntableYaw));
}

function setLightAzimuth(rad) {
  lightAzimuth = wrapTurntableYaw(rad);
  syncLightRig();
  ui.setLightDegrees(yawDegrees(lightAzimuth));
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
  ui.setArYawEnabled(true);
}

function placeStageFromReticle() {
  if (arLocked || !reticle.visible) return;
  reticle.matrix.decompose(arAnchorPos, arAnchorQuat, _xrScale);
  arAnchored = true;
  arPlaced = true;
  arLocked = true;
  reticle.visible = false;
  applyArStagePose();
  ui.setArYawEnabled(true);
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
  if (planeLock) {
    planeLock = false;
    dirtyView = true;
  }
  if (!parallax) toggleParallax();
  if (activeAxis !== "z") setActiveAxis("z");
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
  gizmo.clearHover();
  canvas.style.cursor = "";
  syncGizmoChrome();
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
  ui.setArYawEnabled(!arUseHitTest);
  syncTurntableVisual();
  syncLightRig();
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
  syncTurntableVisual();
  syncLightRig();
  dirtySource = true;
  dirtyView = true;
  syncFog();
  pinOrbitPivot();
  ui.setArActive(false);
  ui.setArYawEnabled(true);
  syncGizmoChrome();
  updateHint();
}

function syncFog() {
  const inspect = inspectMode();
  const ar = arPresenting();
  scene.fog = !parallax || inspect || ar ? null : fog;
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
  if (!parallax) {
    orthoCam.near = camera.near;
    orthoCam.far = camera.far;
    applyOrthoAspect(orthoCam, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  }
}

/** Depth: grow the wake ring, do not reset Conway. Tape stays as recorded. */
function applyRingCapacity() {
  const cfg = ui.getConfig();
  historyLen = cfg.history;
  if (ring && ring.capacity !== historyLen) ring.resize(historyLen);
  applySlab("z", slabs.z, "focus");
  syncBeacon();
  dirtySource = true;
}

function currentSlabY() {
  const span = volumeSpan();
  return slabYRange(tFocus(), span.tLo, span.tHi, DEFAULTS.timeScale);
}

function pinOrbitPivot() {
  if (arPresenting() || !world || !alignZ || planeLock) return;
  const cam = activeCamera();
  const { yMid } = currentSlabY();
  if (!Number.isFinite(yMid)) return;
  if (!Number.isFinite(cam.position.x)) {
    cam.position.set(22, 16, 28);
    controls.target.set(0, 0, 0);
  }
  const pinned = parallax
    ? pinOrbitToAxis(cam.position, controls.target, yMid)
    : pinOrbitHeight(cam.position, controls.target, yMid);
  if (!Number.isFinite(pinned.cam.x) || !Number.isFinite(pinned.target.y)) return;
  cam.position.set(pinned.cam.x, pinned.cam.y, pinned.cam.z);
  controls.target.set(pinned.target.x, pinned.target.y, pinned.target.z);
  cam.lookAt(controls.target);
}

function syncOrbitPan() {
  controls.enablePan = !arPresenting() && (!parallax || !alignZ);
}

function fitVolume() {
  if (!world || arPresenting()) return;
  const box = cropAabb();
  const { yMin, yMax, yMid } = currentSlabY();
  const cs = DEFAULTS.cellSize;
  const ox = (world.width - 1) * 0.5;
  const oz = (world.height - 1) * 0.5;
  const xLo = box ? box.xLo : 0;
  const xHi = box ? box.xHi : world.width - 1;
  const yLo = box ? box.yLo : 0;
  const yHi = box ? box.yHi : world.height - 1;
  const hx = Math.max(Math.abs(xLo - ox), Math.abs(xHi - ox)) * cs;
  const hz = Math.max(Math.abs(yLo - oz), Math.abs(yHi - oz)) * cs;
  const radius = volumeRadius(hx, hz, yMin, yMax);
  const cam = activeCamera();
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  controls.target.set(0, yMid, 0);
  if (!parallax) {
    const dist = Math.max(12, radius * 2.2);
    const pos = placeOnViewRay(cam.position, controls.target, dist);
    cam.position.set(pos.x, pos.y, pos.z);
    setOrthoFrustum(orthoCam, radius * 1.2, aspect, 0.1, Math.max(400, dist + radius * 4));
    orthoCam.zoom = 1;
    orthoCam.lookAt(controls.target);
    controls.maxDistance = Math.min(2400, Math.max(220, dist * 1.4));
  } else {
    const dist = fitOrbitDistance(camera.fov, radius, 1.28);
    const pos = placeOnViewRay(camera.position, controls.target, dist);
    camera.position.set(pos.x, pos.y, pos.z);
    controls.maxDistance = Math.min(2400, Math.max(controls.maxDistance, dist * 1.4, 220));
    camera.far = Math.max(camera.far, dist + radius * 3, 400);
    camera.updateProjectionMatrix();
  }
  pinOrbitPivot();
  controls.update();
}

function applySlab(axis, next, dragged = "focus") {
  const a = normalizeSliceAxis(axis);
  const live = a === "z" && stackLiveLocked();
  const max = live ? 0 : axisMaxBack(a);
  const cur = slabs[a];
  const clamped = live
    ? { topBack: 0, focusBack: 0, botBack: 0 }
    : clampSlab(
        next.near ?? cur.near,
        next.focus ?? cur.focus,
        next.far ?? cur.far,
        max,
        dragged,
      );
  slabs[a] = {
    near: clamped.topBack,
    focus: live ? 0 : clamped.focusBack,
    far: clamped.botBack,
  };
  syncStackUi();
  syncClipPlanes();
  pinOrbitPivot();
  updateHint();
  dirtyView = true;
  if (inspectMode()) dirtySource = true;
  if (stabScaleOn && stabMode === "focus") dirtyEncoding = true;
}

function enterInspect() {
  if (tapeMode && !playing) return;
  playing = false;
  tapeMode = true;
  if (!(sourceId === "count" && countVol && isDenseCount(countVol))) {
    slabs.z.near = 0;
    slabs.z.far = maxTimeBack();
  }
  ensureSpatialSlabs();
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
  slabs.z = { near: 0, focus: 0, far: 0 };
  setActiveAxis("z");
  clearHover();
  applySlab("z", slabs.z, "focus");
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
    atNow: slabs.z.focus === 0,
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
  rebuildSliceVisuals(width, height);
  axes.setSize(width, height, DEFAULTS.cellSize);
  if (hoverCell && (hoverCell.x >= width || hoverCell.y >= height)) {
    hoverCell = null;
  }
}

function disposeObject3(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  if (obj.geometry) obj.geometry.dispose();
  const mats = obj.material
    ? Array.isArray(obj.material)
      ? obj.material
      : [obj.material]
    : [];
  for (const m of mats) m.dispose();
}

function brickYRange() {
  return currentSlabY();
}

function rebuildSliceVisuals(width = world?.width, height = world?.height) {
  if (!width || !height) return;
  const { yMin, yMax } = brickYRange();
  for (const a of ["x", "y", "z"]) {
    disposeObject3(focusSurfaces[a]);
    focusSurfaces[a] = createFocusSurface(width, height, DEFAULTS.cellSize, a, yMin, yMax);
    turntable.add(focusSurfaces[a]);
    playfields[a].setSize(width, height, DEFAULTS.cellSize, a, yMin, yMax);
  }
  disposeObject3(nowGrid);
  nowGrid = createSliceGrid(width, height, DEFAULTS.cellSize, activeAxis, yMin, yMax);
  turntable.add(nowGrid);
  clipNearFrame.setSize(width, height, DEFAULTS.cellSize, activeAxis, yMin, yMax);
  clipFarFrame.setSize(width, height, DEFAULTS.cellSize, activeAxis, yMin, yMax);
  syncClipPlanes();
  applyGridLook();
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

function ensureSpatialSlabs() {
  if (!world) return;
  const xMax = Math.max(0, world.width - 1);
  const yMax = Math.max(0, world.height - 1);
  if (slabs.x.far < 1 && xMax > 0) slabs.x = { near: 0, focus: 0, far: xMax };
  else slabs.x.far = Math.min(slabs.x.far, xMax);
  if (slabs.y.far < 1 && yMax > 0) slabs.y = { near: 0, focus: 0, far: yMax };
  else slabs.y.far = Math.min(slabs.y.far, yMax);
}

function fullExtentSlabs(vol) {
  const zMax = Math.max(0, vol.newestT() - vol.oldestT());
  const xMax = Math.max(0, vol.width - 1);
  const yMax = Math.max(0, vol.height - 1);
  slabs.x = { near: 0, focus: xMax >> 1, far: xMax };
  slabs.y = { near: 0, focus: yMax >> 1, far: yMax };
  slabs.z = { near: 0, focus: zMax >> 1, far: zMax };
}

function applyDenseCountWindow(vol) {
  fullExtentSlabs(vol);
  decay = false;
  ui.setDecay(false);
  applySlab(activeAxis, slabs[activeAxis], "focus");
}

function resetCountView() {
  if (countVol && isDenseCount(countVol)) {
    applyDenseCountWindow(countVol);
    return;
  }
  applySlab("z", { ...slabs.z, focus: 0 }, "focus");
}

function stepCountPlayhead() {
  const a = inspectMode() ? activeAxis : "z";
  const max = axisMaxBack(a);
  if (max <= 0) return;
  const next = stepFocusBack(slabs[a].focus, max, -1);
  applySlab(a, { ...slabs[a], focus: next }, "focus");
  markGps();
}

function bootCount(vol) {
  sourceId = "count";
  countVol = vol;
  countSizeByCount = ui.getConfig().countSize;
  gensPerSec = ui.getConfig().gensPerSec;
  decay = ui.getConfig().decay;
  historyLen = ui.getConfig().history;
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
  if (isDenseCount(vol)) {
    applyDenseCountWindow(vol);
  } else {
    decay = ui.getConfig().decay;
    slabs.x = { near: 0, focus: 0, far: Math.max(0, vol.width - 1) };
    slabs.y = { near: 0, focus: 0, far: Math.max(0, vol.height - 1) };
    slabs.z = { near: 0, focus: 0, far: Math.max(0, vol.newestT() - vol.oldestT()) };
    applySlab("z", slabs.z, "focus");
  }
  syncFog();
  syncViewRange();
  const span = Math.max(vol.width, vol.height);
  camera.position.set(span * 0.55, Math.max(24, vol.nT * 0.45), span * 0.7);
  controls.target.set(0, -Math.min(vol.nT, span) * 0.15, 0);
  if (!parallax) {
    copyActivePoseToOrtho();
  }
  pinOrbitPivot();
  ui.setPlaying(false);
  ui.setEditing(false);
  ui.setParallax(parallax);
  syncStackUi();
  syncOrbitPan();
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
    ui.setCountHint(COUNT_HINT);
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
    ui.setCountHint(COUNT_HINT);
  } catch (err) {
    ui.setCountHint(err && err.message ? err.message : String(err));
    updateHint();
  }
}

function connectWolke() {
  const cfg = ui.getConfig();
  ui.setWolkeStatus("connecting");
  ui.setWolkeConnected(true);
  wolke.connect({
    baseUrl: cfg.wolkeUrl,
    token: cfg.wolkeToken,
    onNpy: (buf, fileName) => {
      try {
        const name = String(fileName || "stack").replace(/\.npy$/i, "");
        bootCount(countVolumeFromNpy(buf, name));
        ui.setCountHint(COUNT_HINT);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        ui.setCountHint(`Stream cube rejected (${msg}). Need (T × H × W) .npy; Send as counts.`);
        updateHint();
      }
    },
    onStatus: (status) => {
      ui.setWolkeStatus(status);
      if (status === "disconnected") ui.setWolkeConnected(wolke.listening);
    },
    onError: (err) => {
      const msg = err && err.message ? err.message : String(err);
      ui.setWolkeStatus(`error: ${msg}`);
      ui.setCountHint(`Stream: ${msg}`);
      ui.setWolkeConnected(wolke.listening);
      updateHint();
    },
  });
  if (!wolke.listening) ui.setWolkeConnected(false);
}

function disconnectWolke() {
  wolke.disconnect();
  ui.setWolkeConnected(false);
  ui.setWolkeStatus("disconnected");
}

function switchSource(kind) {
  if (kind === "count") {
    if (countVol) bootCount(countVol);
    else loadCountDemo();
    return;
  }
  disconnectWolke();
  bootWorld(true);
}

function bootWorld(resizeGrid) {
  const cfg = ui.getConfig();
  sourceId = "conway";
  gensPerSec = cfg.gensPerSec;
  decay = cfg.decay;
  historyLen = cfg.history;
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
  gridHistory.length = 0;
  rememberGrid(world.grid);
  const xMax = Math.max(0, cfg.width - 1);
  const yMax = Math.max(0, cfg.height - 1);
  slabs.x = { near: 0, focus: 0, far: xMax };
  slabs.y = { near: 0, focus: 0, far: yMax };
  slabs.z = {
    near: 0,
    focus: 0,
    far: tapeMode ? Math.max(0, tape.newestT() - tape.oldestT()) : 0,
  };
  applySlab("z", slabs.z, "focus");
  syncFog();
  syncViewRange();
  if (resizeGrid) {
    const span = Math.max(cfg.width, cfg.height);
    camera.position.set(span * 0.7, span * 0.55, span * 0.9);
    controls.target.set(0, -Math.min(historyLen, span) * 0.2, 0);
    if (!parallax) copyActivePoseToOrtho();
  }
  pinOrbitPivot();
  ui.setPlaying(playing);
  ui.setEditing(editing);
  ui.setParallax(parallax);
  syncStackUi();
  syncOrbitPan();
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
      if (activeAxis === "z" && slabs.z.focus === 0 && !(countVol && isDenseCount(countVol))) {
        applySlab("z", { ...slabs.z, focus: maxTimeBack() }, "focus");
      } else if (slabs[activeAxis].focus === 0 && !(countVol && isDenseCount(countVol))) {
        applySlab(activeAxis, { ...slabs[activeAxis], focus: axisMaxBack(activeAxis) }, "focus");
      }
    }
    updateHint();
    return;
  }
  if (playing) {
    editing = false;
    ui.setEditing(false);
    enterInspect();
    applySlab("z", { ...slabs.z, focus: 0 }, "focus");
  } else {
    enterLive();
  }
  syncCacheUi();
  updateHint();
}

function toggleEdit() {
  if (sourceId === "count") return;
  if (tapeMode && slabs.z.focus !== 0) return;
  if (playing) {
    enterInspect();
    applySlab("z", { ...slabs.z, focus: 0 }, "focus");
  }
  editing = !editing;
  if (editing) {
    applySlab("z", { ...slabs.z, focus: 0 }, "focus");
    ui.setPlaying(false);
  }
  ui.setEditing(editing);
  updateHint();
}

function copyActivePoseToOrtho() {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  enterOrtho({
    persp: camera,
    ortho: orthoCam,
    controls,
    aspect,
    fov: camera.fov,
    target: controls.target,
  });
}

function applyParallax(on) {
  if (arPresenting()) return;
  const next = Boolean(on);
  if (next === parallax) return;
  parallax = next;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  if (!parallax) {
    enterOrtho({
      persp: camera,
      ortho: orthoCam,
      controls,
      aspect,
      fov: camera.fov,
      target: controls.target,
    });
  } else {
    exitOrtho({
      persp: camera,
      ortho: orthoCam,
      controls,
      target: controls.target,
    });
    pinOrbitPivot();
  }
  syncOrbitPan();
  syncFog();
  ui.setParallax(parallax);
  dirtyView = true;
}

function toggleParallax() {
  if (arPresenting()) return;
  if (planeLock && !parallax) {
    planeLock = false;
    dirtyView = true;
  }
  applyParallax(!parallax);
  updateHint();
}

function exitPlaneLock() {
  if (!planeLock) return;
  planeLock = false;
  applyParallax(true);
  dirtyView = true;
  updateHint();
}

function maybeExitPlaneLock() {
  if (!planeLock || arPresenting()) return;
  const cam = activeCamera();
  if (
    planeLockShouldExit(true, cam.position, controls.target, activeAxis)
  ) {
    exitPlaneLock();
  }
}

function snapToProductView(axis, sign) {
  if (arPresenting()) return;
  const cam = activeCamera();
  const dist = offsetLength(cam.position, controls.target) || 40;
  const pos = snapPose(controls.target, productViewDir(axis, sign), dist);
  cam.position.set(pos.x, pos.y, pos.z);
  cam.lookAt(controls.target);
  controls.update();
  dirtyView = true;
}

function enterPlaneLock(axis, sign) {
  if (arPresenting()) return;
  setActiveAxis(axis, { keepPlaneLock: true });
  applyParallax(false);
  planeLock = true;
  snapToProductView(axis, sign);
  dirtyView = true;
  updateHint();
}

function setShadeMode(mode) {
  const next = mode === "ghost" || mode === "triple" ? mode : "hull";
  if (next === shadeMode) return;
  shadeMode = next;
  ui.setShade(shadeMode);
  if (inspectMode()) dirtySource = true;
  dirtyView = true;
  updateHint();
}

function setShadeHeld(held) {
  const next = Boolean(held);
  if (next === shadeHeld) return;
  shadeHeld = next;
  if (inspectMode() && shadeMode === "hull") dirtySource = true;
  dirtyView = true;
}

function setActiveAxis(next, opts = {}) {
  const a = normalizeSliceAxis(next);
  if (planeLock && !opts.keepPlaneLock) {
    planeLock = false;
    applyParallax(true);
  }
  const changed = a !== activeAxis;
  activeAxis = a;
  if (editing && a !== "z") {
    editing = false;
    ui.setEditing(false);
  }
  ui.setActiveAxis(a);
  if (changed) rebuildSliceVisuals();
  else syncClipPlanes();
  dirtyView = true;
  if (inspectMode()) dirtySource = true;
}

function applyCubeCap() {
  const cap = clampCubeCap(ui.getConfig().maxInstances);
  if (soa.capacity === cap) return;
  soa = new EventSoA(cap);
  cubes.dispose();
  cubes = new CubeRenderer(turntable, {
    maxCount: cap,
    cellSize: DEFAULTS.cellSize,
    kindHex: sourceId === "count" && countVol ? countKindHex(countVol.ceiling) : CONWAY_KIND_HEX,
    warmupK: encodingWarmupK(),
  });
  dirtySource = true;
}

function applyGridLook() {
  const inspect = inspectMode();
  if (nowGrid) {
    nowGrid.visible = true;
    setLineOpacity(nowGrid, inspect ? 0.4 : 0.18);
  }
  for (const a of ["x", "y", "z"]) {
    const surf = focusSurfaces[a];
    const show = a === "z" || inspect;
    const active = a === activeAxis;
    if (surf) {
      surf.visible = show;
      surf.material.opacity = inspect ? (active ? 0.1 : 0.03) : 0.07;
    }
    playfields[a].setVisible(show);
    playfields[a].setEmphasis(inspect && active ? "active" : a === "z" ? "active" : "idle");
  }
}

function syncClipPlanes() {
  if (!world) return;
  const { yMin, yMax } = brickYRange();
  const showGold = inspectMode() && !stackLiveLocked();
  const s = slabs[activeAxis];
  const showNear = showGold && s.near !== s.focus;
  const showFar = showGold && s.far !== s.focus;
  clipNearFrame.setVisible(showNear);
  clipFarFrame.setVisible(showFar);
  clipNearFrame.setSize(world.width, world.height, DEFAULTS.cellSize, activeAxis, yMin, yMax);
  clipFarFrame.setSize(world.width, world.height, DEFAULTS.cellSize, activeAxis, yMin, yMax);
  for (const a of ["x", "y", "z"]) {
    const coord = sliceWorldCoord(slabs[a].focus, a);
    playfields[a].setOffset(a, coord);
    if (focusSurfaces[a]) {
      orientSlicePlane(
        focusSurfaces[a],
        a,
        world.width,
        world.height,
        DEFAULTS.cellSize,
        yMin,
        yMax,
        coord,
      );
    }
  }
  if (nowGrid) {
    orientSlicePlane(
      nowGrid,
      activeAxis,
      world.width,
      world.height,
      DEFAULTS.cellSize,
      yMin,
      yMax,
      sliceWorldCoord(slabs[activeAxis].focus, activeAxis),
    );
  }
  if (showNear) clipNearFrame.setOffset(activeAxis, sliceWorldCoord(s.near, activeAxis));
  if (showFar) clipFarFrame.setOffset(activeAxis, sliceWorldCoord(s.far, activeAxis));
  applyGridLook();
}

function updateHint() {
  const atNow = slabs.z.focus === 0;
  if (arPresenting()) {
    if (arUseHitTest && !arPlaced) {
      ui.setHint("AR — point at a table until the gold square appears, then tap");
    } else if (arUseHitTest) {
      ui.setHint("AR — yaw the pillar on the table · Play grows up · swipe or Yaw · Exit to orbit");
    } else {
      ui.setHint("AR — yaw the volume · walk around with the phone · Exit returns to orbit");
    }
  } else if (planeLock) {
    ui.setHint("Slice — ortho cut · stack slider walks the plane · orbit restores the volume");
  } else if (sourceId === "count") {
    ui.setHint(
      countVol && isDenseCount(countVol)
        ? "Dense cube — gold clips are the AABB crop · Play walks the active playhead · enclosed voxels stay hidden"
        : playing
          ? "Count stack — Play scrubs Z through the recording · Pause to inspect"
          : "Count stack — three cyan planes · gold clips crop the AABB · Play scrubs the active axis · Load another .npy in Source",
    );
  } else if (tapeMode && stoppedStable) {
    ui.setHint(
      `Inspect — ash · period ≤ ${MAX_OSC_PERIOD} for ${DEFAULTS.stableHold} gens · three planes · Play is live`,
    );
  } else if (tapeMode) {
    ui.setHint("Inspect — three cyan planes · gold clips crop the AABB · hold a handle to peek · Play returns to live");
  } else if (editing && atNow) {
    ui.setHint("Edit — tap a cell inside the frame · drag to orbit");
  } else if (editing && !atNow) {
    ui.setHint("Focus is in the past — Now on the Z stack (or Home), then tap to paint");
  } else if (!parallax) {
    ui.setHint("Ortho — no parallax · gizmo snaps views · B restores perspective");
  } else if (playing && cubes.count > 20000) {
    ui.setHint(
      `INST ${cubes.count} — depth is filling; Pause to see GPU-only (soa now should be 0)`,
    );
  } else if (playing) {
    ui.setHint("Live — Pause to inspect the cache · orbit · Shift-drag moves the light");
  } else {
    ui.setHint("Inspect — three cyan planes · gold clips crop the AABB · hold a handle to peek · Play returns to live");
  }
  applyGridLook();
  playfields.z.setEditing(editing);
}

function rememberGrid(grid) {
  gridHistory.unshift(Uint8Array.from(grid));
  while (gridHistory.length > MAX_OSC_PERIOD) gridHistory.pop();
}

function maybeStopStable() {
  if (!playing || tapeMode) return;
  if (!ui.getConfig().stopWhenStable) return;
  if (stableStreak < DEFAULTS.stableHold) return;
  stoppedStable = true;
  enterInspect();
  applySlab("z", { ...slabs.z, focus: 0 }, "focus");
}

function stepOnce() {
  if (sourceId === "count") return;
  world.step();
  const period = gridCyclePeriod(world.grid, gridHistory, MAX_OSC_PERIOD);
  ring.pushGrid(world.grid, world.width, world.height, world.generation);
  tape.pushGrid(world.grid, world.width, world.height, world.generation);
  applySlab("z", slabs.z, "focus");
  if (period > 0) {
    stableStreak += 1;
    maybeStopStable();
  } else {
    stableStreak = 0;
    stoppedStable = false;
  }
  rememberGrid(world.grid);
  markGps();
  dirtySource = true;
}

function fillVolume() {
  const store = viewStore();
  const span = inspectMode() || arPillar() ? volumeSpan() : null;
  const aabb = inspectMode() ? cropAabb() : null;
  const foci = cropFoci();
  const shade = inspectShade() || "hull";
  store.fillSoA(soa, viewNow(), volumeWindow(), world.width, {
    tFocus: tFocus(),
    stabMode: stabForFill(),
    height: world.height,
    wrap: world.wrap,
    dynamics: dynamicsOn,
    neighborhoodRadius,
    stabScale: stabScaleOn,
    aabb,
    foci,
    shade,
    activeAxis,
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
    activeAxis,
    aabb: inspectMode() ? cropAabb() : null,
    foci: cropFoci(),
    shade: inspectShade(),
    sliceOnly: sliceOnlyFromPlaneLock(planeLock),
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
  const box = cropAabb();
  const s = slabs[activeAxis];
  return `${span.tLo}:${span.tHi}:${activeAxis}:${shadeMode}:${shadeHeld}:${s.near}:${s.focus}:${s.far}:${box ? `${box.xLo}:${box.xHi}:${box.yLo}:${box.yHi}` : "live"}`;
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
  const surf = focusSurfaces.z;
  if (!surf) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, activeCamera());
  const objs = cubesToo ? [cubes.solid, cubes.ghost, surf] : [surf];
  const hits = raycaster.intersectObjects(objs, false);
  if (!hits.length) return null;
  _hitLocal.copy(hits[0].point);
  turntable.worldToLocal(_hitLocal);
  return cellFromWorldXZ(
    _hitLocal.x,
    _hitLocal.z,
    world.width,
    world.height,
    DEFAULTS.cellSize,
  );
}

function hitFocusPlane(event) {
  const meshes = ["x", "y", "z"].map((a) => focusSurfaces[a]).filter(Boolean);
  if (!meshes.length) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, activeCamera());
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const axis = hits[0].object.userData.axis || "z";
  return { axis, point: hits[0].point.clone() };
}

function worldAxisDir(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0);
}

function beginPlaneDrag(event, axis, grabPoint) {
  setActiveAxis(axis);
  if (inspectMode()) setShadeHeld(true);
  const cam = activeCamera();
  const axisDir = worldAxisDir(axis);
  const toCam = cam.position.clone().sub(grabPoint);
  const n = new THREE.Vector3().crossVectors(toCam, axisDir).cross(axisDir);
  if (n.lengthSq() < 1e-10) n.set(0, 0, 1);
  n.normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, grabPoint);
  planeDrag = {
    pointerId: event.pointerId,
    axis,
    plane,
    grab: grabPoint.clone(),
    axisDir,
    focus0: slabs[axis].focus,
  };
  controls.enabled = false;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* already captured */
  }
}

function movePlaneDrag(event) {
  if (!planeDrag || event.pointerId !== planeDrag.pointerId) return;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, activeCamera());
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(planeDrag.plane, hit)) return;
  const delta = hit.clone().sub(planeDrag.grab).dot(planeDrag.axisDir);
  const scale = planeDrag.axis === "z" ? DEFAULTS.timeScale : DEFAULTS.cellSize;
  const step = Math.round(delta / Math.max(1e-6, scale));
  const next = planeDrag.focus0 - step;
  applySlab(planeDrag.axis, { ...slabs[planeDrag.axis], focus: next }, "focus");
}

function endPlaneDrag(event) {
  if (!planeDrag) return;
  if (event && event.pointerId !== planeDrag.pointerId) return;
  planeDrag = null;
  setShadeHeld(false);
  if (!arPresenting()) controls.enabled = true;
}

function paintAt(event) {
  if (sourceId === "count" || !editing || slabs.z.focus !== 0) return;
  const cell = hitCell(event);
  if (!cell) return;
  if (world.toggle(cell.x, cell.y)) {
    ring.replaceGrid(world.grid, world.width, world.height, world.generation);
    tape.replaceGrid(world.grid, world.width, world.height, world.generation);
    if (gridHistory.length) gridHistory[0] = Uint8Array.from(world.grid);
    else rememberGrid(world.grid);
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
  if (planeDrag) return;
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
  applyOrthoAspect(orthoCam, aspect);
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

function beginYawDrag(e) {
  yawDrag = {
    pointerId: e.pointerId,
    x: e.clientX,
    yaw: arPresenting() ? turntableYaw : lightAzimuth,
    ar: arPresenting(),
  };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* already captured or XR overlay */
  }
}

function moveYawDrag(e) {
  if (!yawDrag || e.pointerId !== yawDrag.pointerId) return;
  const next = yawDrag.yaw + yawDeltaFromDrag(e.clientX - yawDrag.x, canvas.clientWidth);
  if (yawDrag.ar) setTurntableYaw(next);
  else setLightAzimuth(next);
}

function endYawDrag(e) {
  if (!yawDrag) return;
  if (e && e.pointerId !== yawDrag.pointerId) return;
  yawDrag = null;
}

if (gizmoHit) {
  gizmoHit.addEventListener(
    "pointerdown",
    (e) => {
      if (!showGizmo()) return;
      if (e.button !== 0 && e.pointerType !== "touch") return;
      e.preventDefault();
      e.stopPropagation();
      const view = gizmo.hit(e.clientX, e.clientY, canvas);
      if (view) enterPlaneLock(view.axis, view.sign);
    },
    { passive: false },
  );
  gizmoHit.addEventListener("pointermove", (e) => {
    if (!showGizmo()) return;
    gizmo.hover(e.clientX, e.clientY, canvas);
  });
  gizmoHit.addEventListener("pointerleave", () => gizmo.clearHover());
}

canvas.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0) return;
    if (showGizmo()) {
      const view = gizmo.hit(e.clientX, e.clientY, canvas);
      if (view) {
        e.stopImmediatePropagation();
        enterPlaneLock(view.axis, view.sign);
        pointerDown = null;
        return;
      }
    }
    const arYaw = arPresenting() && arLocked;
    const deskYaw = !arPresenting() && e.shiftKey;
    if (arYaw || deskYaw) {
      e.preventDefault();
      e.stopImmediatePropagation();
      pointerDown = null;
      beginYawDrag(e);
      return;
    }
    pointerDown = { x: e.clientX, y: e.clientY };
    if (!arPresenting() && inspectMode()) {
      const hit = hitFocusPlane(e);
      if (hit) {
        const paintZ = editing && slabs.z.focus === 0 && hit.axis === "z";
        if (!paintZ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pointerDown = null;
          beginPlaneDrag(e, hit.axis, hit.point);
        }
      }
    }
  },
  { capture: true },
);
canvas.addEventListener("pointermove", (e) => {
  if (yawDrag) {
    moveYawDrag(e);
    return;
  }
  if (planeDrag) {
    movePlaneDrag(e);
    return;
  }
  if (showGizmo()) {
    const face = gizmo.hover(e.clientX, e.clientY, canvas);
    canvas.style.cursor = face ? "pointer" : "";
  }
  updateHover(e);
});
window.addEventListener("pointermove", (e) => {
  if (yawDrag) moveYawDrag(e);
  else if (planeDrag) movePlaneDrag(e);
});
window.addEventListener("pointerup", (e) => {
  if (yawDrag) {
    endYawDrag(e);
    return;
  }
  if (planeDrag) {
    endPlaneDrag(e);
    return;
  }
  if (!pointerDown) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  pointerDown = null;
  if (dx * dx + dy * dy > 36) return;
  if (e.target !== canvas) return;
  paintAt(e);
});
window.addEventListener("pointercancel", (e) => {
  endYawDrag(e);
  endPlaneDrag(e);
});
canvas.addEventListener("pointerleave", () => {
  gizmo.clearHover();
  canvas.style.cursor = "";
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
    applySlab(activeAxis, { ...slabs[activeAxis], focus: slabs[activeAxis].focus + dir }, "focus");
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
    toggleParallax();
  } else if (e.code === "KeyF") {
    fitVolume();
  } else if (e.code === "Escape") {
    if (arPresenting()) exitAr();
    else if (!parallax) toggleParallax();
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
    applySlab(activeAxis, { ...slabs[activeAxis], focus: slabs[activeAxis].focus + 1 }, "focus");
  } else if (e.code === "BracketRight" || e.code === "ArrowUp") {
    enterInspect();
    applySlab(activeAxis, { ...slabs[activeAxis], focus: slabs[activeAxis].focus - 1 }, "focus");
  } else if (e.code === "Home") {
    if (sourceId === "count") resetCountView();
    else {
      slabs.z.near = 0;
      applySlab("z", { ...slabs.z, focus: 0 }, "focus");
    }
  } else if (e.code === "KeyR") {
    if (sourceId === "count") resetCountView();
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
    if (!planeLock) pinOrbitPivot();
    controls.update();
    maybeExitPlaneLock();
  }
  paths.measure("rend", () => {
    if (arPresenting()) {
      renderer.autoClear = true;
      renderer.render(scene, activeCamera());
      return;
    }
    renderer.autoClear = false;
    renderer.clear();
    const cam = activeCamera();
    renderer.render(scene, cam);
    syncGizmoChrome();
    if (showGizmo()) {
      gizmo.sync(cam);
      gizmo.render(renderer, gizmoHit);
    } else {
      gizmo.clearHover();
    }
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
      ortho: !parallax,
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
        atNow: slabs.z.focus === 0,
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
