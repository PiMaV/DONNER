/**
 * Viewer decay: fade across the drawn past only (focus plane → oldest
 * instantiated slice). Live that back edge is Depth; Inspect it is the
 * tape start. Cache length is not a second fade control.
 *
 * Decay is a Z/time fade for sparse stacks. Dense count slabs reuse the
 * same one-sided falloff along X or Y (`sliceStackGhost`); do not mix that
 * with `sliceDistanceFade` (sparse X/Y ghost-to-gold).
 */

/**
 * Brightness of a slice `age` generations below the focus plane.
 * `span` is the drawn past including the plane.
 * Decay off → 1. Decay on → 1 at the plane, 0 at the back edge.
 */
export function depthFade(age, span, decayOn) {
  if (!decayOn) return 1;
  const s = Math.max(1, span | 0);
  const a = Math.max(0, age);
  if (s <= 1) return 1;
  return Math.max(0, 1 - a / (s - 1));
}

/**
 * Spatial fade along a sparse X/Y slice. 1 on the cyan playhead, 0 at the
 * gold grips (each side independently). Not used for Z or dense count
 * slabs — those use depthFade along the stack axis.
 */
export function sliceDistanceFade(value, focus, lo, hi) {
  const v = Number(value);
  const f = Number(focus);
  const left = Number(lo);
  const right = Number(hi);
  if (![v, f, left, right].every(Number.isFinite)) return 0;
  const d = v - f;
  if (Math.abs(d) < 0.5) return 1;
  if (d < 0) {
    const span = f - left;
    if (!(span > 0)) return 0;
    return Math.max(0, 1 - -d / span);
  }
  const span = right - f;
  if (!(span > 0)) return 0;
  return Math.max(0, 1 - d / span);
}
