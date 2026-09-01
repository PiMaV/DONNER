import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { AXIS_COLOR, COLOR, DEFAULTS, VERSION, clampCubeCap } from "./config.js";
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
import { CONWAY_KIND_HEX, CONWAY_WARMUP_K, countKindHex } from "./encoding.js";
import { focusGeneration } from "./focus.js";
import { drawSparkline, FrameClock, formatSourceHud, formatViewHud } from "./hud.js";
import { cellFromWorldXZ } from "./observe.js";
import { mulberry32 } from "./rng.js";
import { io } from "../vendor/socket.io/socket.io.esm.min.js";
import { WolkeViewer } from "./wolke.js";
import {
  CubeRenderer,
  FocusFrame,
  createFocusSurface,
  createSliceGrid,
  orientSlicePlane,
} from "./renderer.js";
import {
  EventSoA,
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
  productViewDir,
  slabGenerations,
  sliceMaxBack,
  sliceOnlyFromPlaneLock,
  stepFocusBack,
  zBackWorldY,
} from "./axes.js";
import {
  FRAME_PICK_PX,
  closestTOnSegment2,
  distPointToSegment2,
  pickOverlappingFrameHit,
  screenAxisDragMap,
  screenAxisDragStep,
} from "./frame.js";
import {
  fitOrbitDistance,
  orthoFitHalfHeight,
  pinOrbitToOriginXY,
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
import { headlampPose } from "./headlamp.js";
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
const _proj = new THREE.Vector3();
const _grabPoint = new THREE.Vector3();

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
controls.addEventListener("change", () => {
  if (planeLock && isRotateControlState() && !planeDrag) exitPlaneLock();
  else if (alignZ && !planeLock) pinOrbitPivot();
});

const gizmo = new ViewGizmo({ coarse });
const gizmoHit = document.getElementById("gizmo-hit");
const gizmoSlot = document.getElementById("gizmo-slot");
const gizmoCol = document.querySelector(".gizmo-col");
const btnShowPlanes = document.getElementById("btn-show-planes");
function syncGizmoChrome() {
  const on = showGizmo();
  if (gizmoHit) gizmoHit.hidden = !on;
  if (gizmoSlot) gizmoSlot.hidden = !on;
  if (gizmoCol) gizmoCol.hidden = !on;
}
function syncShowPlanesButton() {
  if (!btnShowPlanes) return;
  btnShowPlanes.classList.toggle("is-on", showPlanes);
  btnShowPlanes.setAttribute("aria-pressed", showPlanes ? "true" : "false");
}
syncGizmoChrome();

const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x0a0e13, 0.72);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe6c0, 0.9);
scene.add(key);
scene.add(key.target);
const fill = new THREE.DirectionalLight(0x88ddff, 0.22);
scene.add(fill);
scene.add(fill.target);
const _headPos = new THREE.Vector3();
const _headQuat = new THREE.Quaternion();
const _headScale = new THREE.Vector3();

let soa = new EventSoA(DEFAULTS.maxInstances);
let cubes = new CubeRenderer(turntable, {
  maxCount: DEFAULTS.maxInstances,
  cellSize: DEFAULTS.cellSize,
});
const playfields = {
  x: new FocusFrame(turntable, AXIS_COLOR.x, "focus"),
  y: new FocusFrame(turntable, AXIS_COLOR.y, "focus"),
  z: new FocusFrame(turntable, AXIS_COLOR.z, "focus"),
};
const clipFrames = {
  x: {
    near: new FocusFrame(turntable, AXIS_COLOR.x, "near"),
    far: new FocusFrame(turntable, AXIS_COLOR.x, "far"),
  },
  y: {
    near: new FocusFrame(turntable, AXIS_COLOR.y, "near"),
    far: new FocusFrame(turntable, AXIS_COLOR.y, "far"),
  },
  z: {
    near: new FocusFrame(turntable, AXIS_COLOR.z, "near"),
    far: new FocusFrame(turntable, AXIS_COLOR.z, "far"),
  },
};
for (const a of ["x", "y", "z"]) {
  clipFrames[a].near.setVisible(false);
  clipFrames[a].far.setVisible(false);
}

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
let showPlanes = true;
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
let frameHover = null;
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
  if (a === "z") return zBackWorldY(back, DEFAULTS.timeScale);
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
  if (planeDrag && planeDrag.handle !== "focus") return "hull";
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

