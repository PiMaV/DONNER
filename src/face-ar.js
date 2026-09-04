/**
 * Phone / webcam Face AR session helpers. Pose math stays in face-pose.js
 * so Node tests do not load MediaPipe.
 */

import { isHeadsetBrowser } from "./xr.js";

export const FACE_LANDMARKER_VERSION = "0.10.21";
export const FACE_VISION_MODULE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${FACE_LANDMARKER_VERSION}/vision_bundle.mjs`;
export const FACE_WASM_ROOT =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${FACE_LANDMARKER_VERSION}/wasm`;
export const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function isFaceArSupported({
  mediaDevices = globalThis.navigator?.mediaDevices,
  userAgent = "",
} = {}) {
  if (isHeadsetBrowser(userAgent)) return false;
  return Boolean(mediaDevices && typeof mediaDevices.getUserMedia === "function");
}

export function parseFaceQuery(search) {
  const raw = String(search || "");
  const q = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const v = String(q.get("face") || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Phone / coarse pointer uses the back camera; desktop webcam stays user-facing. */
export function preferEnvironmentCamera({
  coarse = false,
  userAgent = "",
} = {}) {
  if (coarse) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(userAgent || ""));
}

export function faceCameraConstraints({ environment = false } = {}) {
  const facing = environment ? "environment" : "user";
  return {
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };
}

export async function startFaceCamera(
  video,
  { environment = false, getUserMedia } = {},
) {
  const grab =
    getUserMedia ||
    globalThis.navigator?.mediaDevices?.getUserMedia?.bind(globalThis.navigator.mediaDevices);
  if (typeof grab !== "function") {
    throw new Error("Camera is not available");
  }
  const stream = await grab(faceCameraConstraints({ environment }));
  if (video) {
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    try {
      await video.play();
    } catch {
      /* autoplay may wait for a tap */
    }
    if (video.readyState < 2 && typeof video.addEventListener === "function") {
      await new Promise((resolve) => {
        const done = () => resolve();
        video.addEventListener("loadeddata", done, { once: true });
        setTimeout(done, 1500);
      });
    }
  }
  return stream;
}

export function stopFaceCamera(stream, video) {
  if (stream && typeof stream.getTracks === "function") {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* already ended */
      }
    }
  }
  if (video) {
    video.srcObject = null;
    if (typeof video.removeAttribute === "function") video.removeAttribute("src");
  }
}

async function defaultImportVision() {
  return import(FACE_VISION_MODULE_URL);
}

export async function loadFaceLandmarker({
  importVision = defaultImportVision,
  wasmRoot = FACE_WASM_ROOT,
  modelUrl = FACE_MODEL_URL,
  delegate = "GPU",
} = {}) {
  const mod = await importVision();
  const vision = mod.default && mod.FaceLandmarker ? mod : mod.default || mod;
  const { FaceLandmarker, FilesetResolver } = vision;
  if (!FaceLandmarker || !FilesetResolver) {
    throw new Error("MediaPipe FaceLandmarker is missing");
  }
  const fileset = await FilesetResolver.forVisionTasks(wasmRoot);
  const opts = {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  };
  try {
    return await FaceLandmarker.createFromOptions(fileset, opts);
  } catch (err) {
    if (delegate === "CPU") throw err;
    opts.baseOptions.delegate = "CPU";
    return FaceLandmarker.createFromOptions(fileset, opts);
  }
}

export function detectFaceForVideo(landmarker, video, timestampMs) {
  if (!landmarker || typeof landmarker.detectForVideo !== "function") return null;
  if (!video || video.readyState < 2) return null;
  const t = Number(timestampMs);
  const now = Number.isFinite(t) ? Math.max(0, Math.floor(t)) : Math.floor(performance.now());
  try {
    return landmarker.detectForVideo(video, now);
  } catch {
    return null;
  }
}

function asConnections(list) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  for (const c of list) {
    const start = Number(c?.start);
    const end = Number(c?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) continue;
    out.push({ start: start | 0, end: end | 0 });
  }
  return out;
}

function ctorConnections(landmarker, key) {
  const Ctor = landmarker && landmarker.constructor;
  return asConnections(Ctor && Ctor[key]);
}

function pairsToConnections(pairs) {
  return asConnections(pairs.map(([start, end]) => ({ start, end })));
}

/**
 * Canonical MediaPipe Face Oval / iris rings (478-point mesh). Used when
 * the WASM constructor is not loaded (Node tests) or a field is missing.
 */
export const FACE_OVAL_CONNECTIONS = pairsToConnections([
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
]);
export const FACE_LEFT_IRIS_CONNECTIONS = pairsToConnections([
  [474, 475], [475, 476], [476, 477], [477, 474],
]);
export const FACE_RIGHT_IRIS_CONNECTIONS = pairsToConnections([
  [469, 470], [470, 471], [471, 472], [472, 469],
]);
export const FACE_LIPS_CONNECTIONS = pairsToConnections([
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314], [314, 405],
  [405, 321], [321, 375], [375, 291], [61, 185], [185, 40], [40, 39],
  [39, 37], [37, 0], [0, 267], [267, 269], [269, 270], [270, 409], [409, 291],
  [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317], [317, 402],
  [402, 318], [318, 324], [324, 308], [78, 191], [191, 80], [80, 81],
  [81, 82], [82, 13], [13, 312], [312, 311], [311, 310], [310, 415],
  [415, 308],
]);
/** Refined iris centers in the 478-point Face Mesh. */
export const FACE_IRIS_CENTER_INDEXES = Object.freeze([468, 473]);

/** Connector list from the FaceLandmarker class, or empty when WASM is not loaded. */
export function faceMeshConnections(landmarker) {
  return ctorConnections(landmarker, "FACE_LANDMARKS_TESSELATION");
}

export function faceOvalConnections(landmarker) {
  const fromCtor = ctorConnections(landmarker, "FACE_LANDMARKS_FACE_OVAL");
  return fromCtor.length ? fromCtor : FACE_OVAL_CONNECTIONS;
}

export function faceIrisConnections(landmarker) {
  const left = ctorConnections(landmarker, "FACE_LANDMARKS_LEFT_IRIS");
  const right = ctorConnections(landmarker, "FACE_LANDMARKS_RIGHT_IRIS");
  if (left.length || right.length) return left.concat(right);
  return FACE_LEFT_IRIS_CONNECTIONS.concat(FACE_RIGHT_IRIS_CONNECTIONS);
}

export function faceLipsConnections(landmarker) {
  const fromCtor = ctorConnections(landmarker, "FACE_LANDMARKS_LIPS");
  return fromCtor.length ? fromCtor : FACE_LIPS_CONNECTIONS;
}

export function closeFaceLandmarker(landmarker) {
  if (landmarker && typeof landmarker.close === "function") {
    try {
      landmarker.close();
    } catch {
      /* wasm teardown */
    }
  }
}
