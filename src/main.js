import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { AXIS_COLOR, COLOR, COUNT_DEMOS, DEFAULTS, VERSION, clampCubeCap } from "./config.js";
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
import { CONWAY_KIND_HEX, CONWAY_BASE_K, countKindHex } from "./encoding.js";
import { focusGeneration } from "./focus.js";
import { drawSparkline, FrameClock, formatSourceHud, formatViewHud } from "./hud.js";
import { cellFromWorldXZ, voxelFromLocal } from "./observe.js";
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
  denseGhostToSlice,
  effectiveShade,
  fociFromSlabs,
  inspectRebuildKey,
  focusBackFromVoxel,
  normalizeSliceAxis,
  productViewDir,
  resetSlabClips,
  lockedFaceAction,
  lockedFacePageStep,
  slabGenerations,
  sliceMaxBack,
  sliceOnlyFromPlaneLock,
  stepFocusBack,
  zBackWorldY,
} from "./axes.js";
import {
  FRAME_PICK_M,
  FRAME_PICK_PX,
  closestTOnSegment2,
  distPointToSegment2,
  distRayToSegment3,
  pickOverlappingFrameHit,
  pointerGrabsFrames,
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
  arStandLift,
  clampArMag,
  isImmersiveArSupported,
  isHeadsetBrowser,
  normalizeStandAxis,
  overlayRootForAr,
  preferredReferenceSpaceType,
  requestImmersiveAr,
  requestViewerHitTestSource,
  shouldFallbackArPlace,
  spaceDragAnchor,
  spaceDragOffset,
  standQuatFromAxis,
  viewerFrontPosition,
  volumeLocalAabb,
  withXrWebGLLayerOnly,
  xrStageScale,
} from "./xr.js";
import {
  XR_PINCH_MIN_M,
  distance3,
  gripPressed,
  isHeadsetArSession,
  magFromPinch,
  rayFromPose,
  strongestStickX,
  thumbstickXFromAxes,
  trackedInputSources,
  yawDeltaFromStick,
} from "./xr-hud.js";

const canvas = document.getElementById("view");
const hudViewEl = document.getElementById("hud-view");
const hudSrcEl = document.getElementById("hud-src");
const hudSparkEl = document.getElementById("hud-spark");
const hudBenchEl = document.getElementById("hud-bench");
const hudGpuEl = document.getElementById("hud-gpu");
const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = `v${VERSION}`;