function headlampCamera() {
  if (renderer.xr.isPresenting) {
    const xrCam = renderer.xr.getCamera();
    return xrCam.cameras?.[0] || xrCam;
  }
  return activeCamera();
}

function syncHeadlamp() {
  const cam = headlampCamera();
  cam.updateMatrixWorld();
  cam.matrixWorld.decompose(_headPos, _headQuat, _headScale);
  const pose = headlampPose(
    { x: _headPos.x, y: _headPos.y, z: _headPos.z },
    { x: _headQuat.x, y: _headQuat.y, z: _headQuat.z, w: _headQuat.w },
  );
  key.position.set(pose.key.x, pose.key.y, pose.key.z);
  fill.position.set(pose.fill.x, pose.fill.y, pose.fill.z);
  key.target.position.set(pose.target.x, pose.target.y, pose.target.z);
  fill.target.position.set(pose.target.x, pose.target.y, pose.target.z);
  key.target.updateMatrixWorld();
  fill.target.updateMatrixWorld();
}

function setTurntableYaw(rad) {
  turntableYaw = wrapTurntableYaw(rad);
  syncTurntableVisual();
  ui.setYawDegrees(yawDegrees(turntableYaw));
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
  return slabYRange(viewNow(), store.oldestT(), viewNow(), DEFAULTS.timeScale).yMin;
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
  setViewCursor("");
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
  dirtySource = true;
}

function currentSlabY() {
  const span = volumeSpan();
  return slabYRange(viewNow(), span.tLo, span.tHi, DEFAULTS.timeScale);
}

function pinOrbitPivot() {
  if (arPresenting() || !world || !alignZ || planeLock) return;
  const cam = activeCamera();
  if (!Number.isFinite(cam.position.x)) {
    cam.position.set(22, 16, 28);
    controls.target.set(0, 0, 0);
  }
  const pinned = pinOrbitToOriginXY(cam.position, controls.target);
  if (!Number.isFinite(pinned.cam.x) || !Number.isFinite(pinned.target.y)) return;
  cam.position.set(pinned.cam.x, pinned.cam.y, pinned.cam.z);
  controls.target.set(pinned.target.x, pinned.target.y, pinned.target.z);
  cam.lookAt(controls.target);
}

