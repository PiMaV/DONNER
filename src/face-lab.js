/**
 * Standalone Face AR lab: live camera + MediaPipe mesh. No Three.js, no MRI.
 */

import {
  closeFaceLandmarker,
  detectFaceForVideo,
  faceMeshConnections,
  isFaceArSupported,
  loadFaceLandmarker,
  preferEnvironmentCamera,
  startFaceCamera,
  stopFaceCamera,
} from "./face-ar.js";
import { clearOverlay, drawFaceLandmarks, fitOverlayCanvas } from "./face-draw.js";

const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const logEl = document.getElementById("log");
const startBtn = document.getElementById("btn-start");
const stopBtn = document.getElementById("btn-stop");
const facingBtn = document.getElementById("btn-facing");

const ctx = overlay.getContext("2d");
let stream = null;
let landmarker = null;
let connections = [];
let running = false;
let lastTs = 0;
let environment = preferEnvironmentCamera({
  coarse: window.matchMedia("(pointer: coarse)").matches,
  userAgent: navigator.userAgent || "",
});
let mirrored = !environment;

function log(msg) {
  if (logEl) logEl.textContent = msg;
}

function syncFacingLabel() {
  if (facingBtn) facingBtn.textContent = environment ? "Back camera" : "Front camera";
}

function paint(result) {
  if (!fitOverlayCanvas(overlay, video)) return;
  clearOverlay(ctx);
  const face = result?.faceLandmarks?.[0];
  if (!face) return;
  drawFaceLandmarks(ctx, face, connections, { mirrored: false });
}

function tick(now) {
  if (!running) return;
  const ts = Math.max(lastTs + 1, Math.floor(now));
  lastTs = ts;
  const result = detectFaceForVideo(landmarker, video, ts);
  const n = result?.faceLandmarks?.[0]?.length || 0;
  if (n) log(`${n} landmarks · ${environment ? "back" : "front"} camera`);
  else if (landmarker) log("Camera live — no face yet");
  paint(result);
  requestAnimationFrame(tick);
}

async function start() {
  if (running) return;
  if (!isFaceArSupported({ userAgent: navigator.userAgent || "" })) {
    log("No camera API in this browser.");
    return;
  }
  startBtn.disabled = true;
  log("Asking for camera…");
  try {
    stream = await startFaceCamera(video, { environment });
    mirrored = !environment;
    video.classList.toggle("is-mirror", mirrored);
    overlay.classList.toggle("is-mirror", mirrored);
    running = true;
    log("Camera live — loading Face Landmarker (WASM)…");
    requestAnimationFrame(tick);
    landmarker = await loadFaceLandmarker();
    connections = faceMeshConnections(landmarker);
    log("Tracker ready — look at the camera");
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    log(`Failed: ${msg}`);
    if (stream) {
      log(`Camera stays on. Tracker failed: ${msg}`);
    } else {
      running = false;
      startBtn.disabled = false;
    }
  }
  stopBtn.disabled = !running;
}

function stop() {
  running = false;
  closeFaceLandmarker(landmarker);
  landmarker = null;
  connections = [];
  stopFaceCamera(stream, video);
  stream = null;
  clearOverlay(ctx);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  log("Stopped.");
}

startBtn?.addEventListener("click", () => void start());
stopBtn?.addEventListener("click", stop);
facingBtn?.addEventListener("click", () => {
  environment = !environment;
  syncFacingLabel();
  if (running) {
    stop();
    void start();
  }
});
syncFacingLabel();
stopBtn.disabled = true;
log(
  isFaceArSupported({ userAgent: navigator.userAgent || "" })
    ? "Tap Start. Camera first, then the face mesh."
    : "No camera API.",
);
