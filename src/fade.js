/**
 * Viewer decay: fade across the drawn past only (focus plane → oldest
 * instantiated slice). Live that back edge is Depth; Inspect it is the
 * tape start. Cache length is not a second fade control.
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
