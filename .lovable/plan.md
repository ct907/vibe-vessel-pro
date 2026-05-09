# Bug Fixes — Cross-tab Sync, Playback, Paste, Format, Undo, Move + Drag/Autosave/Validation Hardening + Desktop Drag Restore

## Conflict check

None of the new items conflict with prior usability fixes. Item 7 (desktop drag restore) **partially reverts** the earlier "pencil-gates-drag" change, but only on desktop viewports. Mobile keeps the pencil-gated behavior because that's where the gesture conflict with ChordChip's own touch handlers exists.

---

## Original items 1–6 (recap)

**1. Section delete syncs across tabs** — clear stale `focusedPatternId`/`startFromChordId`, dead local `selected` IDs, and close `chordEditor` if its target is gone, via an effect watching `sections`/`progression` in both tabs.

**2. Play button plays nothing by default** — guard top of `handlePlay`: drop stale cursors; `await ensureAudio()` then `getAudioContext().resume()`; toast if no `onChordStart` fires within 500ms; add `clearStartCursor()` called from delete reducers.

**3. Multi-chord paste must overflow** — rewrite `pasteChordsAt` to place greedily L→R, allocate a fresh `LyricLine { _isChordOverflow: true }` (or new pattern block in progressions) on overflow; never silently drop. Run `autoLayoutSection` after.

**4. Format Chords drops chords from non-first lines** — rewrite `formatChordsInSong` to operate on `section.chords` (SSOT) directly: snap each `SectionChord.lyricsPlacement.slotIndex` to nearest word boundary, return with `[SSOT_MODE]: true`, then run `formatChordsAndLyrics`.

**5. Undo after cut requires two presses** — add `withHistoryGroup(get, fn)` that snapshots once and suppresses nested `pushHistory`. Wrap cut+reflow, paste+reflow, and similar compound actions.

**6. "Move to {section}" silently no-ops cross-section** — pre-check available beats; auto-`addPatternToSection` for overflow OR toast "Target has no room"; add Cut/Paste buttons to progressions row-2 toolbar sharing the new clipboard helper.

---

## New items 7–11

### 7. Desktop: restore click-and-hold direct drag on chord chips
The earlier change made all chord-row drags require tapping pencil → "Drag" mode. That fixed the mobile gesture conflict but **regressed desktop**, where click-and-hold drag was working perfectly.

**Fix — viewport-gated behavior:**
- Use existing `useIsMobile()` (≥768px = desktop).
- **Desktop:** chord chips in lyrics rows and pattern blocks are wrapped in pangea `<Draggable>` directly; `dragHandleProps` on the chip; the chip's own `onMouseDown` audition stays (mouse drag has a movement threshold so a click still auditions, a press-and-pull drags). Pencil icon goes back to opening the editor immediately.
- **Mobile:** keep the new pencil → action menu (`Edit` / `Drag`) and the per-chip "armed drag mode" added previously. ChordChip's touch handlers stay disabled only while armed.
- Use pangea's native `renderClone` in BOTH paths (desktop and armed-mobile) — no custom portal, no `pointerPosRef`. The earlier removal of that machinery stays.
- Apply identically to `LyricsTab.tsx` and `ProgressionsTab.tsx` (pattern blocks).

**Files:** `src/components/lyrics/LyricsTab.tsx`, `src/components/progressions/ProgressionsTab.tsx`. Touch `ChordChip` only if needed to gate audition while armed (already conditional via `audition` prop).

### 8. Drag-clone reads basket selection without subscribing → stale "+N" badge
`BasketBar.renderClone` calls `useBasketSelectionStore.getState().selected` — a one-shot read at clone-mount time.

**Fix:** extract `<DragCloneBadge id={item.id}/>` that subscribes via `useBasketSelectionStore(s => s.selected)`. Only the badge re-renders.
**File:** `src/components/basket/BasketBar.tsx`.

### 9. `resolveDragIds` race on stale Set reference
Both `useBasketSelectionStore.resolveDragIds` and `useDndSelection` capture `selected` once; a `clear()` between snapshot and `.has`/`.size` checks yields stale results.