const coarse = window.matchMedia("(pointer: coarse)").matches;
const headsetBrowser = isHeadsetBrowser(navigator.userAgent || "");
const gizmoNarrowMq = window.matchMedia("(max-width: 720px)");
function showGizmo() {
  return gizmoOnScreen({
    coarse,
    narrow: gizmoNarrowMq.matches,
    ar: arPresenting() || headsetBrowser,
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
renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, headsetBrowser || coarse ? 1.5 : 2),
);
renderer.xr.enabled = true;
renderer.autoClear = true;

const scene = new THREE.Scene();
const fog = new THREE.Fog(COLOR.bg, 48, 160);
scene.fog = fog;
const stage = new THREE.Group();
stage.name = "stage";
scene.add(stage);
const stand = new THREE.Group();
stand.name = "stand";
stage.add(stand);
const turntable = new THREE.Group();
turntable.name = "turntable";
stand.add(turntable);
const reticle = createArReticle();
scene.add(reticle);
let xrHud;
try {
  xrHud = createXrHud();
} catch (err) {
  console.warn("XR HUD init failed", err);
  xrHud = new THREE.Group();
  xrHud.name = "xr-hud";
  xrHud.visible = false;
}
scene.add(xrHud);
const xrControllers = [0, 1].map((i) => {
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener("select", onArSelect);
  ctrl.addEventListener("selectstart", onArSelectStart);
  ctrl.addEventListener("selectend", onArSelectEnd);
  scene.add(ctrl);
  ctrl.add(createXrRay());
  return ctrl;
});
const xrGrips = [0, 1].map((i) => {
  const grip = renderer.xr.getControllerGrip(i);
  scene.add(grip);
  return grip;
});
const _xrPos = new THREE.Vector3();
const _xrQuat = new THREE.Quaternion();
const _xrScale = new THREE.Vector3();
const _xrUp = new THREE.Vector3();
const _xrDir = new THREE.Vector3();
const _hudWorldPos = new THREE.Vector3();
const _gripB = new THREE.Vector3();
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
let planeLockSign = 1;
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
let arHitStartedAt = 0;
let arHitTestSource = null;
let arPlaced = false;
let arUseHitTest = false;
let arAnchored = false;
let arLocked = false;
let arHeadsetHud = false;
let arPinch = null;
let arMag = XR_MAG_DEFAULT;
let arStandAxis = "z";
let arFrameDrag = null;
let arPlanePoke = false;
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
  resetClips: resetClipExtent,
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
    dirtyView = true;
  },
  benchFlags: () => {
    const cfg = ui.getConfig();
    const neighChanged = cfg.neighborhoodRadius !== neighborhoodRadius;
    const dynChanged = cfg.dynamics !== dynamicsOn;
    dynamicsOn = cfg.dynamics;
    neighborhoodRadius = cfg.neighborhoodRadius;
    stabScaleOn = cfg.stabScale;
    encodingMinimal = cfg.encodingMinimal;
    forceFullRebuild = cfg.forceFullRebuild;
    if (neighChanged) {
      restampConway();
      dirtySource = true;
    } else if (dynChanged || forceFullRebuild) {
      dirtySource = true;
    } else {
      dirtyView = true;
    }
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
  countFile: (file) => {
    loadCountFromFile(file);
  },
  countSize: () => {
    countSizeByCount = ui.getConfig().countSize;
    dirtyView = true;
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
  arStand: (axis) => setArStandAxis(axis),
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
  if (!inspectMode()) return null;
  if (arPresenting() && !arPlanePoke) return null;
  if (planeDrag && planeDrag.handle !== "focus") return "hull";
  const dense = sourceId === "count" && isDenseCount(countVol);
  if (arPlanePoke) return denseGhostToSlice("ghost", dense);
  return denseGhostToSlice(effectiveShade(shadeMode, shadeHeld), dense);
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

function createXrRay() {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -0.7),
  ]);
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({
      color: COLOR.cyan,
      depthWrite: false,
      transparent: true,
      opacity: 0.65,
    }),
  );
  line.name = "xr-ray";
  line.visible = false;
  line.frustumCulled = false;
  line.renderOrder = 12;
  return line;
}

function createXrHud() {
  const group = new THREE.Group();
  group.name = "xr-hud";
  group.visible = false;
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
  stand.quaternion.identity();
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

function arLockedChrome() {
  return arPresenting() && arLocked;
}

function arVolumeBox() {
  const store = viewStore();
  if (!world || !store) return volumeLocalAabb(1, 1, 0, 0, DEFAULTS.cellSize);
  const y = slabYRange(viewNow(), store.oldestT(), viewNow(), DEFAULTS.timeScale);
  return volumeLocalAabb(world.width, world.height, y.yMin, y.yMax, DEFAULTS.cellSize);
}

function applyStandQuat() {
  if (!arPresenting()) {
    stand.quaternion.identity();
    return;
  }
  const q = standQuatFromAxis(arStandAxis);
  stand.quaternion.set(q.x, q.y, q.z, q.w);
}

function setArStandAxis(next) {
  const a = normalizeStandAxis(next);
  if (a === arStandAxis) {
    applyArStagePose();
    ui.setArStandAxis?.(a);
    return;
  }
  arStandAxis = a;
  applyArStagePose();
  ui.setArStandAxis?.(a);
  applyGridLook();
  updateHint();
}

function applyArStagePose() {
  if (!arPresenting() || !arAnchored || !world) return;
  const s = xrStageScale(DEFAULTS.cellSize, arMag);
  if (!(s > 0)) return;
  stage.quaternion.copy(arAnchorQuat);
  stage.scale.setScalar(s);
  applyStandQuat();
  const lift = arStandLift(arStandAxis, arVolumeBox(), s);
  const dy = Number.isFinite(lift) ? lift : 0;
  _xrUp.set(0, 1, 0).applyQuaternion(arAnchorQuat);
  stage.position.copy(arAnchorPos).addScaledVector(_xrUp, dy);
  if (!Number.isFinite(stage.position.x)) {
    stage.position.copy(arAnchorPos);
  }
  stage.visible = true;
}

function captureViewerAnchor() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.updateMatrixWorld();
  cam.getWorldPosition(_xrPos);
  cam.getWorldQuaternion(_xrQuat);
  if (
    !Number.isFinite(_xrPos.x) ||
    !Number.isFinite(_xrPos.y) ||
    !Number.isFinite(_xrPos.z) ||
    !Number.isFinite(_xrQuat.w)
  ) {
    return;
  }
  const front = viewerFrontPosition(
    { x: _xrPos.x, y: _xrPos.y, z: _xrPos.z },
    { x: _xrQuat.x, y: _xrQuat.y, z: _xrQuat.z, w: _xrQuat.w },
  );
  arAnchorPos.set(front.x, front.y, front.z);
  arAnchorQuat.identity();
  arAnchored = true;
  arPlaced = true;
  applyArStagePose();
}

