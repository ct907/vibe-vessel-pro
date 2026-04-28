# Phase 1.5 — Fix C + Fix E (+ B, D, Orientation, Safety Net)

Approved spec consolidated. Below is the implementation plan with file-level changes.

---

## Fix C — FocusedChordEditor: full 80-slot grid + correct cursor

**File:** `src/components/lyrics/FocusedChordEditor.tsx`

1. **Preview row → full 80-slot scrollable grid**
   - Replace the current `slotMap` render (which uses `CHORD_ROW_SLOTS` but is laid out flex-without-min-width) with a horizontally-scrollable container:
     - Outer: `overflow-x-auto`
     - Inner: `flex` with `min-width: ${CHORD_ROW_SLOTS * 28}px`
     - Render every slot 0..79; occupied slots show the chord, empty slots remain visible dividers.
   - Highlight the active `slot` cell as today.
   - Auto-scroll the active slot into view after each placement (`scrollIntoView({ inline: "nearest", block: "nearest" })` on the slot ref).

2. **Cursor advancement from actual placed slot**
   - In `handlePick`, after `placeChordInSlot(...)`, read the freshest section from `useSongStore.getState()`, project line chords via `getLineChordsViaSSOT`, and find the just-placed chord by `id` (track `newId` if needed — otherwise pick the chord whose `slotIndex` is the largest ≤ requested target after the call).
   - Compute `chordWidth = display.length <= 3 ? 1 : 2` and `nextSlot = min(CHORD_ROW_SLOTS - 1, placedSlot + chordWidth + 1)`.
   - `setSlot(nextSlot)`.
   - For the `upsertChordAt` (edit) branch keep existing behavior but also use `placedSlot + width + 1`.

3. **Capacity toast**
   - When `nextSlot >= CHORD_ROW_SLOTS - 1` (i.e., 79), `toast.info("Row capacity reached (80 slots)")` once. No pre-warnings.

4. **Debug logs (Fix D)** gated by `localStorage.LV_DEBUG_LAYOUT === "1"`:
   ```
   [editor] placed { requested, placedSlot, nextSlot, chordCount }
   ```

---

## Fix E — Auto-layout splits lines on chord overflow

**File:** `src/lib/music/chordLayout.ts`

1. **Add overflow-driven line splitting** (in addition to existing char-driven splits):
   - After computing `newLines` from char-based splitting, group `remappedChords` by `lineId` (in SSOT order).
   - For each line, sum `chordWidth(display) + 1` (spacing) across its chords. If total > `slotsPerLine`, create N-1 empty continuation lines (where N = `ceil(total / slotsPerLine)`) inserted immediately after that line.
     - Continuation line shape: `{ id: nanoid(), text: "", chords: [], _isChordOverflow: true }`.
   - Walk that line's chords left-to-right and assign each to the current continuation row, rolling to the next row when the cumulative width would exceed `slotsPerLine`. Slot positions are then computed by the existing `autoLayoutChordsPerLine` pass (cursor resets per line).

2. **Type extension**
   - Add optional `_isChordOverflow?: boolean` to `LyricLine` in `src/store/song.ts`. Marker only — not persisted decisions affecting SSOT semantics; treated as transient/UI flag (kept in state, ignored by save if needed — confirm at build time, but simplest is to allow it to persist so reflow stays stable across reloads).

3. **Return metadata** so callers can show the post-reflow banner:
   - Change `formatChordsAndLyrics` to return `{ section, overflowRowsAdded: number }` (or attach via a transient property).
   - Update `autoLayoutSection` in `src/store/song.ts` to return `{ changed, reason?, overflowRowsAdded? }`.

4. **Debug logs (Fix D)**:
   ```
   [layout] section { slotsPerLine, charsPerLine, linesBefore, linesAfter, overflowRowsAdded }
   [layout] line-overflow { lineId, totalSlotsNeeded, slotsPerLine, rowsCreated }
   ```

---

## Fix B — Pause watchdog while editor is open + fire once on close

**File:** `src/components/lyrics/LyricsTab.tsx`

- Add a ref `editorOpenRef` set true while `<FocusedChordEditor />` is mounted (the `picker`/mobile editor branch already tracks open state — wire from there).
- In the watchdog effect (lines ~1153-1175): if `editorOpenRef.current === true`, **skip scheduling** the 350 ms timer; record growth into `prevCountsRef` so we don't false-trigger after close, but mark `pendingReflowSections` (a ref-based Set).
- On editor close (handler that currently calls `onClose`), schedule a single 350 ms `autoLayoutSection` call for each section in `pendingReflowSections`, then clear the set.
- Capture `overflowRowsAdded` from the return value and feed Fix E's banner state.

