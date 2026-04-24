## Goal

Adopt `@hello-pangea/dnd` (already installed) for both DnD surfaces by switching layouts so they are friendly to a normal flex/list flow:

1. **Chord row (lyrics tab)** — render a flex row of **20 fixed-equal-width slots**. Chord chips live inside slots; dragging snaps a chord into whichever slot it's released over. Word-anchored absolute positioning is removed. 
2. **Pattern block (progressions tab)** — keep the existing beat-proportional sizing, but encode it via `flex-basis` on each chord rather than `width: calc(% - 4px); position: absolute`. The container becomes `display: flex; width: 100%`, items are normal flex children, so `@hello-pangea/dnd` can reorder them.

Chord resize (length editing) stays out of DnD scope — it's its own pointer handler that updates `lengthBeats`/`flex` only.

---

## 1) Chord row → 20 equal slots

### Data model (`src/store/song.ts`)

- Add `slotIndex?: number` (0..19) to `ChordAnchor`. New canonical position field for the chord row.
- Keep `wordIndex` and `chordCol` for one release as legacy fields (used only by migration / "Format Chords"); stop reading them in the renderer.
- Constant `CHORD_ROW_SLOTS = 20`.
- New / changed actions:
  - `placeChordInSlot(sectionId, lineId, chord, slotIndex)` — if slot is taken, push to nearest free slot (search outward, prefer right). Used by the picker.
  - `moveChordToSlot(sectionId, lineId, anchorId, slotIndex)` — used by drop. If destination is occupied, swap with the occupant.
  - `moveChordsAcrossLines(fromLineId, toLineId, anchorIds, dropSlotIndex)` — multi-select cross-row drop; lays selected chords starting at `dropSlotIndex`, pushing collisions right.
  - Replace `moveChordWordSlot` arrow behavior with `slotIndex - 1` / `slotIndex + 1` swap-or-move (free → move, occupied → swap).
- Migration in `loadFromJSON`: for each anchor without `slotIndex`, derive one from `wordIndex` (clamp to 0..19) or from previous left-to-right `order` (index by sort position).
- "Format Chords" (broom) becomes: snap each chord's `slotIndex` to the slot whose center is closest to the corresponding lyric word's measured x position (still uses the mirror-div word-rect measurement code, just outputs slot indices instead of pixel `left`s). When multiple chords contend for the same slot, the closest wins; losers walk right to next free slot.

### Renderer (`src/components/lyrics/LyricsTab.tsx`)

- Delete:
  - `wordRects` state, mirror-div, `ResizeObserver`, `wordIndexNear`, absolute-positioned `bound`/`floating` rendering, `cellPx` math, drop-indicator pixel column, custom pointer-drag (`pdrag`), drag ghost, `onPointerDown`/`onPointerMove`/`onPointerUp` block, the floating chips container.
