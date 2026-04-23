

## Mobile/keyboard polish, header tightening, and chord drag-to-move

### 1. Keep the active chord row in view when the mobile keyboard opens
`src/components/lyrics/LyricsTab.tsx` — `LineRow`'s `useEffect` that scrolls the active row currently runs once on activation, before the soft keyboard is up. Change it so that on mobile we:
- Wait for `visualViewport` `resize` events (keyboard appearing shrinks `vv.height`).
- After each viewport change while `active === true`, recompute the row's `getBoundingClientRect()` and scroll so the row sits ~80px below `vv.offsetTop`, accounting for the new (shorter) viewport height. Use `window.scrollBy({ top: rect.top - (vv.offsetTop + 80) })`.
- Also fire once on `focus` of the chord row and once after a 200 ms settle to catch late keyboard animations.

### 2. Don't dismiss the mobile keyboard when pressing Space in the chord row
The chord row is a focusable `<div>`, not an input. When the user taps Space, mobile browsers blur the focused soft-keyboard target. Fix:
- Mount a hidden `<input data-chord-row-keyhost>` (1×1, opacity 0, `inputMode="text"`, `autoCapitalize="off"`, `autoCorrect="off"`) inside each `LineRow` and focus IT (instead of the `div`) on mobile when `focusChord()` runs. Keyboard events bubble from this input into the existing `handleChordKeyDown`.
- In `handleChordKeyDown`, on Space we already `preventDefault()` — keeping focus on a real input means the keyboard stays up.
- Desktop behavior unchanged (still focuses the div if `useIsMobile()` is false).

### 3. Remove the "Remove chord" button from the chord picker sheet
`src/components/chord/ChordPickerSheet.tsx` — delete the trailing `{onRemove && …}` block (lines ~236–242) and drop the `onRemove` prop. In `LyricsTab.tsx`, drop the `onRemove={…}` and `handleRemove` plumbing. Backspace/Delete on the chord row already deletes (already implemented in `handleChordKeyDown`).

### 4. BPM input width hugs three digits
`src/components/header/TransportHeader.tsx` — change the BPM `<Input>` from `w-16` to `w-14` and add `text-center px-1`. Three-digit values like `120` fit; remove the spinner overhead by adding `[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`.

### 5. Tighter Transpose group so Sound fits on mobile
`TransportHeader.tsx`:
- Reduce gap on the Transpose cluster from `gap-1` to `gap-0.5`.
- Shrink the −/+ buttons to `h-7 w-7` and the offset readout to `w-6 text-xs`.
- Trim the "Transpose" label to mobile: hide the word on `< sm` (`hidden sm:inline`) and show only an icon (e.g. ⇅) on mobile.
- Reduce the outer row gap from `gap-3` to `gap-2`.
- This frees enough horizontal space for the `Sound` button at 384 px viewport.

### 6. Drag-to-move chords (touch + mouse) for multi-selected chords
Today drag uses HTML5 `draggable`, which works on desktop but not reliably on touch and doesn't move multi-selections. Replace the chip-level drag with a Pointer Events implementation in `LineRow`:
- On chip `pointerdown` while `selectMode` is active and the chip is in `selected`:
  - Capture the pointer (`setPointerCapture`), record start coords.
  - After ~6 px movement, enter "drag" state. Render a floating ghost (a small absolutely-positioned div listing selected chord displays) that follows the pointer.
  - On `pointermove`, `document.elementFromPoint` finds the chord row under the pointer (`[data-chord-row]`); compute target column from `pointer.x − rect.left` ÷ `cellPx`. Highlight the target row and draw a vertical insert marker.
  - On `pointerup`: call a new store action `moveSelectedChordsTo(fromSectionId, fromLineId, toSectionId, toLineId, toCol, ids)` that removes the chords from the source row and inserts them at `toCol` on the target row, preserving relative columns and `mirrorId` links.
- Keep a fallback path: single-chord drag (no `selectMode`) continues to use the existing HTML5 drag for unchanged desktop UX, OR collapse to the same Pointer flow with a 1-element selection — we'll pick Pointer-only to unify behavior on touch.

`src/store/song.ts` — add `moveSelectedChordsTo(...)`:
- Source side: remove the anchors; if same row, account for column shifts.
- Target side: insert each chord at `toCol + (origCol − minOrigCol)` clamped to row length; extend `chordRowLen` if needed; preserve `mirrorId`s so progression patterns stay synced.

### 7. Don't deselect when long-pressing on a chip during select-mode
`LineRow` chip handlers — currently, the long-press handler calls `toggleSelected(a.id)` while in select-mode, which is what causes a held chip to drop out of the selection right before the user starts dragging. Change behavior:
- If `selectMode` is active and the chip is already in `selected`, long-press becomes the "begin drag" gesture (no toggle, no deselect).
- If `selectMode` is active and the chip is NOT selected, long-press still toggles (adds it).
- If `selectMode` is inactive, long-press still enters select-mode and selects the chip (unchanged).
- Also add a guard in the document-level `pointerdown` outside-tap effect so taps that originate from a chip in `selected` while a drag is in progress don't exit select-mode.

### Files touched
- `src/components/lyrics/LyricsTab.tsx` — viewport scroll fix, hidden key-host input, drag-to-move pointer logic, long-press behavior in select-mode, drop the `onRemove` plumbing.
- `src/components/chord/ChordPickerSheet.tsx` — remove the "Remove chord" footer + prop.
- `src/components/header/TransportHeader.tsx` — BPM width, Transpose tightening, responsive label.
- `src/store/song.ts` — `moveSelectedChordsTo` action.

### Notes
- No data-model changes; mirror links are preserved through the move.
- Drag ghost renders via `position: fixed`, so it works across section cards.
- All keyboard shortcuts (⌘A/C/X/V, Backspace, Space) keep working through the hidden input host on mobile and the focusable div on desktop.