function lockArPlacement() {
  if (arLocked) return;
  if (!arAnchored) captureViewerAnchor();
  arLocked = true;
  arPlaced = true;
  arPlacePending = false;
  applyArStagePose();
  ui.setArYawEnabled(true);
  syncClipPlanes();
  updateHint();
}

function placeStageInFrontOfViewer() {
  captureViewerAnchor();
  lockArPlacement();
}

function placeStageFromReticle() {
  if (arLocked || !reticle.visible) return;
  reticle.matrix.decompose(arAnchorPos, arAnchorQuat, _xrScale);
  arAnchored = true;
  arPlaced = true;
  lockArPlacement();
  reticle.visible = false;
}

function onArSelect() {
  if (!arPresenting() || arLocked) return;
  if (arUseHitTest && reticle.visible) placeStageFromReticle();
  else lockArPlacement();
}

function setXrRaysVisible(on) {
  for (const ctrl of xrControllers) {
    const ray = ctrl.getObjectByName("xr-ray");
    if (ray) ray.visible = Boolean(on);
  }
}

function refreshHeadsetHud() {
  const session = renderer.xr.getSession();
  arHeadsetHud = Boolean(
    session && isHeadsetArSession(session, globalThis.navigator?.userAgent || ""),
  );
}

function controllerWorldRay(ctrl) {
  ctrl.updateMatrixWorld(true);
  ctrl.getWorldPosition(_xrPos);
  ctrl.getWorldQuaternion(_xrQuat);
  return rayFromPose(
    { x: _xrPos.x, y: _xrPos.y, z: _xrPos.z },
    { x: _xrQuat.x, y: _xrQuat.y, z: _xrQuat.z, w: _xrQuat.w },
  );
}

function collectArFramePick(frame, origin, dir, into) {
  if (!frame.group.visible) return;
  const { axis, handle } = frame.pickMeta();
  for (const seg of frame.edgeWorldSegments()) {
    const hit = distRayToSegment3(
      origin.x,
      origin.y,
      origin.z,
      dir.x,
      dir.y,
      dir.z,
      seg.ax,
      seg.ay,
      seg.az,
      seg.bx,
      seg.by,
      seg.bz,
    );
    if (hit.dist > FRAME_PICK_M) continue;
    if (into && into.dist != null && hit.dist > into.dist) continue;
    if (into && into.dist === hit.dist && hit.t >= into.t) continue;
    into.axis = axis;
    into.handle = handle;
    into.dist = hit.dist;
    into.t = hit.t;
  }
}

function hitArFrame(origin, dir) {
  if (!arLockedChrome() || !showPlanes) return null;
  const best = {};
  for (const a of ["x", "y", "z"]) {
    collectArFramePick(playfields[a], origin, dir, best);
    collectArFramePick(clipFrames[a].near, origin, dir, best);
    collectArFramePick(clipFrames[a].far, origin, dir, best);
  }
  if (!best.axis) return null;
  return { axis: best.axis, handle: best.handle };
}

function beginArSpaceDrag(ctrl, hit) {
  ctrl.updateMatrixWorld(true);
  ctrl.getWorldPosition(_xrPos);
  arFrameDrag = {
    kind: "space",
    ctrl,
    offset: spaceDragOffset(arAnchorPos, _xrPos),
  };
  setFrameHover({ axis: hit.axis, handle: hit.handle });
}

function updateArFrameDrag() {
  if (!arFrameDrag || arFrameDrag.kind !== "space") return;
  arFrameDrag.ctrl.updateMatrixWorld(true);
  arFrameDrag.ctrl.getWorldPosition(_xrPos);
  const next = spaceDragAnchor(_xrPos, arFrameDrag.offset);
  arAnchorPos.set(next.x, next.y, next.z);
  applyArStagePose();
}

