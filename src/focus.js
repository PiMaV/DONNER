/** Focus plane vs simulation head. Y = 0 is always tFocus. */

export function clampFocusBack(back, generation, historyLen) {
  const max = Math.min(Math.max(0, generation | 0), Math.max(0, historyLen | 0));
  return Math.max(0, Math.min(back | 0, max));
}

export function focusGeneration(tNow, focusBack) {
  return tNow - focusBack;
}
