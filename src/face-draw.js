/**
 * 2D overlay of MediaPipe face landmarks. Used by the Face lab page
 * and by DONNER Face AR so tracking is visible without Three.js.
 */

/** Overlay backing store cap. Native 1280×720 compositing is expensive on a phone. */
export const FACE_OVERLAY_MAX_WIDTH = 640;

export function fitOverlayCanvas(canvas, video, { maxWidth = FACE_OVERLAY_MAX_WIDTH } = {}) {
  if (!canvas || !video) return false;
  const vw = video.videoWidth | 0;
  const vh = video.videoHeight | 0;
  if (!(vw > 0 && vh > 0)) return false;
  const cap = Number(maxWidth);
  const w = Number.isFinite(cap) && cap > 0 ? Math.min(vw, Math.round(cap)) : vw;
  const h = Math.max(1, Math.round(vh * (w / vw)));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return true;
}

function px(lm, width, mirrored) {
  const x = Number(lm?.x);
  return (mirrored ? 1 - x : x) * width;
}

function py(lm, height) {
  return Number(lm?.y) * height;
}

function eachDot(landmarks, dots, fn) {
  if (dots === false) return;
  if (Array.isArray(dots)) {
    for (const i of dots) {
      const lm = landmarks[i];
      if (lm) fn(lm);
    }
    return;
  }
  for (const lm of landmarks) fn(lm);
}

/**
 * Draw mesh connectors plus landmark dots.
 * `connections` is MediaPipe `{start, end}[]` (tessellation or a subset).
 * `dots`: true = all landmarks, false = lines only, number[] = those indexes.
 */
export function drawFaceLandmarks(
  ctx,
  landmarks,
  connections = [],
  {
    mirrored = false,
    stroke = "rgba(0, 255, 242, 0.35)",
    fill = "#ffc53d",
    dots = true,
    dotRadius,
    lineWidth,
  } = {},
) {
  if (!ctx || !landmarks || !landmarks.length) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (connections.length) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Number.isFinite(lineWidth) && lineWidth > 0
      ? lineWidth
      : Math.max(1, w / 640);
    ctx.beginPath();
    for (const conn of connections) {
      const a = landmarks[conn.start];
      const b = landmarks[conn.end];
      if (!a || !b) continue;
      ctx.moveTo(px(a, w, mirrored), py(a, h));
      ctx.lineTo(px(b, w, mirrored), py(b, h));
    }
    ctx.stroke();
  }
  if (dots === false) return;
  ctx.fillStyle = fill;
  const r = Number.isFinite(dotRadius) && dotRadius > 0 ? dotRadius : Math.max(1.2, w / 320);
  eachDot(landmarks, dots, (lm) => {
    ctx.beginPath();
    ctx.arc(px(lm, w, mirrored), py(lm, h), r, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function clearOverlay(ctx) {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Soft green pupils on the lock overlay. */
export const FACE_PUPIL_FILL = "rgba(110, 196, 140, 0.92)";
/** Iris / retina discs behind the pupils. */
export const FACE_IRIS_FILL = "rgba(135, 206, 235, 0.88)";