function endArFrameDrag(ctrl) {
  if (!arFrameDrag) return;
  if (ctrl && arFrameDrag.ctrl !== ctrl) return;
  arFrameDrag = null;
  setFrameHover(null);
}

function pokeArVoxel(origin, dir) {
  if (!world) return false;
  raycaster.far = 12;
  raycaster.ray.origin.set(origin.x, origin.y, origin.z);
  _xrDir.set(dir.x, dir.y, dir.z);
  if (_xrDir.lengthSq() < 1e-12) return false;
  _xrDir.normalize();
  raycaster.ray.direction.copy(_xrDir);
  const hits = raycaster.intersectObjects([cubes.solid, cubes.ghost], false);
  if (!hits.length) return false;
  _hitLocal.copy(hits[0].point);
  turntable.worldToLocal(_hitLocal);
  const voxel = voxelFromLocal(
    _hitLocal.x,
    _hitLocal.y,
    _hitLocal.z,
    world.width,
    world.height,
    DEFAULTS.cellSize,
    viewNow(),
    DEFAULTS.timeScale,
  );
  if (!voxel) return false;
  const axis = arStandAxis;
  const back = focusBackFromVoxel(
    axis,
    voxel.x,
    voxel.y,
    voxel.t,
    world.width,
    world.height,
    viewNow(),
  );
  arPlanePoke = true;
  enterInspect();
  setActiveAxis(axis);
  applySlab(axis, { ...slabs[axis], focus: back }, "focus");
  return true;
}

function onArSelectStart(event) {
  if (!arPresenting() || !arLocked) return;
  const ctrl = event.target;
  const ray = controllerWorldRay(ctrl);
  const frameHit = hitArFrame(ray.origin, ray.dir);
  if (frameHit) {
    beginArSpaceDrag(ctrl, frameHit);
    return;
  }
  pokeArVoxel(ray.origin, ray.dir);
}

function onArSelectEnd(event) {
  endArFrameDrag(event.target);
}

function setArMag(next) {
  arMag = clampArMag(next);
  const el = document.getElementById("ar-mag");
  if (el) el.value = String(arMag);
  applyArStagePose();
}

function updateXrControllerPose(dt) {
  if (!arPresenting() || !arLocked) {
    arPinch = null;
    if (arFrameDrag) updateArFrameDrag();
    return;
  }
  if (arFrameDrag) {
    updateArFrameDrag();
    return;
  }
  if (!arHeadsetHud) {
    arPinch = null;
    return;
  }
  const sources = trackedInputSources(renderer.xr.getSession());
  const gripping = sources.filter((s) => gripPressed(s.gamepad));
  if (gripping.length >= 2) {
    xrGrips[0].updateMatrixWorld(true);
    xrGrips[1].updateMatrixWorld(true);
    xrGrips[0].getWorldPosition(_hudWorldPos);
    xrGrips[1].getWorldPosition(_gripB);
    const dist = distance3(
      { x: _hudWorldPos.x, y: _hudWorldPos.y, z: _hudWorldPos.z },
      { x: _gripB.x, y: _gripB.y, z: _gripB.z },
    );
    if (!(dist >= XR_PINCH_MIN_M)) return;
    if (!arPinch) arPinch = { dist, mag: arMag };
    else setArMag(magFromPinch(arPinch.mag, arPinch.dist, dist));
    return;
  }
  arPinch = null;
  const x = strongestStickX(sources.map((s) => thumbstickXFromAxes(s.gamepad?.axes)));
  const dYaw = yawDeltaFromStick(x, dt);
  if (dYaw) setTurntableYaw(turntableYaw + dYaw);
}

function updateXrHud() {
  refreshHeadsetHud();
  xrHud.visible = false;
  setXrRaysVisible(arPresenting() && arLocked && arHeadsetHud);
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
  let hits;
  try {
    hits = xrFrame.getHitTestResults(arHitTestSource);
  } catch {
    reticle.visible = false;
    return;
  }
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
  const overlay = overlayRootForAr(
    document.getElementById("xr-overlay"),
    navigator.userAgent || "",
  );
  try {
    const session = await requestImmersiveAr(xr, overlay);
    const space = await preferredReferenceSpaceType(session);
    renderer.xr.setReferenceSpaceType(space);
    const attach = () => renderer.xr.setSession(session);
    if (headsetBrowser) {
      await withXrWebGLLayerOnly(attach);
    } else {
      await attach();
    }
  } catch (err) {
    console.warn("WebXR session failed", err);
  }
}

