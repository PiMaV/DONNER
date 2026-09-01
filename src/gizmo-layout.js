/** CSS placement for the CAD viewcube (left of the HUD column). */

export const GIZMO_CSS = 144;
export const GIZMO_CSS_COARSE = 144;
export const MARGIN_CSS = 12;

/** Full-width phone timeline / overlay — do not shove the cube across the canvas. */
export function isWideOverlay(canvasRect, overlay) {
  const span = Number(overlay?.width) || 0;
  const canvasW = Math.max(1, canvasRect.right - canvasRect.left);
  return span > canvasW * 0.55;
}

/**
 * Product-axis view from a BoxGeometry face normal in gizmo space.
 * Engine Y-up: +X → X, +Y → Z, +Z → Y.
 */
export function viewFromLocalNormal(nx, ny, nz) {
  const ax = Math.abs(Number(nx) || 0);
  const ay = Math.abs(Number(ny) || 0);
  const az = Math.abs(Number(nz) || 0);
  if (ax >= ay && ax >= az) return { axis: "x", sign: nx >= 0 ? 1 : -1 };
  if (az >= ax && az >= ay) return { axis: "y", sign: nz >= 0 ? 1 : -1 };
  return { axis: "z", sign: ny >= 0 ? 1 : -1 };
}

/**
 * Desktop-only: coarse pointers and the phone HUD (≤720 px) omit the cube.
 */
export function gizmoOnScreen({ coarse = false, narrow = false, ar = false } = {}) {
  return !coarse && !narrow && !ar;
}

/**
 * CSS box for the viewcube.
 * Prefer an explicit rail slot (DOM rect). Overlay dodge is only a
 * fallback for tests / missing slot.
 */
export function gizmoCssBox(canvasRect, css, margin = MARGIN_CSS, overlays = [], slot = null) {
  if (slot && slot.width >= 1 && slot.height >= 1) {
    const size = Math.max(1, Math.min(slot.width, slot.height));
    return { left: slot.left, top: slot.top, size };
  }
  let right = canvasRect.right - margin;
  const top = canvasRect.top + margin;
  const mid = (canvasRect.left + canvasRect.right) / 2;
  for (const r of overlays) {
    if (!r || r.width < 1 || r.height < 1) continue;
    if (isWideOverlay(canvasRect, r)) continue;
    const overlapsTop = r.top < top + css && r.bottom > top;
    if (!overlapsTop) continue;
    if (r.right < mid) continue;
    right = Math.min(right, r.left - margin);
  }
  const left = Math.max(canvasRect.left + margin, right - css);
  return { left, top, size: css };
}

/**
 * Scissor / viewport in Three.js logical pixels. Do not multiply by
 * devicePixelRatio — WebGLRenderer.setScissor / setViewport already do.
 */
export function gizmoScissor(box, canvasRect, viewW, viewH) {
  const size = Math.max(1, Number(box?.size) || 1);
  const x = Math.max(0, Math.min(viewW - size, Math.round((box.left || 0) - canvasRect.left)));
  const y = Math.max(0, Math.min(viewH - size, Math.round(canvasRect.bottom - (box.top || 0) - size)));
  return { x, y, size };
}
