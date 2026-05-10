/**
 * Shared module-scope state between the custom touch and mouse sensors.
 *
 * On iOS / Android, after a `touchend` the browser fires a synthetic
 * `mousedown` → `mouseup` → `click` chain (~0–500ms later). Pangea's
 * stock mouse sensor catches the synthetic mousedown, calls
 * `preventDefault()` on it, and that suppresses the trailing click —
 * which is exactly the click we rely on for tap-to-select in the basket.
 *
 * Tracking the last-real-touch timestamp here lets the mouse sensor skip
 * mousedowns that arrive within the synthetic-event window so taps fire
 * onClick normally.
 */
export const touchRecency = {
  lastTouchAt: 0,
  /** Synthetic mouse events fire ~0–500ms after touchend; 800ms is generous. */
  syntheticMouseWindowMs: 800,
};

export function markTouch() {
  touchRecency.lastTouchAt = Date.now();
}

export function isLikelySyntheticMouse(): boolean {
  return Date.now() - touchRecency.lastTouchAt < touchRecency.syntheticMouseWindowMs;
}