function exitAr() {
  const session = renderer.xr.getSession();
  if (session) session.end();
}

async function onArSessionStart() {
  try {
    document.documentElement.classList.add("is-ar");
    document.body.classList.add("is-ar");
    gizmo.clearHover();
    setViewCursor("");
    syncGizmoChrome();
    renderer.setClearAlpha(0);
    renderer.setScissorTest(false);
    controls.enabled = false;
    arPlacePending = false;
    arHitStartedAt = performance.now();
    arPlaced = false;
    arAnchored = false;
    arLocked = false;
    arUseHitTest = false;
    if (arHitTestSource && typeof arHitTestSource.cancel === "function") {
      arHitTestSource.cancel();
    }
    arHitTestSource = null;
    stage.visible = true;
    reticle.visible = false;
    arHeadsetHud = false;
    arPinch = null;
    arFrameDrag = null;
    arPlanePoke = false;
    arStandAxis = "z";
    stand.quaternion.identity();
    ui.setArYawEnabled(true);
    ui.setArStandAxis?.("z");
    captureViewerAnchor();
    const session = renderer.xr.getSession();
    requestViewerHitTestSource(session).then((src) => {
      if (!arPresenting() || arLocked) return;
      arHitTestSource = src;
      arUseHitTest = Boolean(src);
      ui.setArYawEnabled(!arUseHitTest);
      updateHint();
    });
    syncTurntableVisual();
    xrHud.visible = false;
    setXrRaysVisible(false);
    dirtySource = true;
    dirtyView = true;
    syncFog();
    ui.setArActive(true);
    updateHint();
  } catch (err) {
    console.warn("DONNER AR session start", err);
    if (arPresenting() && !arLocked) {
      stage.visible = true;
      captureViewerAnchor();
    }
  }
}