- Add:
  - `<DragDropContext>` at the lyrics tab root (one context wraps every line's chord row + every other line so cross-row drops work as nested droppables).
  - For each line, render the chord row as `<Droppable droppableId={`row:${lineId}`} direction="horizontal" type="chord">` containing 20 `<div className="flex-1 min-w-0 h-9 ...">` slot cells. Chips inside slots are `<Draggable>` items keyed by anchorId.
  - Because @hello-pangea/dnd Droppables are **lists**, not grids, model each row's children as 20 placeholder items + chips inserted at their slot. Use a single Droppable per row whose children array is length 20 (slot wrappers) — chips are absolutely-positioned inside their slot wrapper so the library still sees the slot list as stable while chips are draggable.
  - Drag end: `result.destination.droppableId` → target lineId, `result.destination.index` → target slotIndex (0..19). Dispatch `moveChordToSlot` (same row) or `moveChordsAcrossLines` (different row).
  - Multi-select drag: pangea is single-item; wrap with the standard "selected item count" pattern — on drag start, hide other selected chips and overlay a count badge on the dragged ghost; on drop, dispatch the batch action with all selected ids and the dest slot.
  - Tap (no drag) on an empty slot still opens the picker; chosen chord goes to that slot via `placeChordInSlot`. Tap on a chip still plays + opens picker as today.
- Visuals:
  - Slot grid uses `grid-cols-20` (or `flex` with `flex-1`); empty slots are transparent (no borders by default), with a faint dashed outline only while a drag is in progress, and a strong primary outline on `snapshot.isDraggingOver`.
  - Chord chip occupies its slot with `w-full` so width is uniform.

### Context menu

- ←/→ now call `moveChordToSlot(anchorId, slotIndex ± 1)` (with swap on collision, clamp at 0 and 19). The "move past last word" requirement from the prior round is naturally satisfied — chord just keeps walking right through slots.

---

## 2) Pattern block → flex-basis + pangea reorder

### Layout switch (`src/components/progressions/ProgressionsTab.tsx`, `PatternBlock`)

- Container becomes `display: flex; width: 100%; height: 5rem` (no `overflow-hidden` change). Bar separators stay absolute (they're aligned to `bars`, not to chord positions, so they don't conflict with flex children).
- Each chord renders as a flex child with:
  ```tsx
  style={{ flexGrow: c.lengthBeats, flexShrink: c.lengthBeats, flexBasis: 0, minWidth: 32 }}
  ```
  No more `width: calc(% - 4px)`. Margins (`mx-0.5 my-1`) stay for the chord chip's visual gutter.
- The trailing "tap to add" button stays as a flex child, only when `usedBeats < totalBeats`. Its `flex` value mirrors the remaining beats (`totalBeats - usedBeats`) so visually it fills the residual bar room exactly like before.
- Resize handles (length editor) stay as today — they update `lengthBeats` via `setPatternChordLength`, which directly drives the new `flex-grow`. No DnD coupling.

### DnD wiring

- Wrap the progressions tab in `<DragDropContext>`. Each `PatternBlock` exposes a `<Droppable droppableId={`pattern:${pattern.id}`} direction="horizontal" type="pattern-chord">`.
- Each chord becomes `<Draggable draggableId={c.id} index={idx}>`.
- Drop result:
  - Same pattern: `reorderPatternChord(pattern.id, chordId, destination.index)` (already exists). After reorder, `repackChords` re-flows `startBeat`s — no further math needed.
  - Different pattern: `movePatternChordToPatternAt(fromPatternId, toPatternId, chordId, destination.index)` (already exists).
- Multi-select drop: same "selected count badge" pattern as above; dispatch `movePatternChordsTo` and then `reorderPatternChord` per id in destination order, OR add a thin new action `reorderPatternChordsBatch(patternId, chordIds, toIndex)` that splices the array in one shot (preferred — single history entry).
- Remove all native HTML5 `draggable`/`onDragStart`/`onDragOver`/`onDrop` handlers and the `dropIndicator` state (pangea draws its own placeholder).
- Remove `pdrag` pointer-drag block in `PatternBlock` (cross-block is now pangea).

### Trailing tap-to-add slot

- This is not a Draggable; it lives outside the Droppable's children list (rendered after `{provided.placeholder}`). Otherwise pangea would treat it as a draggable index.

---

## 3) Cross-cutting

- Add `pangea` `<DragDropContext>` once per tab (lyrics, progressions). Don't try to share a context across tabs.
- Selection model: introduce a small `useDndSelection<T extends string>()` hook (in `src/hooks/`) that holds `Set<id>` and exposes `toggle/clear/has`. Both tabs reuse it. On drag start, if the dragged id is in the selection, the drag operates on the whole set; otherwise it clears the selection and operates on just the dragged id.
- Multi-drag visuals: render a small badge (`+N`) on the dragging clone via `renderClone` on the Draggable.
- Keyboard / accessibility: pangea provides default keyboard DnD — keep it on, no extra work.
- Tests: update `src/test/example.test.ts` if it touches chord-row column math; add a focused unit test for `placeChordInSlot` / `moveChordToSlot` collision behavior.

---

## Files touched

- `src/store/song.ts` — add `slotIndex` + new actions, migration, deprecate `wordIndex`/`chordCol` reads.
- `src/components/lyrics/LyricsTab.tsx` — large rewrite of chord row: slot grid + DragDropContext/Droppable/Draggable, remove mirror-div/`pdrag`/wordRects/cellPx.
- `src/components/progressions/ProgressionsTab.tsx` — switch chord layout to `flex-basis`, remove HTML5 DnD + `pdrag`, wrap with pangea.
- `src/pages/Index.tsx` — Format Chords button: behavior unchanged from the user's POV (still snaps), under-the-hood writes `slotIndex`.
- `src/hooks/use-dnd-selection.ts` (new) — small selection hook.
- `src/test/*` — minor test updates.

## Open questions / decisions made

- **Why 20 slots?** — directly per the user's spec. Width per slot at 1013px viewport ≈ 50px, comfortably fits a chord chip. Mobile keeps the same 20 (chips shrink with `min-w-0` and use `truncate`).
- **What happens to a chord whose `slotIndex` collides on load?** — collisions during migration are resolved left-to-right by walking right to the next free slot.
- **Floating chords (>20 chords on a line)** — disallow: the picker / drop refuses placement when all 20 are full and shows a toast "Row is full". This is a behavior change from "floating chips at the end" (acceptable because flat slot grids don't support overflow gracefully).
- **Resize in pattern blocks** — out of DnD scope; existing edge-drag handlers continue to work because they only mutate `lengthBeats`, which now drives `flex-grow` directly.
- **Bar separators** — keep absolute-positioned overlays inside the (now flex) container; they don't interfere with flex children layout because they're `pointer-events-none`.  

  ## Enable multi-select and multi-drag behaviour for chord items
  &nbsp;