function syncOrbitPan() {
  const free = !arPresenting();
  controls.enablePan = free;
  controls.enableZoom = free;
  controls.enableRotate = free;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
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

function layoutPlayfield(width, height) {
  rebuildSliceVisuals(width, height);
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
  const cs = DEFAULTS.cellSize;
  for (const a of ["x", "y", "z"]) {
    disposeObject3(focusSurfaces[a]);
    focusSurfaces[a] = createFocusSurface(width, height, cs, a, yMin, yMax, AXIS_COLOR[a], "focus");
    turntable.add(focusSurfaces[a]);
    playfields[a].setSize(width, height, cs, a, yMin, yMax);
    for (const handle of ["near", "far"]) {
      clipFrames[a][handle].setSize(width, height, cs, a, yMin, yMax);
    }
  }
  disposeObject3(nowGrid);
  nowGrid = createSliceGrid(width, height, cs, activeAxis, yMin, yMax);
  turntable.add(nowGrid);
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
  lastSpanKey = "";
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
  lastSpanKey = "";
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
  syncClipPlanes();
  updateHint();
}

function exitPlaneLock() {
  if (!planeLock) return;
  planeLock = false;
  applyParallax(true);
  syncClipPlanes();
  dirtyView = true;
  updateHint();
}

function planeRectSize(axis) {
  const box = cropAabb();
  const cs = DEFAULTS.cellSize;
  const ox = (world.width - 1) * 0.5;
  const oz = (world.height - 1) * 0.5;
  const xLo = box ? box.xLo : 0;
  const xHi = box ? box.xHi : world.width - 1;
  const yLo = box ? box.yLo : 0;
  const yHi = box ? box.yHi : world.height - 1;
  const hx = Math.max(Math.abs(xLo - ox), Math.abs(xHi - ox)) * cs;
  const hz = Math.max(Math.abs(yLo - oz), Math.abs(yHi - oz)) * cs;
  const { yMin, yMax } = currentSlabY();
  const hy = Math.max(cs, Math.abs(yMax - yMin) / 2);
  const a = normalizeSliceAxis(axis);
  if (a === "x") return { width: hz * 2, height: hy * 2 };
  if (a === "y") return { width: hx * 2, height: hy * 2 };
  return { width: hx * 2, height: hz * 2 };
}

function enterPlaneLock(axis, sign) {
  if (arPresenting() || !world) return;
  setActiveAxis(axis, { keepPlaneLock: true });
  applyParallax(false);
  planeLock = true;
  syncOrbitPan();
  syncClipPlanes();
  clearFrameHover();
  const a = normalizeSliceAxis(axis);
  const coord = sliceWorldCoord(slabs[a].focus, a);
  const { yMid } = currentSlabY();
  if (a === "x") controls.target.set(coord, yMid, 0);
  else if (a === "y") controls.target.set(0, yMid, coord);
  else controls.target.set(0, coord, 0);
  const { width, height } = planeRectSize(a);
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const halfH = orthoFitHalfHeight(width, height, aspect, 1.16);
  const cam = activeCamera();
  const radius = Math.hypot(width, height) / 2;
  const dist = Math.max(16, radius * 2.4);
  const pos = snapPose(controls.target, productViewDir(a, sign), dist);
  cam.position.set(pos.x, pos.y, pos.z);
  cam.lookAt(controls.target);
  setOrthoFrustum(orthoCam, halfH, aspect, 0.1, Math.max(400, dist + radius * 4));
  orthoCam.zoom = 1;
  orthoCam.lookAt(controls.target);
  controls.update();
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
  const chrome = !planeLock && !arPresenting();
  const cut = planeLock && !arPresenting();
  if (nowGrid) {
    nowGrid.visible = (chrome && showPlanes) || cut;
    setLineOpacity(nowGrid, inspect || cut ? 0.42 : 0.18);
  }
  for (const a of ["x", "y", "z"]) {
    const surf = focusSurfaces[a];
    const showFrame = cut ? a === activeAxis : chrome && showPlanes && (a === "z" || inspect);
    if (surf) {
      const pickEdit = editing && a === "z" && chrome;
      const pickCut = cut && a === activeAxis;
      surf.visible = pickEdit || pickCut;
      surf.material.opacity = 0;
    }
    playfields[a].setVisible(showFrame);
    if (!showFrame || cut) {
      clipFrames[a].near.setVisible(false);
      clipFrames[a].far.setVisible(false);
    }
    playfields[a].setEmphasis(inspect && a === activeAxis ? "active" : a === "z" ? "active" : "idle");
  }
}

function syncClipPlanes() {
  if (!world) return;
  const { yMin, yMax } = brickYRange();
  const chrome = !planeLock && !arPresenting();
  const showClips = chrome && showPlanes && inspectMode() && !stackLiveLocked();
  const cs = DEFAULTS.cellSize;
  const w = world.width;
  const h = world.height;
  for (const a of ["x", "y", "z"]) {
    const s = slabs[a];
    const show = chrome && showPlanes && (a === "z" || inspectMode());
    const coord = sliceWorldCoord(s.focus, a);
    playfields[a].setSize(w, h, cs, a, yMin, yMax);
    playfields[a].setOffset(a, coord);
    if (focusSurfaces[a]) {
      orientSlicePlane(focusSurfaces[a], a, w, h, cs, yMin, yMax, coord);
    }
    const nearOn = showClips && show && s.near !== s.focus;
    const farOn = showClips && show && s.far !== s.focus;
    clipFrames[a].near.setVisible(nearOn);
    clipFrames[a].far.setVisible(farOn);
    if (nearOn) {
      clipFrames[a].near.setSize(w, h, cs, a, yMin, yMax);
      clipFrames[a].near.setOffset(a, sliceWorldCoord(s.near, a));
    }
    if (farOn) {
      clipFrames[a].far.setSize(w, h, cs, a, yMin, yMax);
      clipFrames[a].far.setOffset(a, sliceWorldCoord(s.far, a));
    }
  }
  if (nowGrid) {
    orientSlicePlane(
      nowGrid,
      activeAxis,
      w,
      h,
      cs,
      yMin,
      yMax,
      sliceWorldCoord(slabs[activeAxis].focus, activeAxis),
    );
  }
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
    ui.setHint("Slice — wheel zooms · right-drag pans · left-drag leaves · Shift+wheel pages · B restores 3D");
  } else if (sourceId === "count") {
    ui.setHint(
      countVol && isDenseCount(countVol)
        ? "Dense cube — hover a frame edge to grab it · Play walks the playhead"
        : playing
          ? "Count stack — Play scrubs Z through the recording · Pause to inspect"
          : "Count stack — grab a frame edge to move that plane · Play scrubs the active axis",
    );
  } else if (tapeMode && stoppedStable) {
    ui.setHint(
      `Inspect — ash · period ≤ ${MAX_OSC_PERIOD} for ${DEFAULTS.stableHold} gens · grab a frame edge · Play is live`,
    );
  } else if (tapeMode) {
    ui.setHint("Inspect — hover a frame edge to grab it · clips crop the AABB · Play returns to live");
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
    ui.setHint("Live — Pause to inspect the cache · orbit · pinch zoom");
  } else {
    ui.setHint("Inspect — hover a frame edge to grab it · clips crop the AABB · Play returns to live");
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
    tNow: viewNow(),
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
}

function spanKey() {
  const span = volumeSpan();
  const box = cropAabb();
  const s = slabs[activeAxis];
  return `${span.tLo}:${span.tHi}:${activeAxis}:${inspectShade()}:${s.near}:${s.focus}:${s.far}:${box ? `${box.xLo}:${box.xHi}:${box.yLo}:${box.yHi}` : "live"}`;
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

function isRotateControlState() {
  const s = controls.state;
  return s === 0 || s === 3 || s === 6;
}

function setViewCursor(kind) {
  if (kind) canvas.dataset.cursor = kind;
  else delete canvas.dataset.cursor;
}

function canGrabFrames() {
  return !arPresenting() && !planeLock && inspectMode() && showPlanes;
}

function projectFramePoint(x, y, z, cam, rect) {
  _proj.set(x, y, z).project(cam);
  if (!Number.isFinite(_proj.x) || _proj.z < -1 || _proj.z > 1) return null;
  return {
    x: rect.left + (_proj.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-_proj.y * 0.5 + 0.5) * rect.height,
    depth: _proj.z,
  };
}

function collectFramePick(frame, event, cam, rect, into) {
  if (!frame.group.visible) return;
  const { axis, handle } = frame.pickMeta();
  let best = null;
  for (const seg of frame.edgeWorldSegments()) {
    const pa = projectFramePoint(seg.ax, seg.ay, seg.az, cam, rect);
    const pb = projectFramePoint(seg.bx, seg.by, seg.bz, cam, rect);
    if (!pa || !pb) continue;
    const pixelDist = distPointToSegment2(event.clientX, event.clientY, pa.x, pa.y, pb.x, pb.y);
    if (best && pixelDist >= best.pixelDist) continue;
    const t = closestTOnSegment2(event.clientX, event.clientY, pa.x, pa.y, pb.x, pb.y);
    const point = {
      x: seg.ax + t * (seg.bx - seg.ax),
      y: seg.ay + t * (seg.by - seg.ay),
      z: seg.az + t * (seg.bz - seg.az),
    };
    best = {
      axis,
      handle,
      pixelDist,
      depth: (pa.depth + pb.depth) * 0.5,
      viewDir: {
        x: point.x - cam.position.x,
        y: point.y - cam.position.y,
        z: point.z - cam.position.z,
      },
      point,
    };
  }
  if (best) into.push(best);
}

function hitWorkPlane(event) {
  if (!canGrabFrames()) return null;
  const cam = activeCamera();
  const rect = canvas.getBoundingClientRect();
  const candidates = [];
  for (const a of ["x", "y", "z"]) {
    collectFramePick(playfields[a], event, cam, rect, candidates);
    collectFramePick(clipFrames[a].near, event, cam, rect, candidates);
    collectFramePick(clipFrames[a].far, event, cam, rect, candidates);
  }
  const picked = pickOverlappingFrameHit(candidates, frameHover, FRAME_PICK_PX);
  if (!picked) return null;
  _grabPoint.set(picked.point.x, picked.point.y, picked.point.z);
  return {
    axis: picked.axis,
    handle: picked.handle,
    point: _grabPoint,
  };
}

function setFrameHover(hit) {
  const key = hit ? `${hit.axis}:${hit.handle}` : "";
  if (key === frameHover) return;
  frameHover = key;
  for (const a of ["x", "y", "z"]) {
    playfields[a].setHover(Boolean(hit && hit.axis === a && hit.handle === "focus"));
    clipFrames[a].near.setHover(Boolean(hit && hit.axis === a && hit.handle === "near"));
    clipFrames[a].far.setHover(Boolean(hit && hit.axis === a && hit.handle === "far"));
  }
}

function clearFrameHover() {
  setFrameHover(null);
}

function worldAxisDir(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0);
}

function beginPlaneDrag(event, axis, handle, grabPoint) {
  const key = handle === "near" || handle === "far" ? handle : "focus";
  setActiveAxis(axis);
  if (inspectMode() && key === "focus") setShadeHeld(true);
  const cam = activeCamera();
  const axisDir = worldAxisDir(axis);
  const scale = axis === "z" ? DEFAULTS.timeScale : DEFAULTS.cellSize;
  const rect = canvas.getBoundingClientRect();
  const mapped = screenAxisDragMap(grabPoint, axisDir, scale, (p) =>
    projectFramePoint(p.x, p.y, p.z, cam, rect),
  );
  planeDrag = {
    pointerId: event.pointerId,
    axis,
    handle: key,
    pointer0: { x: event.clientX, y: event.clientY },
    mapped,
    value0: slabs[axis][key],
  };
  controls.enabled = false;
  setViewCursor("frame");
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* already captured */
  }
}

