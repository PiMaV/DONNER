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

/** Connector list from the FaceLandmarker class, or empty when WASM is not loaded. */
export function faceMeshConnections(landmarker) {
  const Ctor = landmarker && landmarker.constructor;
  const tess = Ctor && Ctor.FACE_LANDMARKS_TESSELATION;
  return Array.isArray(tess) ? tess : [];
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
