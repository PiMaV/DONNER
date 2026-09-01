/**
 * Viewer decay: fade across the drawn past only (focus plane → oldest
 * instantiated slice). Live that back edge is Depth; Inspect it is the
 * tape start. Cache length is not a second fade control.
 *
 * Decay is a Z/time fade for sparse stacks. Ghost-hull proximity uses
 * `sliceDistanceFade` along the active plane, not a second Decay.
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
 * Fade of a ghost hull voxel along the active plane. 1 on the cyan
 * playhead, 0 at the AABB face on that axis.
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
