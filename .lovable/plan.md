# Replace fragile chord-row drag with explicit "drag mode" + simpler basket drag

## Diagnosis of the current bugs

**Lyrics chord row — "ghost jumps 40px up-left, doesn't follow finger, drop fails":**
The chord-row chips are rendered as `<ChordChip>` buttons that have their own `onTouchStart`/`onMouseDown` handlers for chord audition + sustain-on-hold. Those handlers fire **before** pangea's sensor can claim the gesture, so:

- pangea never gets a clean drag-start → its native clone is never created at the pointer
- Our custom portalled clone (`pointerPosRef`) reads stale coords → ~40px offset
- Because pangea didn't actually own the gesture, drop-target detection never runs → drop fails

The same root cause is why every patch to `pointerPosRef` only half-fixes it. ChordChip is fundamentally fighting pangea for the touch.

**BasketBar — "tap and hold to drag":**
This is **not** a real long-press requirement — pangea starts a drag as soon as the pointer moves ~5px. What the user is feeling is the small movement threshold. We can disable that threshold for basket chips so a press-and-pull goes immediately into a drag, and a stationary tap toggles selection.

---

## Plan

### A. Lyrics chord row — gate drag behind the pencil icon

Adopt the user's suggestion. This eliminates the ChordChip-vs-pangea gesture conflict entirely and gives a clear mental model.

File: `src/components/lyrics/LyricsTab.tsx`

1. Each chord in the row keeps the existing pencil edit icon. Tapping the pencil now **toggles "drag mode" for that single chord** (instead of immediately opening the editor). A long-press on the pencil (or a second tap) opens the editor as before — keep editor access via the chip's existing tap behavior.
  Actually simpler: pencil **opens a tiny floating action menu** with two buttons: `Edit` and `Drag`. Tapping `Drag` arms drag mode for that chip.
2. While a chip is in drag mode:
  - Render it with a visible "armed" state (ring + grip icon).
  - Only THIS chip is wrapped in pangea's `<Draggable>` with `dragHandleProps` on the chip itself; all other chips are plain non-draggable spans.
  - The chip's own audition/sustain handlers are disabled (pass `audition={false}` and skip the long-press handler).
  - Use pangea's native `renderClone` on the row droppable — no custom portal, no `pointerPosRef`. The clone follows the finger natively.
  - Tapping anywhere outside, or completing a drop, exits drag mode.
3. Remove the entire `pointerPosRef` machinery, the `pointermove`/`touchmove` listeners, the custom portalled clone div, and `__lvDndPointerCleanup`. They become dead code.
4. Drop targets (slot hit-testing via `data-chip-anchor`) keep working — pangea's own droppable detection handles it once the gesture is cleanly owned.

### B. BasketBar — single tap (press-and-drag) to drag

File: `src/components/basket/BasketBar.tsx`

1. Update helper copy to: `"Drag to move · tap to multi-select"`.
2. Keep the current `onClick` → `toggle selection` (pangea suppresses synthetic clicks after a real drag, so a stationary tap still toggles).
3. The **only** reason a drag feels like "hold" today is that the chip's `StaticChordChip` has `pointer-events: none` on its inner span — fine — but the wrapping `<div>` doesn't set `touchAction: "none"` aggressively enough on iOS Safari when the basket is at the bottom of the viewport (browser scroll wins). Confirm and fix:
  - Wrapper already has `touchAction: "none"`. Add `overscroll-behavior: contain` on the basket container so the OS doesn't claim the gesture for scroll.
  - Also stop wrapping the chip in an extra `<div>` with `cursor: grab`; put `dragHandleProps` directly on the outer draggable div.
4. No more "tap to select first" requirement — single chip drag works without selection (already true; just needs the copy change + the touch-action hardening above to feel instant).

### C. Pattern block chords (progressions) — same model as A

File: `src/components/progressions/ProgressionsTab.tsx`

Mirror lyrics: chords in a pattern block are not draggable by default. The pattern block's existing edit affordance gains a `Reorder` toggle that arms drag mode for that block's chords. While armed, chord chips become pangea draggables with native `renderClone`; the block-level tap/edit handlers are suppressed.

This also fixes the "section/pattern block steals focus" bug because the block's handlers are explicitly disabled while in chord-drag mode.

### D. Arrow-key reorder in FocusedChordEditor (kept as a supplement)

Add `← Move left` / `Move right →` buttons above the chord input in `FocusedChordEditor`, operating on the currently-edited chord (`anchorId` in lyrics mode, `chordId` in progression mode). Useful for desktop and accessibility; not a replacement for drag.

---

## What gets removed

- `pointerPosRef` + module-scoped pointer listeners in LyricsTab
- The custom portalled ghost div
- `__lvDndPointerCleanup` global
- "Tap to select · drag to move" gating copy in BasketBar

## What gets added

- Per-chip "drag mode" state in LyricsTab (`armedDragId: string | null`) and in pattern blocks
- A small action popover on the pencil icon: `Edit` / `Drag`
- Pangea `renderClone` on the chord-row and pattern-block droppables
- Arrow-reorder buttons in FocusedChordEditor

## Risk

Low. Removing the custom ghost simplifies the code substantially. The "drag mode" toggle is a contained UI state; if a user finds the extra tap annoying we can later re-enable direct drag on long-press — but only after the gesture conflict with ChordChip's own touch handlers is resolved (which this plan does by disabling those handlers in drag mode).