function onArSessionEnd() {
  document.documentElement.classList.remove("is-ar");
  document.body.classList.remove("is-ar");
  renderer.setClearAlpha(1);
  controls.enabled = true;
  arPlacePending = false;
  arHitStartedAt = 0;
  arHeadsetHud = false;
  arPinch = null;
  arFrameDrag = null;
  arPlanePoke = false;
  arStandAxis = "z";
  ui.setArStandAxis?.("z");
  xrHud.visible = false;
  setXrRaysVisible(false);
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
  resize();
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

function resetClipExtent() {
  if (!world) return;
  slabs = resetSlabClips(
    slabs,
    Math.max(0, world.width - 1),
    Math.max(0, world.height - 1),
    maxTimeBack(),
  );
  syncStackUi();
  syncClipPlanes();
  updateHint();
  dirtyView = true;
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
  const shade = inspectShade();
  const hullFocus =
    inspectMode() &&
    shade === "hull" &&
    dragged === "focus" &&
    !decay &&
    !planeLock;
  dirtyView = !hullFocus || (sourceId !== "count" && stabScaleOn && stabMode === "focus");
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
  arPlanePoke = false;
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
    if (!m) continue;
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

function restampConway() {
  if (sourceId !== "conway" || !world) return;
  const opts = { wrap: world.wrap, neighborhoodRadius };
  if (ring && typeof ring.setClassify === "function") {
    ring.setClassify(opts);
    ring.stampAll(world.width, world.height);
  }
  if (tape && typeof tape.setClassify === "function") {
    tape.setClassify(opts);
    tape.stampAll(world.width, world.height);
  }
}

function encodingBaseK() {
  return sourceId === "count" ? -1 : CONWAY_BASE_K;
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
  ui.setSourceKind(countKindForVolume(vol));
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

function countKindForVolume(vol) {
  const name = vol && vol.name;
  for (const [id, demo] of Object.entries(COUNT_DEMOS)) {
    if (demo.name === name) return id;
  }
  return "count";
}

async function loadCountFromUrl(url, name, kind = "count") {
  ui.setSourceKind(kind);
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

function switchSource(kind) {
  if (kind === "conway") {
    disconnectWolke();
    bootWorld(true);
    return;
  }
  const demo = COUNT_DEMOS[kind];
  if (demo) {
    loadCountFromUrl(demo.url, demo.name, kind);
    return;
  }
  if (countVol) {
    ui.setSourceKind("count");
    bootCount(countVol);
    return;
  }
  ui.setSourceKind("count");
  ui.setCountHint("Load a .npy cube or Connect to the sidecar.");
  updateHint();
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
  const classify = { wrap: world.wrap, neighborhoodRadius };
  ring.setClassify(classify);
  tape.setClassify(classify);
  ring.pushGrid(world.grid, world.width, world.height, world.generation);
  tape.pushGrid(world.grid, world.width, world.height, world.generation);
  layoutPlayfield(cfg.width, cfg.height);
  cubes.setKindHex(CONWAY_KIND_HEX, CONWAY_BASE_K);
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

function pageActiveFocus(dir) {
  if (!inspectMode()) enterInspect();
  applySlab(activeAxis, { ...slabs[activeAxis], focus: slabs[activeAxis].focus + dir }, "focus");
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
  const a = normalizeSliceAxis(axis);
  const s = sign >= 0 ? 1 : -1;
  if (lockedFaceAction(planeLock, activeAxis, planeLockSign, a, s) === "page") {
    pageActiveFocus(lockedFacePageStep(s));
    updateHint();
    return;
  }
  setActiveAxis(a, { keepPlaneLock: true });
  applyParallax(false);
  planeLock = true;
  planeLockSign = s;
  syncOrbitPan();
  syncClipPlanes();
  clearFrameHover();
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
  const pos = snapPose(controls.target, productViewDir(a, s), dist);
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
  if (planeLock && !opts.keepPlaneLock && a !== activeAxis) {
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
    warmupK: encodingBaseK(),
  });
  dirtySource = true;
}

function applyGridLook() {
  const inspect = inspectMode();
  const arChrome = arLockedChrome();
  const chrome = (!planeLock && !arPresenting()) || arChrome;
  const cut = planeLock && !arPresenting();
  if (nowGrid) {
    nowGrid.visible = (!arPresenting() && chrome && showPlanes) || cut;
    setLineOpacity(nowGrid, inspect || cut ? 0.42 : 0.18);
  }
  for (const a of ["x", "y", "z"]) {
    const surf = focusSurfaces[a];
    const showFrame = cut
      ? a === activeAxis
      : chrome && showPlanes && (arChrome || a === "z" || inspect);
    if (surf) {
      const pickEdit = editing && a === "z" && chrome && !arPresenting();
      const pickCut = cut && a === activeAxis;
      surf.visible = pickEdit || pickCut;
      surf.material.opacity = 0;
    }
    playfields[a].setVisible(showFrame);
    if (!showFrame || cut) {
      clipFrames[a].near.setVisible(false);
      clipFrames[a].far.setVisible(false);
    }
    playfields[a].setEmphasis(
      arChrome
        ? a === arStandAxis
          ? "active"
          : "idle"
        : inspect && a === activeAxis
          ? "active"
          : a === "z"
            ? "active"
            : "idle",
    );
  }
}

function syncClipPlanes() {
  if (!world) return;
  const { yMin, yMax } = brickYRange();
  const arChrome = arLockedChrome();
  const chrome = (!planeLock && !arPresenting()) || arChrome;
  const showClips = chrome && showPlanes && inspectMode() && !stackLiveLocked();
  const cs = DEFAULTS.cellSize;
  const w = world.width;
  const h = world.height;
  for (const a of ["x", "y", "z"]) {
    const s = slabs[a];
    const show = chrome && showPlanes && (arChrome || a === "z" || inspectMode());
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
      ui.setHint(
        arHeadsetHud
          ? "AR — grab a frame to slide the volume · poke a cube to isolate the standing plane · stick yaws · both grips pinch size"
          : "AR — Stand X/Y/Z on the overlay · grab a frame to slide the volume · tap a cube to isolate the standing plane · yaw · Exit to orbit",
      );
    } else {
      ui.setHint("AR — yaw the volume · walk around with the phone · Exit returns to orbit");
    }
  } else if (planeLock) {
    ui.setHint("Slice — wheel zooms · same-face click pages · right-drag pans · left-drag leaves · Shift+wheel pages · B restores 3D");
  } else if (sourceId === "count") {
    ui.setHint(
      countVol && isDenseCount(countVol)
        ? "Dense cube — sliders move planes · Play walks the playhead"
        : playing
          ? "Count stack — Play scrubs Z through the recording · Pause to inspect"
          : coarse
            ? "Count stack — sliders move planes · drag to orbit · pinch zoom"
            : "Count stack — grab a frame edge to move that plane · Play scrubs the active axis",
    );
  } else if (tapeMode && stoppedStable) {
    ui.setHint(
      coarse
        ? `Inspect — ash · period ≤ ${MAX_OSC_PERIOD} for ${DEFAULTS.stableHold} gens · sliders move planes · Play is live`
        : `Inspect — ash · period ≤ ${MAX_OSC_PERIOD} for ${DEFAULTS.stableHold} gens · grab a frame edge · Play is live`,
    );
  } else if (tapeMode) {
    ui.setHint(
      coarse
        ? "Inspect — sliders move planes · drag to orbit · pinch zoom · Play returns to live"
        : "Inspect — hover a frame edge to grab it · clips crop the AABB · Play returns to live",
    );
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
    ui.setHint(
      coarse
        ? "Inspect — sliders move planes · drag to orbit · pinch zoom · Play returns to live"
        : "Inspect — hover a frame edge to grab it · clips crop the AABB · Play returns to live",
    );
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
  if (!store || !world) return;
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
  if (!world) return;
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
  const shade = inspectShade();
  if (!shade) {
    const s = slabs[activeAxis];
    return `${span.tLo}:${span.tHi}:${activeAxis}:live:${s.near}:${s.focus}:${s.far}:${box ? `${box.xLo}:${box.xHi}:${box.yLo}:${box.yHi}` : "nobox"}`;
  }
  return inspectRebuildKey({
    shade,
    aabb: box,
    foci: cropFoci(),
    activeAxis,
  });
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
  if (w < 2 || h < 2) return;
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
    if (canGrabFrames() && pointerGrabsFrames(e.pointerType)) {
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
  const hit =
    canGrabFrames() && pointerGrabsFrames(e.pointerType) ? hitWorkPlane(e) : null;
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
    pageActiveFocus(dir);
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
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", resize);
}

function frame(now, xrFrame) {
  try {
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
      if (!arLocked) {
        if (reticle.visible) {
          reticle.matrix.decompose(arAnchorPos, arAnchorQuat, _xrScale);
          arAnchored = true;
          arPlaced = true;
          applyArStagePose();
        } else {
          captureViewerAnchor();
        }
        if (
          shouldFallbackArPlace({
            locked: arLocked,
            hasHitTest: arUseHitTest,
            waitedMs: performance.now() - arHitStartedAt,
          })
        ) {
          lockArPlacement();
        }
      } else if (arPlaced) {
        applyArStagePose();
      }
      updateXrHud();
      updateXrControllerPose(dt);
    } else {
      if (xrHud.visible) {
        xrHud.visible = false;
        setXrRaysVisible(false);
      }
      controls.update();
      if (!planeLock) pinOrbitPivot();
    }
    syncHeadlamp();
  } catch (err) {
    console.warn("DONNER frame update", err);
  }

  try {
    paths.measure("rend", () => {
      if (arPresenting()) {
        renderer.autoClear = true;
        renderer.setScissorTest(false);
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
  } catch (err) {
    console.warn("DONNER render", err);
  }

  try {
    paths.measure("hud", () => {
      const foc = tFocus();
      const store = viewStore();
      const fps = clock.displayFps || 1000 / clock.emaMs;
      const ms = clock.displayMs || clock.emaMs;
      if (hudViewEl) {
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
      }
      ui.setFps(fps);
      if (hudSrcEl && store && world) {
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
      }
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
      if (hudSparkEl) drawSparkline(hudSparkEl, clock);
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
  } catch (err) {
    console.warn("DONNER hud", err);
  }
}

resize();
requestAnimationFrame(resize);
try {
  bootWorld(true);
} catch (err) {
  console.warn("DONNER boot", err);
}
ui.setPlaying(playing);
renderer.xr.addEventListener("sessionstart", onArSessionStart);
renderer.xr.addEventListener("sessionend", onArSessionEnd);
isImmersiveArSupported().then((ok) => ui.setArAvailable(ok));
renderer.setAnimationLoop(frame);