---

## Fix E (cont.) — Post-reflow banner

**File:** `src/components/lyrics/LyricsTab.tsx`

- New state `reflowNotice: { sectionId: string; newRowCount: number } | null`.
- When `autoLayoutSection` returns `overflowRowsAdded > 0` from either the manual "Format chords & lyrics" button OR the watchdog, set `reflowNotice`.
- Render an inline `Alert` (shadcn `alert.tsx`, `variant="default"`, custom `AlertCircle` icon) directly under the affected section card.
- Message:
  > **Layout adjusted:** Too many chords for one line. Extra chords moved to {N} new row(s). Remember to check and rearrange afterwards.
- Dismiss button + `setTimeout` auto-dismiss at 10 s.

**Continuation row visual** (`LineRow` rendering in `LyricsTab.tsx`):
- When `line._isChordOverflow && !line.text`, render a small subscript `↳ Chord overflow` label next to the chord row and apply `bg-muted/30` to the row container.

---

## Orientation-change modal (NOT auto-layout)

**File:** `src/components/lyrics/LyricsTab.tsx` (or a small new hook)

- `useEffect` subscribes to `window.matchMedia('(orientation: portrait)').addEventListener('change', ...)`.
- On change: do **not** call `autoLayoutSection`. Open a shadcn `Dialog`:
  - Title: "Switched to {Landscape | Portrait} mode"
  - Body: "To keep your lyrics and chord layout looking great, use **Export Lyrics** for a tidy {orientation} layout."
  - Buttons: "Continue Editing" (close) and "Export Lyrics" (close + open existing `ExportLyricsSheet`).
- Suppress the modal on first mount (only react to actual changes).
- Confirm window-resize listeners are NOT calling `autoLayoutSection` anywhere — current code already only calls it from the manual button + watchdog, so nothing to remove. Verify during build.

---

## Safety net — residual overflow

**File:** `src/components/lyrics/LyricsTab.tsx`

- After `autoLayoutSection`, recompute per line whether `totalSlotsNeeded > slotsPerLine`. If true (should be impossible, but guards against future regressions), surface a warning `Alert` (`variant="destructive"`-ish, dismissible):
  > Some chords may be off-screen. Press **Format Chords** to reorganize.

Gated behind a small helper so we don't double-render with the info banner.

---

## Fix D — Debug logging summary (gated by `LV_DEBUG_LAYOUT`)

- `src/lib/music/chordLayout.ts`: input/output, per-line overflow events, orphan reassignments (existing).
- `src/store/song.ts`:
  - `placeChordInSlot`: `{ target, occupied, sandwiched, needsReflow, finalSlot, fallback }`.
  - `autoLayoutSection`: existing no-op log + `overflowRowsAdded`.
- `src/components/lyrics/LyricsTab.tsx`: watchdog growth/grown[]/timer scheduled/fired/cancelled, editor open/close gating.
- `src/components/lyrics/FocusedChordEditor.tsx`: per-pick log (above).

---

## Files touched

- `src/lib/music/chordLayout.ts` — overflow line splitting, return metadata, logs.
- `src/store/song.ts` — `LyricLine._isChordOverflow`, `autoLayoutSection` return shape, `placeChordInSlot` logs.
- `src/components/lyrics/FocusedChordEditor.tsx` — 80-slot scrollable grid, cursor from store, auto-scroll, capacity toast, logs.
- `src/components/lyrics/LyricsTab.tsx` — editor-open gating, post-reflow banner, continuation-row styling, orientation modal, safety-net banner, watchdog logs.

---

## Test protocol

1. `localStorage.setItem('LV_DEBUG_LAYOUT', '1')`.
2. Mobile viewport (~384 px). Open FocusedChordEditor on a verse. Add 10 chords sequentially.
3. Expected during entry: chords appear in order across the 80-slot scrollable grid; preview auto-scrolls to follow cursor; no toasts; no reflow.
4. Close editor → exactly one `autoLayoutSection` per affected section (logged); section now shows lyric line + 2 continuation rows with "↳ Chord overflow" label; info banner appears under section.
5. Rotate device → modal opens offering Export Lyrics; no auto-layout fires.
6. Press "Format chords & lyrics" with already-good layout → toast "Layout already optimal"; no banner.

Awaiting approval to implement.
