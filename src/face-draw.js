/**
 * 2D overlay of MediaPipe face landmarks. Used by the Face lab page
 * and by DONNER Face AR so tracking is visible without Three.js.
 */

export function fitOverlayCanvas(canvas, video) {
  if (!canvas || !video) return false;
  const w = video.videoWidth | 0;
  const h = video.videoHeight | 0;
  if (!(w > 0 && h > 0)) return false;
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

/**
 * Draw mesh connectors plus landmark dots.
 * `connections` is MediaPipe `{start, end}[]` (tessellation).
 */
export function drawFaceLandmarks(
  ctx,
  landmarks,
  connections = [],
  { mirrored = false, stroke = "rgba(0, 255, 242, 0.35)", fill = "#ffc53d" } = {},
) {
  if (!ctx || !landmarks || !landmarks.length) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, w / 640);
  ctx.beginPath();
  for (const conn of connections) {
    const a = landmarks[conn.start];
    const b = landmarks[conn.end];
    if (!a || !b) continue;
    ctx.moveTo(px(a, w, mirrored), py(a, h));
    ctx.lineTo(px(b, w, mirrored), py(b, h));
  }
  ctx.stroke();
  ctx.fillStyle = fill;
  const r = Math.max(1.2, w / 320);
  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(px(lm, w, mirrored), py(lm, h), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function clearOverlay(ctx) {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
