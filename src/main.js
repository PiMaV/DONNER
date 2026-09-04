import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { AXIS_COLOR, COLOR, COUNT_DEMOS, DEFAULTS, VERSION, VOXEL_GAP_MAX, clampCubeCap, clampVoxelGap, isCountSourceKind } from "./config.js";
import { normalizeViewQuality, pixelRatioForQuality, viewQualitySpec } from "./quality.js";
import { parseStartSearch, startSearchFromState } from "./door.js";
import {
  PathTimer,
  formatBenchHud,
  formatGpuHud,
  inferBound,
  probeGpu,
} from "./bench.js";
import { ConwayWorld, gridCyclePeriod, seedPattern } from "./conway.js";
import { MAX_OSC_PERIOD } from "./dynamics.js";
import { COUNT_HIDE_DEBOUNCE_MS, countVolumeFromDense, countVolumeFromNpy, isDenseCount, PLANE_PREFETCH_RADIUS } from "./count.js";
import { peekNpyBlob } from "./npy.js";
import { binCountCubeFromBlob, ingestDialogModel, ingestPlan, normalizeBinReduce, previewIngestFromBlob } from "./volume-prep.js";
import { CONWAY_KIND_HEX, CONWAY_BASE_K, COUNT_LUT_RUNGS, countKindHex, DEFAULT_COUNT_TRIM, normalizeCountCmap } from "./encoding.js";
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
  copyAnyPlanes,
  copyAxisPlane,
  fadePastSpan,
  visibleTimeSpan,
} from "./spacetime.js";
import {
  aabbFromSlabs,
  aabbKeepUpToFocus,
  axisIndexFromBack,
  clampSlab,
  defaultInspectSlabs,
  effectiveShade,
  fociFromSlabs,
  inspectRebuildKey,
  inspectHullOccupancyKey,
  inspectPlaneOccupancyKey,
  focusBackFromVoxel,
  normalizeSliceAxis,
  productViewDir,
  lockedFaceAction,
  lockedFacePageStep,
  slabGenerations,
  sliceMaxBack,
  sliceOnlyFromPlaneLock,
  stepFocusBackClipped,
  voxelPitch,
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
  gapLimitOrbitRange,
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
  anyFrameChromeVisible,
  centerChromeVisible,
  outerChromeVisible,
} from "./plane-chrome.js";
import {
  XR_BOARD_METERS,
  XR_MAG_DEFAULT,
  arReticleAllowed,
  arStandLift,
  arVolumeVisible,
  clampArMag,
  firstFloorHitMatrix,
  isImmersiveArSupported,
  isHeadsetBrowser,
  normalizeStandAxis,
  overlayRootForAr,
  preferredReferenceSpaceType,
  requestImmersiveAr,
  requestViewerHitTestSource,
  AR_OVERLAY_SELECT_GUARD_MS,
  arSelectIsOverlayEcho,
  canConfirmArPlace,
  spaceDragAnchor,
  spaceDragOffset,
  standQuatFromAxis,
  viewerFrontPosition,
  volumeLocalAabb,
  volumeLocalAabbFromCrop,
  withXrWebGLLayerOnly,
  xrFootprintCells,
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
const conwayLiveEl = document.getElementById("conway-live");
const hudSparkEl = document.getElementById("hud-spark");
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
  pixelRatioForQuality(DEFAULTS.viewQuality, {
    devicePixelRatio: window.devicePixelRatio || 1,
    coarse,
    headset: headsetBrowser,
  }),
);
renderer.xr.enabled = true;
renderer.autoClear = true;