function movePlaneDrag(event) {
  if (!planeDrag || event.pointerId !== planeDrag.pointerId) return;
  if (!planeDrag.mapped) return;
  const dx = event.clientX - planeDrag.pointer0.x;
  const dy = event.clientY - planeDrag.pointer0.y;
  const step = screenAxisDragStep(dx, dy, planeDrag.mapped);
  const next = planeDrag.value0 - step;
  applySlab(
    planeDrag.axis,
    { ...slabs[planeDrag.axis], [planeDrag.handle]: next },
    planeDrag.handle,
  );
}

function endPlaneDrag(event) {
  if (!planeDrag) return;
  if (event && event.pointerId !== planeDrag.pointerId) return;
  planeDrag = null;
  setShadeHeld(false);
  if (!arPresenting()) controls.enabled = true;
  setViewCursor("");
}

function paintAt(event) {
  if (planeLock || sourceId === "count" || !editing || slabs.z.focus !== 0) return;
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
  clearFrameHover();
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
    yaw: turntableYaw,
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
  setTurntableYaw(next);
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

if (btnShowPlanes) {
  btnShowPlanes.addEventListener("click", () => {
    showPlanes = !showPlanes;
    syncShowPlanesButton();
    if (!showPlanes) setFrameHover(null);
    syncClipPlanes();
  });
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
    if (arYaw) {
      e.preventDefault();
      e.stopImmediatePropagation();
      pointerDown = null;
      beginYawDrag(e);
      return;
    }
    pointerDown = { x: e.clientX, y: e.clientY };
    if (planeLock) return;
    if (canGrabFrames()) {
      const hit = hitWorkPlane(e);
      if (hit) {
        const paintZ =
          editing && slabs.z.focus === 0 && hit.axis === "z" && hit.handle === "focus";
        if (!paintZ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pointerDown = null;
          beginPlaneDrag(e, hit.axis, hit.handle, hit.point);
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
    setViewCursor("drag");
    movePlaneDrag(e);
    return;
  }
  const face = showGizmo() ? gizmo.hover(e.clientX, e.clientY, canvas) : null;
  const hit = canGrabFrames() ? hitWorkPlane(e) : null;
  setFrameHover(hit);
  if (face) setViewCursor("pointer");
  else if (hit) setViewCursor("frame");
  else setViewCursor("");
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
  setViewCursor("");
  clearFrameHover();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const dir = Math.sign(e.deltaY) || 1;
    if (!inspectMode()) enterInspect();
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
  paths.record("hover", 0);
  if (arPresenting()) {
    updateReticle(xrFrame);
    if (arPlacePending) {
      placeStageInFrontOfViewer();
      arPlacePending = false;
    }
    if (arPlaced) applyArStagePose();
  } else {
    controls.update();
    if (!planeLock) pinOrbitPivot();
  }
  syncHeadlamp();
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