**Fix:** freeze the drag scope at drag-start. In the global `DragDropContext.onBeforeDragStart`, snapshot `selected` into `useDndStore.draggingIds` once; all consumers (drop handlers, clone badge fallback) read THAT during the drag; clear in `onDragEnd`. Same contract for `useDndSelection`: expose `freezeForDrag(id)` returning a frozen array; mid-drag callers must use it instead of `resolveDragIds`.
**Files:** `src/hooks/use-dnd-selection.ts`, `src/store/basket-selection.ts`, `src/store/dnd.ts`, `src/pages/Index.tsx`.

### 10. Autosave races during rapid multi-chord drags → on-disk divergence
Each per-chord move dispatches a separate update; debounced autosave can persist intermediate state.

**Fix:** add counter-based `beginInteraction()`/`endInteraction()` on the song store; while count > 0 autosave is paused. Wire from `Index.tsx`: `onBeforeDragStart` → begin; `onDragEnd` (after per-tab handler) → end (autosave fires once with final state). Combine with `withHistoryGroup` (#5) so the whole drag is one undo step.
**Files:** `src/store/song.ts`, `src/pages/Index.tsx`.

### 11. Paste validates per-token, not whole input
`parseChordTextToClips` filters invalid tokens individually → silent partial pastes.

**Fix:** validate the whole input first; if any token fails `parseChord`, do not mutate — toast "Couldn't paste — N of M tokens aren't valid chords" listing bad tokens (truncated), with a "Paste valid only" secondary action. Apply at both call sites; extract helper to `src/lib/music/chordClipboard.ts` for reuse with #3 / #6.

### 12. User-typed chords reach DOM without `parseChord` enforcement
`chord.display` is rendered directly. Invariant ("every `ChordSymbol` is parser-validated") is currently informal.

**Fix:** add canonical constructor `makeChordFromInput(raw): ChordSymbol | null` in `src/lib/music/chords.ts` that runs `parseChord`, normalizes `display` to canonical form, rejects on null. Audit all construction sites: `FocusedChordEditor`, `ChordPickerSheet`, the new clipboard helper, and the JSON load path in `song.ts` (re-validate every chord on import; reject the file with a toast on failure). Add a unit test that round-trips every persisted chord through `parseChord` to the same `display`.
**Files:** `src/lib/music/chords.ts`, `src/components/lyrics/FocusedChordEditor.tsx`, `src/components/chord/ChordPickerSheet.tsx`, `src/store/song.ts`, new test in `src/test/`.

---

## Files to edit (consolidated)

- `src/store/song.ts` — paste/format/move overflow & validation, `withHistoryGroup`, `beginInteraction/endInteraction`, load-time chord validation, `removeSection` cleanup hooks.
- `src/store/playback.ts` — `clearStartCursor`.
- `src/store/basket-selection.ts`, `src/store/dnd.ts`, `src/hooks/use-dnd-selection.ts` — frozen drag-snapshot semantics.
- `src/lib/music/chords.ts` — `makeChordFromInput`.
- `src/lib/music/chordLayout.ts` — SSOT-aware snap helper.
- `src/lib/music/chordClipboard.ts` (new) — whole-input validating paste.
- `src/components/header/TransportHeader.tsx` — playback guards + audio resume.
- `src/components/lyrics/LyricsTab.tsx` — desktop direct-drag, mobile armed-drag, cut wrapping, clipboard helper, stale-ID cleanup.
- `src/components/progressions/ProgressionsTab.tsx` — same drag split, Cut/Paste toolbar, move-to toast, stale-ID cleanup.
- `src/components/basket/BasketBar.tsx` — reactive `<DragCloneBadge>`.
- `src/components/lyrics/FocusedChordEditor.tsx`, `src/components/chord/ChordPickerSheet.tsx` — route through `makeChordFromInput`.
- `src/pages/Index.tsx` — global DnD `onBeforeDragStart`/`onDragEnd` for interaction window + frozen drag IDs.
- `src/test/` — chord-invariant test.