const scene = new THREE.Scene();
const fog = new THREE.Fog(COLOR.bg, 48, 160);
scene.fog = fog;
const stage = new THREE.Group();
stage.name = "stage";
scene.add(stage);
/** Yaw around the floor normal (stage +Y). Parent of stand so spin stays table-flat. */
const turntable = new THREE.Group();
turntable.name = "turntable";
stage.add(turntable);
const stand = new THREE.Group();
stand.name = "stand";
turntable.add(stand);
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
function syncGizmoChrome() {
  const on = showGizmo();
  if (gizmoHit) gizmoHit.hidden = !on;
  if (gizmoSlot) gizmoSlot.hidden = !on;
  if (gizmoCol) gizmoCol.hidden = !on;
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
let soaPlane = new EventSoA(DEFAULTS.maxInstances);
let cubes = new CubeRenderer(stand, {
  maxCount: DEFAULTS.maxInstances,
  cellSize: DEFAULTS.cellSize,
});
const playfields = {
  x: new FocusFrame(stand, AXIS_COLOR.x, "focus"),
  y: new FocusFrame(stand, AXIS_COLOR.y, "focus"),
  z: new FocusFrame(stand, AXIS_COLOR.z, "focus"),
};
const clipFrames = {
  x: {
    near: new FocusFrame(stand, AXIS_COLOR.x, "near"),
    far: new FocusFrame(stand, AXIS_COLOR.x, "far"),
  },
  y: {
    near: new FocusFrame(stand, AXIS_COLOR.y, "near"),
    far: new FocusFrame(stand, AXIS_COLOR.y, "far"),
  },
  z: {
    near: new FocusFrame(stand, AXIS_COLOR.z, "near"),
    far: new FocusFrame(stand, AXIS_COLOR.z, "far"),
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
let pendingIngest = null;
let ingestPreviewGen = 0;
const wolke = new WolkeViewer({ io });
const COUNT_HINT =
  "EVT count cube (T × H × W). Integer events per pixel per Δt.";
let focusSurfaces = { x: null, y: null, z: null };
let nowGrid;
let playing = false;
let looping = false;
let editing = false;
let parallax = DEFAULTS.parallax;
let alignZ = DEFAULTS.alignZ;
let activeAxis = DEFAULTS.sliceAxis;
let loopAxis = DEFAULTS.loopAxis;
let loadSeq = 0;
let shadeMode = DEFAULTS.shadeMode;
let shadeHeld = false;
let planeLock = false;
let planeLockSign = 1;
let hideCenter = false;
let hideOuter = false;
let slabs = {
  x: { near: 0, focus: 0, far: 0 },
  y: { near: 0, focus: 0, far: 0 },
  z: { near: 0, focus: 0, far: 0 },
};
let gensPerSec = DEFAULTS.gensPerSec;
let loopPerSec = DEFAULTS.loopPerSec;
let decay = DEFAULTS.decay;
let historyLen = DEFAULTS.history;
let voxelGap = DEFAULTS.voxelGap;
let viewQuality = DEFAULTS.viewQuality;
let stabMode = DEFAULTS.stabSize ? "time" : "none";
let stabStart = DEFAULTS.stabStart;
let stabTail = DEFAULTS.stabTail;
let dynamicsOn = DEFAULTS.dynamics;
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
let lastHullOccKey = "";
let lastPlaneOccKey = "";
let lastLookKey = "";
let stableStreak = 0;
let stoppedStable = false;
/** Newest-first copies of recent grids (`[0]` = t-1) for ash cycle detection. */
const gridHistory = [];
let arHitTestSource = null;
let arPlaced = false;
let arUseHitTest = false;
let arHitTestResolved = false;
let arAnchored = false;
let arLocked = false;
let arSearching = false;
let arPhoneOverlay = false;
let arIgnoreSelectUntil = 0;
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
paths.setEnabled(false);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let gpuInfo = null;

const ui = bindUI({
  togglePlay,
  toggleLoop,
  toggleEdit,
  toggleParallax,
  fitVolume,
  resetPlanes: resetPlanesToVolume,
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
  loopAxis: (axis) => setLoopAxis(axis),
  shade: (mode) => setShadeMode(mode),
  viewQuality: (id) => applyViewQuality(id),
  slab: (next) => {
    enterInspect();
    applySlab(next.axis, next, next.dragged || "focus");
  },
  slabHold: (held) => setShadeHeld(held),
  cubeCap: () => applyCubeCap(),
  bench: () => {
    const on = Boolean(ui.getConfig().bench);
    paths.setEnabled(on);
    if (!on) ui.setBenchHud("");
  },
  step: () => {
    if (sourceId === "count") {
      stopLoop();
      stepCountPlayhead();
      updateHint();
      return;
    }
    if (tapeMode) return;
    enterInspect();
    stepOnce();
    updateHint();
  },
  reset: () => {
    if (sourceId === "count") resetCountView();
    else void withLoading("Loading…", () => bootWorld(false));
  },
  rebuild: () => void withLoading("Loading…", () => bootWorld(true)),
  speed: () => {
    gensPerSec = ui.getConfig().gensPerSec;
  },
  loopSpeed: () => {
    loopPerSec = ui.getConfig().loopPerSec;
  },
  decay: () => {
    decay = ui.getConfig().decay;
    dirtyView = true;
  },
  history: () => applyRingCapacity(),
  voxelGap: () => applyVoxelGap(),
  countCmap: () => applyCountCmap(),
  countTrim: () => applyCountTrim(),
  countWindow: () => applyCountWindow(),
  countHide: (immediate) => applyCountHide(immediate),
  planeChrome: () => {
    const cfg = ui.getConfig();
    hideCenter = Boolean(cfg.hideCenter);
    hideOuter = Boolean(cfg.hideOuter);
    if (hideCenter && hideOuter) setFrameHover(null);
    syncClipPlanes();
  },
  stabMode: () => {
    const cfg = ui.getConfig();
    stabMode = cfg.stabMode;
    stabStart = cfg.stabStart;
    stabTail = cfg.stabTail;
    dirtyView = true;
  },
  viewFlags: () => {
    const cfg = ui.getConfig();
    const dynChanged = cfg.dynamics !== dynamicsOn;
    dynamicsOn = cfg.dynamics;
    if (dynChanged) dirtySource = true;
    else dirtyView = true;
  },
  sourceKind: () => {
    switchSource(ui.getConfig().sourceKind);
  },
  countFile: (file) => {
    void offerCountFile(file);
  },
  ingestConfirm: (picks) => {
    void confirmCountIngest(picks);
  },
  ingestPreview: (picks) => {
    void refreshIngestPreview(picks);
  },
  ingestCancel: () => {
    pendingIngest = null;
    ingestPreviewGen += 1;
  },
  wolkeConnect: () => {
    if (wolke.listening) disconnectWolke();
    else connectWolke();
  },
  enterAr,
  exitAr,
  arMag: () => {
    setArMag(ui.getArMag());
  },
  arStand: (axis) => setArStandAxis(axis),
  resetArAnchor,
  guardArOverlaySelect,
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

function layoutCell() {
  return voxelPitch(DEFAULTS.cellSize, voxelGap);
}

function layoutTime() {
  return voxelPitch(DEFAULTS.timeScale, voxelGap);
}

function applyVoxelGap() {
  voxelGap = clampVoxelGap(ui.getConfig().voxelGap);
  dirtyView = true;
  rebuildSliceVisuals();
  syncViewRange();
  if (arPresenting()) applyArStagePose();
}

function spatialCoord(back, axis) {
  if (!world) return 0;
  const a = normalizeSliceAxis(axis);
  const max = sliceMaxBack(a, world.width, world.height, 0);
  const idx = axisIndexFromBack(back, max);
  const cs = layoutCell();
  if (a === "x") return (idx - (world.width - 1) * 0.5) * cs;
  return (idx - (world.height - 1) * 0.5) * cs;
}

function sliceWorldCoord(back, axis = activeAxis) {
  const a = normalizeSliceAxis(axis);
  if (a === "z") return zBackWorldY(back, layoutTime());
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
  if (planeDrag && planeDrag.handle !== "focus") return "hull";
  if (arPlanePoke) return "ghost";
  return effectiveShade(shadeMode, shadeHeld);
}

function hullLooping() {
  return Boolean(looping && inspectMode() && inspectShade() === "hull");
}

/** Crop AABB, or the growing potato (origin → playhead) while Hull loops. */
function inspectDrawAabb() {
  if (!inspectMode()) return null;
  const box = cropAabb();
  if (!box) return null;
  if (!hullLooping()) return box;
  const foci = cropFoci();
  return aabbKeepUpToFocus(box, activeAxis, foci[activeAxis]);
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
  ui.setLoopAxis(loopAxis);
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

function syncArVolumeVisible() {
  stage.visible = !arPresenting()
    ? true
    : arVolumeVisible({
        locked: arLocked,
        headset: !arPhoneOverlay,
        anchored: arAnchored,
      });
}

function syncArOverlayChrome() {
  ui.setArActive(arPresenting(), { locked: arLocked, searching: arSearching });
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
  arHitTestResolved = false;
  arPlaced = false;
  arAnchored = false;
  arLocked = false;
  arSearching = false;
  reticle.visible = false;
}

function arLockedChrome() {
  return arPresenting() && arLocked;
}

function arExtentCells() {
  if (!world) return xrFootprintCells();
  const store = viewStore();
  const timeCells = store ? Math.max(1, viewNow() - store.oldestT() + 1) : 1;
  return xrFootprintCells(world.width, world.height, timeCells, arStandAxis);
}

function arVolumeBox() {
  const cs = layoutCell();
  const store = viewStore();
  if (!world || !store) return volumeLocalAabb(1, 1, 0, 0, cs);
  const oldest = store.oldestT();
  const newest = viewNow();
  const yFull = slabYRange(newest, oldest, newest, layoutTime());
  if (inspectMode()) {
    const box = cropAabb();
    if (box) {
      const y = slabYRange(newest, box.tLo, box.tHi, layoutTime());
      return volumeLocalAabbFromCrop(box, world.width, world.height, y.yMin, y.yMax, cs);
    }
  }
  return volumeLocalAabb(world.width, world.height, yFull.yMin, yFull.yMax, cs);
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
  const s = xrStageScale(DEFAULTS.cellSize, arMag, arExtentCells());
  if (!(s > 0)) return;
  stage.quaternion.copy(arAnchorQuat);
  stage.scale.setScalar(s);
  applyStandQuat();
  const sit = arStandLift(arStandAxis, arVolumeBox(), s);
  _xrUp.set(0, 1, 0).applyQuaternion(arAnchorQuat);
  stage.position.copy(arAnchorPos).addScaledVector(_xrUp, sit);
  if (!Number.isFinite(stage.position.x)) {
    stage.position.copy(arAnchorPos);
  }
  syncArVolumeVisible();
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
  applyArStagePose();
}

function lockArPlacement() {
  if (arLocked) return;
  if (!arAnchored) captureViewerAnchor();
  arLocked = true;
  arPlaced = true;
  arSearching = false;
  if (!playing) enterInspect();
  applyArStagePose();
  ui.setArYawEnabled(true);
  setArPlacedDocument(true);
  syncArOverlayChrome();
  syncClipPlanes();
  updateHint();
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
  if (arSelectIsOverlayEcho(performance.now(), arIgnoreSelectUntil)) return;
  if (
    !canConfirmArPlace({
      locked: arLocked,
      searching: arSearching,
      reticleVisible: reticle.visible,
      hasHitTest: arUseHitTest,
      hitTestResolved: arHitTestResolved,
    })
  ) {
    return;
  }
  if (arUseHitTest && reticle.visible) placeStageFromReticle();
  else lockArPlacement();
}

function resetArAnchor() {
  if (!arPresenting()) return;
  endArFrameDrag();
  arLocked = false;
  arPlaced = false;
  arPinch = null;
  arFrameDrag = null;
  guardArOverlaySelect();
  reticle.visible = false;
  arSearching = true;
  if (arPhoneOverlay) {
    arAnchored = false;
    stage.visible = false;
    ui.setArYawEnabled(false);
  } else {
    arAnchored = false;
    ui.setArYawEnabled(!arUseHitTest);
    captureViewerAnchor();
  }
  setArPlacedDocument(false);
  syncArOverlayChrome();
  syncClipPlanes();
  updateHint();
}

function guardArOverlaySelect() {
  arIgnoreSelectUntil = performance.now() + AR_OVERLAY_SELECT_GUARD_MS;
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
  if (
    !arLockedChrome() ||
    !anyFrameChromeVisible(hideCenter, hideOuter, { inspect: true })
  ) {
    return null;
  }
  const best = {};
  for (const a of ["x", "y", "z"]) {
    if (centerChromeVisible(hideCenter)) collectArFramePick(playfields[a], origin, dir, best);
    if (outerChromeVisible(hideOuter, { inspect: true })) {
      collectArFramePick(clipFrames[a].near, origin, dir, best);
      collectArFramePick(clipFrames[a].far, origin, dir, best);
    }
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
  stand.worldToLocal(_hitLocal);
  const voxel = voxelFromLocal(
    _hitLocal.x,
    _hitLocal.y,
    _hitLocal.z,
    world.width,
    world.height,
    layoutCell(),
    viewNow(),
    layoutTime(),
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
  if (arSelectIsOverlayEcho(performance.now(), arIgnoreSelectUntil)) return;
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
  if (
    !arReticleAllowed({
      presenting: arPresenting(),
      searching: arSearching,
      locked: arLocked,
      hasHitTest: Boolean(arUseHitTest && arHitTestSource),
    }) ||
    !xrFrame
  ) {
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
  const matrices = [];
  for (const hit of hits) {
    const pose = hit.getPose(refSpace);
    if (pose?.transform?.matrix) matrices.push(pose.transform.matrix);
  }
  const chosen = arPhoneOverlay ? firstFloorHitMatrix(matrices) : matrices[0];
  if (!chosen) {
    reticle.visible = false;
    return;
  }
  reticle.visible = true;
  reticle.matrix.fromArray(chosen);
}

function setArDocument(on) {
  document.documentElement.classList.toggle("is-ar", Boolean(on));
  document.body.classList.toggle("is-ar", Boolean(on));
  if (!on) setArPlacedDocument(false);
}

function setArPlacedDocument(on) {
  document.documentElement.classList.toggle("is-ar-placed", Boolean(on));
  document.body.classList.toggle("is-ar-placed", Boolean(on));
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
  setArDocument(true);
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
    setArDocument(false);
    console.warn("WebXR session failed", err);
  }
}

function exitAr() {
  const session = renderer.xr.getSession();
  if (session) session.end();
}

async function onArSessionStart() {
  try {
    setArDocument(true);
    document.getElementById("about-dialog")?.close?.();
    document.getElementById("guide-overlay")?.dismiss?.();
    document.getElementById("ingest-dialog")?.close?.();
    gizmo.clearHover();
    setViewCursor("");
    syncGizmoChrome();
    renderer.setClearAlpha(0);
    renderer.setScissorTest(false);
    controls.enabled = false;
    arPlaced = false;
    arAnchored = false;
    arLocked = false;
    arIgnoreSelectUntil = 0;
    arUseHitTest = false;
    arHitTestResolved = false;
    arPhoneOverlay = !isHeadsetBrowser(navigator.userAgent || "");
    arSearching = true;
    if (arHitTestSource && typeof arHitTestSource.cancel === "function") {
      arHitTestSource.cancel();
    }
    arHitTestSource = null;
    reticle.visible = false;
    arHeadsetHud = false;
    arPinch = null;
    arFrameDrag = null;
    arPlanePoke = false;
    arStandAxis = "z";
    stand.quaternion.identity();
    ui.setArYawEnabled(!arPhoneOverlay);
    ui.setArStandAxis?.("z");
    setArPlacedDocument(false);
    syncArVolumeVisible();
    if (!arPhoneOverlay) captureViewerAnchor();
    const session = renderer.xr.getSession();
    requestViewerHitTestSource(session).then((src) => {
      if (!arPresenting()) return;
      arHitTestSource = src;
      arUseHitTest = Boolean(src);
      arHitTestResolved = true;
      ui.setArYawEnabled(arLocked || !arUseHitTest);
      updateHint();
    });
    syncTurntableVisual();
    xrHud.visible = false;
    setXrRaysVisible(false);
    dirtySource = true;
    dirtyView = true;
    syncFog();
    syncClipPlanes();
    syncArOverlayChrome();
    updateHint();
  } catch (err) {
    console.warn("DONNER AR session start", err);
    if (arPresenting() && !arLocked && !arPhoneOverlay) {
      captureViewerAnchor();
      syncArVolumeVisible();
    }
  }
}

function onArSessionEnd() {
  setArDocument(false);
  renderer.setClearAlpha(1);
  controls.enabled = true;
  arIgnoreSelectUntil = 0;
  arHeadsetHud = false;
  arPhoneOverlay = false;
  arSearching = false;
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
  syncClipPlanes();
  syncGizmoChrome();
  updateHint();
  resize();
}

function syncFog() {
  const inspect = inspectMode();
  const ar = arPresenting();
  scene.fog = !parallax || inspect || ar ? null : fog;
  const spec = viewQualitySpec(viewQuality);
  if (spec.unlit) {
    hemi.intensity = 0;
    key.intensity = 0;
    fill.intensity = 0;
    return;
  }
  hemi.intensity = inspect || ar ? 1.08 : 0.72;
  key.intensity = inspect || ar ? 1.05 : 0.9;
  fill.intensity = spec.fillLight ? 0.22 : 0;
}

function applyViewQuality(id) {
  viewQuality = normalizeViewQuality(id ?? ui.getConfig().viewQuality);
  const spec = viewQualitySpec(viewQuality);
  cubes.setUnlit(spec.unlit);
  renderer.toneMapping = spec.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  ui.setQuality(viewQuality);
  syncFog();
  if (arPresenting()) refreshGpu();
  else resize();
  syncStartUrl();
}

function syncStartUrl() {
  const kind = ui.getConfig().sourceKind;
  const source = isCountSourceKind(kind) && kind !== "count" ? kind : "conway";
  const next = startSearchFromState({ source, quality: viewQuality });
  const url = new URL(window.location.href);
  if (url.search === next) return;
  url.search = next;
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function syncViewRange() {
  if (!world) {
    controls.maxDistance = 160;
    camera.far = 400;
    camera.updateProjectionMatrix();
    return;
  }
  const span = volumeSpan();
  const box = cropAabb() || {
    xLo: 0,
    xHi: world.width - 1,
    yLo: 0,
    yHi: world.height - 1,
    tLo: span.tLo,
    tHi: span.tHi,
  };
  const range = gapLimitOrbitRange({
    width: world.width,
    height: world.height,
    aabb: box,
    tNow: viewNow(),
    cellSize: DEFAULTS.cellSize,
    timeScale: DEFAULTS.timeScale,
    gapMax: VOXEL_GAP_MAX,
    fovDeg: camera.fov,
  });
  controls.maxDistance = range.maxDistance;
  controls.minZoom = range.minZoom;
  camera.far = range.far;
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
  return slabYRange(viewNow(), span.tLo, span.tHi, layoutTime());
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
  const cs = layoutCell();
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
  } else {
    const dist = fitOrbitDistance(camera.fov, radius, 1.28);
    const pos = placeOnViewRay(camera.position, controls.target, dist);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.far = Math.max(camera.far, dist + radius * 3, 400);
    camera.updateProjectionMatrix();
  }
  pinOrbitPivot();
  syncViewRange();
  controls.update();
}

function inspectPoseSlabs() {
  if (!world) return defaultInspectSlabs(1, 1, 0, 0);
  return defaultInspectSlabs(world.width, world.height, maxTimeBack(), 0);
}

function resetPlanesToVolume() {
  if (!world) return;
  slabs = inspectPoseSlabs();
  syncStackUi();
  syncClipPlanes();
  syncViewRange();
  if (arPresenting()) applyArStagePose();
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
  if (dragged !== "focus") syncViewRange();
  const shade = inspectShade();
  const hullFocus =
    inspectMode() &&
    shade === "hull" &&
    dragged === "focus" &&
    !decay &&
    !planeLock &&
    !looping;
  dirtyView = !hullFocus;
  if (arPresenting()) applyArStagePose();
}

function enterInspect() {
  if (tapeMode && !playing) return;
  playing = false;
  tapeMode = true;
  stopLoop();
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
  looping = false;
  editing = false;
  stoppedStable = false;
  acc = 0;
  slabs.z = { near: 0, focus: 0, far: 0 };
  setActiveAxis("z");
  clearHover();
  applySlab("z", slabs.z, "focus");
  ui.setPlaying(true);
  ui.setLooping(false);
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
  const cs = layoutCell();
  for (const a of ["x", "y", "z"]) {
    disposeObject3(focusSurfaces[a]);
    focusSurfaces[a] = createFocusSurface(width, height, cs, a, yMin, yMax, AXIS_COLOR[a], "focus");
    stand.add(focusSurfaces[a]);
    playfields[a].setSize(width, height, cs, a, yMin, yMax);
    for (const handle of ["near", "far"]) {
      clipFrames[a][handle].setSize(width, height, cs, a, yMin, yMax);
    }
  }
  disposeObject3(nowGrid);
  nowGrid = createSliceGrid(width, height, cs, activeAxis, yMin, yMax);
  stand.add(nowGrid);
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
  if (sourceId === "count") return "none";
  return stabMode;
}

function encodingBaseK() {
  return sourceId === "count" ? -1 : CONWAY_BASE_K;
}

function currentCountCmap() {
  return normalizeCountCmap(ui.getConfig().countCmap);
}

function currentCountLut() {
  return countKindHex(COUNT_LUT_RUNGS, currentCountCmap());
}

function countScaleSpec(vol = countVol, extra = {}) {
  if (!vol) return extra;
  return {
    dataMin: vol.dataMin,
    dataMax: vol.dataMax,
    winLo: vol.winLo,
    winHi: vol.winHi,
    hideBelow: vol.hideBelow,
    trim: extra.trim != null ? extra.trim : ui.getConfig().countTrim,
    ...extra,
  };
}

function applyCountCmap() {
  if (sourceId !== "count" || !countVol) return;
  cubes.setKindHex(currentCountLut(), -1);
  ui.setCountLegend(countScaleSpec());
  dirtyEncoding = true;
}

function applyCountTrim() {
  if (sourceId !== "count" || !countVol) return;
  const pct = ui.getConfig().countTrim;
  if (pct < 0) return;
  countVol.applyTrim(pct);
  ui.setCountScale(countScaleSpec(countVol, { trim: pct }));
  cubes.setKindHex(currentCountLut(), -1);
  dirtySource = true;
  dirtyEncoding = true;
}

function applyCountWindow() {
  if (sourceId !== "count" || !countVol) return;
  const cfg = ui.getConfig();
  countVol.setWindow(cfg.countWinLo, cfg.countWinHi);
  ui.setCountScale(countScaleSpec(countVol, { trim: -1 }));
  cubes.setKindHex(currentCountLut(), -1);
  dirtySource = true;
  dirtyEncoding = true;
}

let countHideTimer = 0;

function applyCountHide(immediate = false) {
  if (sourceId !== "count" || !countVol) return;
  const run = () => {
    countHideTimer = 0;
    if (sourceId !== "count" || !countVol) return;
    countVol.setHideBelow(ui.getConfig().countHide);
    lastHullOccKey = "";
    lastPlaneOccKey = "";
    lastSpanKey = "";
    dirtySource = true;
    dirtyEncoding = true;
  };
  if (countHideTimer) {
    clearTimeout(countHideTimer);
    countHideTimer = 0;
  }
  if (immediate) run();
  else countHideTimer = setTimeout(run, COUNT_HIDE_DEBOUNCE_MS);
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
  const pose = inspectPoseSlabs();
  if (slabs.x.far < 1 && pose.x.far > 0) slabs.x = pose.x;
  else slabs.x.far = Math.min(slabs.x.far, pose.x.far);
  if (slabs.y.far < 1 && pose.y.far > 0) slabs.y = pose.y;
  else slabs.y.far = Math.min(slabs.y.far, pose.y.far);
}

function applyDenseCountWindow() {
  slabs = inspectPoseSlabs();
  decay = false;
  ui.setDecay(false);
  applySlab(activeAxis, slabs[activeAxis], "focus");
}

function resetCountView() {
  if (countVol && isDenseCount(countVol)) {
    applyDenseCountWindow();
    return;
  }
  applySlab("z", { ...slabs.z, focus: 0 }, "focus");
}

function stepCountPlayhead() {
  const a = normalizeSliceAxis(loopAxis);
  const s = slabs[a];
  const next = stepFocusBackClipped(s.focus, s.near, s.far, -1);
  if (next === s.focus) return;
  applySlab(a, { ...s, focus: next }, "focus");
  markGps();
}

function bootCount(vol) {
  sourceId = "count";
  countVol = vol;
  gensPerSec = ui.getConfig().gensPerSec;
  loopPerSec = ui.getConfig().loopPerSec;
  decay = ui.getConfig().decay;
  historyLen = ui.getConfig().history;
  playing = false;
  looping = false;
  editing = false;
  tapeMode = true;
  stoppedStable = false;
  world = countWorld(vol);
  ring = null;
  tape = vol;
  layoutPlayfield(vol.width, vol.height);
  vol.setHideBelow(0);
  vol.applyTrim(DEFAULTS.countTrim ?? DEFAULT_COUNT_TRIM);
  cubes.setKindHex(currentCountLut(), -1);
  ui.setSourceKind(countKindForVolume(vol));
  syncStartUrl();
  ui.setCountScale(countScaleSpec(vol, { trim: DEFAULTS.countTrim ?? DEFAULT_COUNT_TRIM, hideBelow: 0 }));
  ui.setCountMeta(
    `${vol.name} · ${vol.nT} × ${vol.height} × ${vol.width} · max ${vol.dataMax} · ${vol.count} voxels`,
  );
  acc = 0;
  if (isDenseCount(vol)) {
    applyDenseCountWindow();
  } else {
    decay = ui.getConfig().decay;
    slabs = inspectPoseSlabs();
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
  ui.setLooping(false);
  ui.setEditing(false);
  ui.setParallax(parallax);
  syncStackUi();
  syncOrbitPan();
  lastSpanKey = "";
  lastHullOccKey = "";
  lastPlaneOccKey = "";
  lastLookKey = "";
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

function yieldPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function withLoading(label, fn) {
  loadSeq += 1;
  const mine = loadSeq;
  ui.setLoading(true, label || "Loading…");
  await yieldPaint();
  try {
    await fn();
  } finally {
    if (mine === loadSeq) ui.setLoading(false);
  }
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
    ui.setCountHint(`Could not load ${name} (${msg}).`);
    if (!countVol) {
      ui.setSourceKind("conway");
      sourceId = "conway";
    }
    updateHint();
  }
}

function switchSource(kind) {
  const next =
    kind === "conway" || COUNT_DEMOS[kind] ? kind : "conway";
  ui.setSourceKind(next);
  syncStartUrl();
  void withLoading("Loading…", async () => {
    if (next === "conway") {
      disconnectWolke();
      bootWorld(true);
      return;
    }
    const demo = COUNT_DEMOS[next];
    if (demo) {
      await loadCountFromUrl(demo.url, demo.name, next);
      return;
    }
    if (countVol) {
      ui.setSourceKind("count");
      bootCount(countVol);
      return;
    }
    ui.setSourceKind("count");
    ui.setCountHint("Pick Load NumPy, drop a .npy on the volume, or choose Lighter Ignition or Brain MRI Low / High.");
    updateHint();
  });
}

async function offerCountFile(file) {
  if (!file) return;
  try {
    const header = await peekNpyBlob(file);
    const plan = ingestPlan(header);
    const name = String(file.name || "count").replace(/\.npy$/i, "");
    pendingIngest = { file, header, plan, name };
    ui.openIngest(ingestDialogModel(file.name, header, plan));
  } catch (err) {
    pendingIngest = null;
    const msg = err && err.message ? err.message : String(err);
    ui.openIngest({
      name: file.name || "file",
      shapeLine: "",
      dtype: "",
      payload: "",
      cells: "",
      axesNote: "",
      warn: msg,
      canLoad: false,
      suggested: null,
      options: [],
    });
  }
}

async function refreshIngestPreview(picks) {
  const pending = pendingIngest;
  if (!pending || !pending.plan?.canLoad) {
    ui.setIngestPreview(null);
    return;
  }
  const gen = ++ingestPreviewGen;
  const factor = Number(picks && picks.factor) | 0 || 1;
  const reduce = normalizeBinReduce(picks && picks.reduce);
  try {
    const shot = await previewIngestFromBlob(pending.file, pending.header, factor, reduce);
    if (gen !== ingestPreviewGen || pendingIngest !== pending) return;
    ui.setIngestPreview(shot);
  } catch {
    if (gen !== ingestPreviewGen) return;
    ui.setIngestPreview(null);
  }
}

async function confirmCountIngest(picks) {
  const pending = pendingIngest;
  if (!pending) {
    ui.closeIngest();
    return;
  }
  const f = Number(picks && picks.factor) | 0;
  const reduce = normalizeBinReduce(picks && picks.reduce);
  const opt = pending.plan.options.find((o) => o.factor === f);
  if (!opt || !opt.ok) return;
  pendingIngest = null;
  ingestPreviewGen += 1;
  ui.closeIngest();
  const { file, header, name } = pending;
  try {
    await withLoading(`Loading ${file.name}…`, async () => {
      if (f === 1) {
        const buf = await file.arrayBuffer();
        bootCount(countVolumeFromNpy(buf, name));
      } else {
        const { data, shape } = await binCountCubeFromBlob(
          file,
          header,
          f,
          reduce,
          (done, total) => {
            ui.setLoading(true, `Binning ${done} / ${total}…`);
          },
        );
        bootCount(countVolumeFromDense(data, shape, name));
      }
      ui.setCountHint(COUNT_HINT);
    });
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
  loopPerSec = cfg.loopPerSec;
  decay = cfg.decay;
  historyLen = cfg.history;
  stabMode = cfg.stabMode;
  stabStart = cfg.stabStart;
  stabTail = cfg.stabTail;
  dynamicsOn = cfg.dynamics;
  playing = false;
  tapeMode = true;
  looping = false;

  world = new ConwayWorld({
    width: cfg.width,
    height: cfg.height,
    wrap: cfg.wrap,
  });
  const rng = mulberry32(cfg.seed >>> 0);
  world.load(seedPattern(cfg.pattern, world.height, world.width, rng, cfg.density));

  ring = new GenerationRing(historyLen, cfg.width * cfg.height);
  tape = new GenerationRing(64, cfg.width * cfg.height, {
    appendOnly: true,
    maxCapacity: DEFAULTS.maxTapeSlices,
    maxEvents: DEFAULTS.maxTapeEvents,
  });
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
  const warm = Math.max(0, DEFAULTS.conwayWarmGens | 0);
  for (let i = 0; i < warm; i++) stepOnce();
  slabs = inspectPoseSlabs();
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
  ui.setLooping(false);
  ui.setEditing(editing);
  ui.setParallax(parallax);
  syncStackUi();
  syncOrbitPan();
  lastSpanKey = "";
  lastHullOccKey = "";
  lastPlaneOccKey = "";
  lastLookKey = "";
  dirtySource = true;
  dirtyView = true;
  dirtyEncoding = true;
  paths.reset();
  clock.reset();
  fillAndUpload();
  syncCacheUi();
  updateHint();
}

function stopLoop() {
  if (!looping) {
    ui.setLooping(false);
    return;
  }
  looping = false;
  ui.setLooping(false);
  syncClipPlanes();
  applyGridLook();
  dirtyView = true;
}

function toggleLoop() {
  if (sourceId !== "count" && playing) {
    editing = false;
    ui.setEditing(false);
    enterInspect();
    applySlab("z", { ...slabs.z, focus: 0 }, "focus");
  }
  if (looping) {
    stopLoop();
  } else {
    if (sourceId !== "count" && !tapeMode) enterInspect();
    looping = true;
    acc = 0;
    ui.setLooping(true);
    setActiveAxis(loopAxis);
    const a = normalizeSliceAxis(loopAxis);
    const dense = countVol && isDenseCount(countVol);
    if (!dense && slabs[a].focus === slabs[a].near) {
      applySlab(a, { ...slabs[a], focus: slabs[a].far }, "focus");
    }
  }
  updateHint();
}

function togglePlay() {
  if (sourceId === "count") {
    toggleLoop();
    return;
  }
  stopLoop();
  if (playing) {
    editing = false;
    ui.setEditing(false);
    enterInspect();
    applySlab("z", { ...slabs.z, focus: 0 }, "focus");
  } else {
    enterLive();
    ui.collapsePhoneSourceFold?.();
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
  const cs = layoutCell();
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
  if (loopAxis !== a) {
    loopAxis = a;
    ui.setLoopAxis(a);
  }
  if (editing && a !== "z") {
    editing = false;
    ui.setEditing(false);
  }
  ui.setActiveAxis(a);
  if (changed) rebuildSliceVisuals();
  else syncClipPlanes();
  dirtyView = true;
}

function setLoopAxis(next) {
  setActiveAxis(next);
}

function applyCubeCap() {
  const cap = clampCubeCap(ui.getConfig().maxInstances);
  if (soa.capacity === cap) return;
  soa = new EventSoA(cap);
  soaPlane = new EventSoA(cap);
  cubes.dispose();
  cubes = new CubeRenderer(stand, {
    maxCount: cap,
    cellSize: DEFAULTS.cellSize,
    kindHex: sourceId === "count" && countVol ? currentCountLut() : CONWAY_KIND_HEX,
    warmupK: encodingBaseK(),
    unlit: viewQualitySpec(viewQuality).unlit,
  });
  dirtySource = true;
}

function applyGridLook() {
  const inspect = inspectMode();
  const arChrome = arLockedChrome();
  const chrome = (!planeLock && !arPresenting()) || arChrome;
  const cut = planeLock && !arPresenting();
  const grow = hullLooping();
  if (nowGrid) {
    nowGrid.visible =
      (chrome && centerChromeVisible(hideCenter, { cut })) || cut;
    setLineOpacity(nowGrid, inspect || cut ? 0.42 : 0.18);
  }
  for (const a of ["x", "y", "z"]) {
    const surf = focusSurfaces[a];
    const showFrame = cut
      ? a === activeAxis
      : grow
        ? a === activeAxis
        : chrome && centerChromeVisible(hideCenter) && (inspect || arChrome || a === "z");
    if (surf) {
      const pickEdit = editing && a === "z" && chrome && !arPresenting();
      const pickCut = cut && a === activeAxis;
      surf.visible = pickEdit || pickCut;
      surf.material.opacity = 0;
    }
    playfields[a].setVisible(showFrame);
    if (cut) {
      clipFrames[a].near.setVisible(false);
      clipFrames[a].far.setVisible(false);
    }
    playfields[a].setEmphasis(
      inspect && a === activeAxis
        ? "active"
        : arChrome && a === arStandAxis
          ? "active"
          : !inspect && a === "z"
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
  const showClips =
    chrome &&
    !hullLooping() &&
    outerChromeVisible(hideOuter, {
      inspect: inspectMode(),
      liveLocked: stackLiveLocked(),
    });
  const cs = layoutCell();
  const w = world.width;
  const h = world.height;
  for (const a of ["x", "y", "z"]) {
    const s = slabs[a];
    const axisChrome = arChrome || a === "z" || inspectMode();
    const coord = sliceWorldCoord(s.focus, a);
    playfields[a].setSize(w, h, cs, a, yMin, yMax);
    playfields[a].setOffset(a, coord);
    if (focusSurfaces[a]) {
      orientSlicePlane(focusSurfaces[a], a, w, h, cs, yMin, yMax, coord);
    }
    const nearOn = showClips && axisChrome && s.near !== s.focus;
    const farOn = showClips && axisChrome && s.far !== s.focus;
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
    if (!arLocked) {
      ui.setHint(
        !arHitTestResolved
          ? "AR — looking for the floor…"
          : arUseHitTest
            ? "AR — look at the floor until the gold square appears, then tap to place"
            : "AR — tap to place the volume in front of you",
      );
    } else if (arUseHitTest) {
      ui.setHint(
        arHeadsetHud
          ? "AR — grab a frame to slide the volume · poke a cube to isolate the standing plane · stick yaws · both grips pinch size · Exit AR to place again"
          : "AR — rails crop the brick · Loop walks the plane · Size scales · yaw · Reset Anchor to search again · Exit to orbit",
      );
    } else {
      ui.setHint("AR — rails crop the brick · yaw · Reset Anchor to search again · Exit returns to orbit");
    }
  } else if (planeLock) {
    ui.setHint("Slice — wheel zooms · same-face click pages · right-drag pans · left-drag leaves · Shift+wheel pages · B restores 3D");
  } else if (sourceId === "count") {
    ui.setHint(
      countVol && isDenseCount(countVol)
        ? "Dense cube — sliders move planes · Loop walks the marked axis"
        : looping
          ? "Count stack — Loop walks the axis · Pause Loop to stop"
          : coarse
            ? "Count stack — sliders move planes · drag to orbit · pinch zoom"
            : "Count stack — grab a frame edge to move that plane · Loop walks the marked axis",
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
        ? "Inspect — sliders move planes · Loop walks the tape · Source Play is live"
        : "Inspect — hover a frame edge to grab it · Loop walks the tape · Source Play is live",
    );
  } else if (editing && atNow) {
    ui.setHint("Edit — tap a cell inside the frame · drag to orbit");
  } else if (editing && !atNow) {
    ui.setHint("Focus is in the past — Home or the Z slider, then tap to paint");
  } else if (!parallax) {
    ui.setHint("Ortho — no parallax · gizmo snaps views · B restores perspective");
  } else if (playing && cubes.count > 20000) {
    ui.setHint(
      `INST ${cubes.count} — depth is filling; Pause to see GPU-only (soa now should be 0)`,
    );
  } else if (playing) {
    ui.setHint("Live — Pause to inspect the cache · drag to orbit · scroll zoom");
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
  if (arPresenting()) applyArStagePose();
}

function volumeFillOpts() {
  const span = inspectMode() || arPillar() ? volumeSpan() : null;
  return {
    tFocus: tFocus(),
    stabMode: stabForFill(),
    height: world.height,
    wrap: world.wrap,
    dynamics: dynamicsOn,
    aabb: inspectDrawAabb(),
    foci: cropFoci(),
    shade: inspectShade() || "hull",
    activeAxis,
    ...(span ? { tLo: span.tLo, tHi: span.tHi } : {}),
  };
}

function cubeView() {
  return {
    tFocus: tFocus(),
    tNow: viewNow(),
    decay: arPresenting() ? false : decay,
    fadeSpan: fadeSpan(),
    timeScale: DEFAULTS.timeScale,
    width: world.width,
    height: world.height,
    history: volumeWindow(),
    stabMode: stabForFill(),
    stabStart,
    stabTail,
    cellSize: DEFAULTS.cellSize,
    voxelGap,
    isolate: null,
    activeAxis,
    aabb: inspectDrawAabb(),
    foci: cropFoci(),
    shade: inspectShade(),
    sliceOnly: sliceOnlyFromPlaneLock(planeLock),
    encodingMinimal,
  };
}

function countStore() {
  return Boolean(sourceId === "count" && countVol && viewStore() === countVol);
}

function alongRange(aabb, axis) {
  const a = normalizeSliceAxis(axis);
  if (!aabb) return { lo: 0, hi: 1e9 };
  if (a === "x") return { lo: aabb.xLo | 0, hi: aabb.xHi | 0 };
  if (a === "y") return { lo: aabb.yLo | 0, hi: aabb.yHi | 0 };
  return { lo: aabb.tLo | 0, hi: aabb.tHi | 0 };
}

function fillHullVolume() {
  const store = viewStore();
  if (!store || !world) return;
  const opts = volumeFillOpts();
  if (!inspectShade()) {
    store.fillSoA(soa, viewNow(), volumeWindow(), world.width, opts);
    soaPlane.count = 0;
    soaPlane.truncated = false;
    return;
  }
  if (countStore()) {
    const shade = inspectShade();
    if (planeLock || shade === "slice" || shade === "triple") {
      soa.count = 0;
      soa.truncated = false;
      return;
    }
    countVol.fillHullSoA(soa, viewNow(), volumeWindow(), world.width, opts);
    return;
  }
  store.fillSoA(soa, viewNow(), volumeWindow(), world.width, { ...opts, shade: "hull" });
}

function fillPlaneVolume() {
  const shade = inspectShade();
  if (!world || !shade || shade === "hull") {
    soaPlane.count = 0;
    soaPlane.truncated = false;
    return;
  }
  const opts = volumeFillOpts();
  const aabb = inspectDrawAabb();
  const foci = cropFoci();
  if (countStore()) {
    countVol.fillPlaneSoA(soaPlane, viewNow(), volumeWindow(), world.width, opts);
    if (shade === "triple") {
      for (const a of ["x", "y", "z"]) {
        const { lo, hi } = alongRange(aabb, a);
        countVol.prefetchPlanes(aabb, a, foci[a], false, { radius: 1, lo, hi });
      }
    } else {
      const axis = normalizeSliceAxis(activeAxis);
      const { lo, hi } = alongRange(aabb, axis);
      countVol.prefetchPlanes(aabb, axis, foci[axis], false, {
        radius: PLANE_PREFETCH_RADIUS,
        lo,
        hi,
      });
    }
    return;
  }
  if (shade === "triple") copyAnyPlanes(soa, soaPlane, foci);
  else copyAxisPlane(soa, soaPlane, activeAxis, foci[normalizeSliceAxis(activeAxis)]);
}

function fadeSpan() {
  return fadePastSpan(tFocus(), volumeSpan().tLo);
}

function uploadLive() {
  if (!world) return;
  cubes.setEvents(soa, cubeView(), "both");
  cubes.setGhostSliceFade(null);
}

function uploadInspect({ hull, plane }) {
  if (!world) return;
  const view = cubeView();
  const shade = view.shade;
  if (view.sliceOnly) {
    cubes.setEvents(soaPlane.count ? soaPlane : soa, view, "solid");
    cubes.setGhostSliceFade(null);
    return;
  }
  if (shade === "ghost") {
    if (hull) cubes.setEvents(soa, view, "hull");
    if (plane) cubes.setEvents(soaPlane, view, "plane");
    cubes.setGhostSliceFade(view);
    return;
  }
  if (shade === "hull") {
    if (hull) cubes.setEvents(soa, view, "solid");
    cubes.setGhostSliceFade(null);
    return;
  }
  if (plane || hull) cubes.setEvents(soaPlane, view, "solid");
  cubes.setGhostSliceFade(null);
}

function fillAndUpload() {
  paths.measure("soa", () => {
    fillHullVolume();
    fillPlaneVolume();
  });
  paths.measure("inst", () => {
    if (!inspectShade()) uploadLive();
    else uploadInspect({ hull: true, plane: true });
  });
  lastWork = "soa";
  dirtySource = false;
  dirtyView = false;
  dirtyEncoding = false;
}

function spanKey() {
  const span = volumeSpan();
  const box = inspectDrawAabb();
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

function instanceLookKey() {
  return `${voxelGap}:${encodingMinimal ? 1 : 0}:${stabForFill()}:${stabStart}:${stabTail}:${planeLock ? 1 : 0}:${viewNow()}:${sourceId === "count" && countVol ? `${currentCountCmap()}:${countVol.winLo}:${countVol.winHi}:${countVol.hideBelow}` : "conway"}`;
}

function syncVolume() {
  if (forceFullRebuild) dirtySource = true;
  const shade = inspectShade();
  if (!shade) {
    const sk = spanKey();
    if (sk !== lastSpanKey) {
      lastSpanKey = sk;
      dirtySource = true;
    }
    lastHullOccKey = "";
    lastPlaneOccKey = "";
    lastLookKey = "";
    if (dirtySource || dirtyEncoding) {
      fillAndUpload();
      return;
    }
    paths.record("soa", 0);
    if (dirtyView) {
      paths.measure("inst", uploadLive);
      lastWork = "inst";
      dirtyView = false;
      return;
    }
    paths.record("inst", 0);
    lastWork = "rend";
    return;
  }

  const box = inspectDrawAabb();
  const hullOcc = inspectHullOccupancyKey({
    shade,
    aabb: box,
    sliceOnly: sliceOnlyFromPlaneLock(planeLock),
  });
  const planeOcc = inspectPlaneOccupancyKey({
    shade,
    aabb: box,
    foci: cropFoci(),
    activeAxis,
  });
  const look = instanceLookKey();
  const hullOccChanged = hullOcc !== lastHullOccKey;
  const planeOccChanged = planeOcc !== lastPlaneOccKey;
  const lookChanged = look !== lastLookKey;
  const fillHull = dirtySource || hullOccChanged;
  const fillPlane = dirtySource || planeOccChanged;

  if (fillHull || fillPlane) {
    paths.measure("soa", () => {
      if (fillHull) fillHullVolume();
      if (fillPlane) fillPlaneVolume();
    });
  } else {
    paths.record("soa", 0);
  }

  const uploadHull = fillHull || dirtyEncoding || lookChanged;
  const uploadPlane = shade !== "hull" && (fillPlane || dirtyEncoding || lookChanged);

  if (uploadHull || uploadPlane) {
    paths.measure("inst", () => uploadInspect({ hull: uploadHull, plane: uploadPlane }));
    lastWork = "inst";
  } else {
    paths.record("inst", 0);
    lastWork = "rend";
  }

  lastHullOccKey = hullOcc;
  lastPlaneOccKey = planeOcc;
  lastLookKey = look;
  lastSpanKey = spanKey();
  dirtySource = false;
  dirtyView = false;
  dirtyEncoding = false;
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
  stand.worldToLocal(_hitLocal);
  return cellFromWorldXZ(
    _hitLocal.x,
    _hitLocal.z,
    world.width,
    world.height,
    layoutCell(),
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
  return (
    !arPresenting() &&
    !planeLock &&
    inspectMode() &&
    anyFrameChromeVisible(hideCenter, hideOuter, { inspect: true })
  );
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
    if (centerChromeVisible(hideCenter)) {
      collectFramePick(playfields[a], event, cam, rect, candidates);
    }
    if (outerChromeVisible(hideOuter, { inspect: true })) {
      collectFramePick(clipFrames[a].near, event, cam, rect, candidates);
      collectFramePick(clipFrames[a].far, event, cam, rect, candidates);
    }
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
  const scale = axis === "z" ? layoutTime() : layoutCell();
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
  renderer.setPixelRatio(
    pixelRatioForQuality(viewQuality, {
      devicePixelRatio: window.devicePixelRatio || 1,
      coarse,
      headset: headsetBrowser,
    }),
  );
  let w = canvas.clientWidth;
  let h = canvas.clientHeight;
  if (w < 2 || h < 2) {
    const vv = window.visualViewport;
    w = Math.round(vv?.width || window.innerWidth || 0);
    h = Math.round(vv?.height || window.innerHeight || 0);
  }
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
      stopLoop();
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
    if (playing && sourceId !== "count") {
      acc += dt * gensPerSec;
      let steps = 0;
      paths.measure("sim", () => {
        while (playing && acc >= 1 && steps < DEFAULTS.maxStepCatchUp) {
          acc -= 1;
          stepOnce();
          steps += 1;
        }
      });
      if (acc > 1) acc = 1;
    } else if (looping) {
      acc += dt * loopPerSec;
      let steps = 0;
      paths.measure("sim", () => {
        while (looping && acc >= 1 && steps < DEFAULTS.maxStepCatchUp) {
          acc -= 1;
          stepCountPlayhead();
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
        if (!arPhoneOverlay && !arAnchored) captureViewerAnchor();
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
          truncated: soa.truncated || soaPlane.truncated,
          focus: foc,
          playing,
          looping,
          ortho: !parallax,
          software: Boolean(gpuInfo && gpuInfo.software),
        });
      }
      ui.setFps(fps);
      if (paths.enabled) {
        const rows = paths.snapshot();
        ui.setBenchHud(
          `${formatBenchHud({
            rows,
            work: lastWork,
            forceFull: forceFullRebuild,
            frameMs: ms,
            bound: inferBound(rows, ms, lastWork),
          })}\n${formatGpuHud(gpuInfo)}`,
        );
      }
      if (conwayLiveEl && store && world && sourceId === "conway" && playing) {
        conwayLiveEl.textContent = formatSourceHud({
          generation: tapeMode ? foc : world.generation,
          live: store.liveAt(foc),
          gps: measuredGps || gensPerSec,
          editing,
          tape: tapeMode,
          kind: "conway",
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
    });
  } catch (err) {
    console.warn("DONNER hud", err);
  }
}

const start = parseStartSearch(window.location.search);
ui.setSourceKind(start.source);
applyViewQuality(start.quality);
requestAnimationFrame(resize);
try {
  if (start.source === "conway") bootWorld(true);
  else switchSource(start.source);
} catch (err) {
  console.warn("DONNER boot", err);
}
ui.setPlaying(playing);
ui.setLooping(looping);
renderer.xr.addEventListener("sessionstart", onArSessionStart);
renderer.xr.addEventListener("sessionend", onArSessionEnd);
isImmersiveArSupported().then((ok) => ui.setArAvailable(ok));
renderer.setAnimationLoop(frame);
