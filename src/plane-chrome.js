/**
 * Playhead vs clip chrome. Independent of shade (Hull / Ghost / Cuts).
 *
 * Center: current / now playhead frames and the slice grid on that plane.
 * Outer: clip / bound frames of the crop box (Inspect only).
 * A viewcube cut still shows the current plane even when center is hidden.
 */

export function centerChromeVisible(hideCenter, { cut = false } = {}) {
  return Boolean(cut) || !hideCenter;
}

export function outerChromeVisible(
  hideOuter,
  { cut = false, inspect = false, liveLocked = false } = {},
) {
  if (cut || !inspect || liveLocked) return false;
  return !hideOuter;
}

export function anyFrameChromeVisible(hideCenter, hideOuter, opts = {}) {
  return (
    centerChromeVisible(hideCenter, opts) || outerChromeVisible(hideOuter, opts)
  );
}
