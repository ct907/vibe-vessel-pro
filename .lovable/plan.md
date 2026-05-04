# Fix plan organized by build phases

Three independent regressions, sequenced into 4 phases. Each phase has a single concern, ends in a testable state, and gates the next phase. Full diagnostic detail for each issue lives in the per-phase sections.

---

## Phase 0 — Diagnostic instrumentation (Issue 3 only)

**Goal:** Confirm the root cause of the BasketBar double-gesture bug before changing behavior. Pure logging, no behavior change.

**Scope**
- `src/components/basket/BasketBar.tsx`: add `console.log` in the Draggable render fn and inside `onPointerDown` / `onPointerUp`.
- `src/pages/Index.tsx`: add `console.log` in `DragDropContext` `onDragStart` / `onDragEnd`.

**Probes (run on touch emulation)**
- **A** — long-press unselected chip, then drag. Watch for `[dnd] start`.
- **B** — same on already-selected chip.
- **C** — temporarily strip `onPointerDown` / `onPointerUp` / `onPointerCancel` from the chip wrapper and retest a fresh chip.

**Decision matrix**
- C succeeds → confirms cause #5 (custom pointer handlers competing with pangea sensor) → Phase 2 = Option A.
- C still fails, B fails → cause #1 (selection store re-render race) → Phase 2 = per-chip selection subscription split.
- C still fails, B succeeds → cause #4 (touch scroll) → Phase 2 = container `touch-action` audit.

**Exit criteria:** root cause classified; logging removed before moving on.

---

## Phase 1 — Drag preview stability (Issue 1)

**Goal:** Dragged chord chip tracks the finger from frame 1, no jump to top-left. CSS-only; no store changes.

**Root causes (ranked)**
1. `transition-all` on the chord `<button>` interpolates pangea's per-frame inline `transform`.
2. `width: calc(${widthPct}% - 4px)` collapses when pangea sets `position: fixed` (parent leaves layout flow → percentage resolves against viewport).
3. Possible `backdrop-blur` on `<TransportHeader>` (sibling, unlikely but verify if 1+2 don't fully resolve).

**Files**
- `src/components/progressions/ProgressionsTab.tsx` lines 428–467 — chord button draggable.
- `src/components/lyrics/LyricsTab.tsx` lines 438–505 — wrapper div draggable.
- `src/components/chord/ChordChip.tsx` line 158 — `transition-all`.

**Changes**
- `ProgressionsTab.tsx`: `transition-all` → `transition-colors`; conditionally drop the `calc(% - 4px)` width while `dragSnapshot.isDragging`.
- `ChordChip.tsx`: `transition-all` → `transition-colors`.
- Optional hardening: `<Draggable renderClone>` portal to `document.body` for both Progressions and Lyrics Draggables.

**Exit criteria**
- Long-press + drag any progression chord → chip stays under finger frame 1.
- Long chord names ("Cmaj7#11") render readably mid-drag.
- Same for lyrics row chords and basket chips.

**Why first:** lowest blast radius (CSS), unblocks meaningful manual QA of Phases 2 and 3 (both gesture-heavy).

---

## Phase 2 — BasketBar single-gesture drag (Issue 3)

**Goal:** Every chip drags on the first gesture, on touch and mouse.

**Pre-requisite:** Phase 0 results.

**Branch A — if cause #5 confirmed (most likely)**
- `src/components/basket/BasketBar.tsx` lines 122–159: replace `onPointerDown` / `onPointerUp` / `onPointerCancel` with a single `onClick={() => { if (!snap.isDragging) toggleSelected(b.id); }}`. Pangea cancels synthetic clicks on real drags, so taps still toggle, drags don't.
- Drop the `tapInfo` ref and helpers if no longer used.

**Branch B — if cause #1 confirmed**
- Split `BasketBar` into `BasketBar` + `BasketChip`. Move `useBasketSelectionStore((s) => s.selected.has(id))` into the per-chip component so toggling one chip doesn't re-render every Draggable.

**Branch C — if cause #4 confirmed**
- Audit chip container for missing `touch-action: none` / accidental `overflow-x-auto`.

**Exit criteria** (every case, single uninterrupted gesture)
1. Fresh chip → drag onto lyric slot.
2. Selected chip → drag onto progression pattern.
3. Multi-selected (3) → drag one → all three drop, "+2" badge shown.
4. Press a chip outside the current selection → only that chip drops.
5. Tap with no movement → toggles selection.
6. Drag-cancel → selection state matches pre-drag.

**Why second:** localized to one component, no store changes, and confidence that drags work cleanly is needed to validate Phase 3.

---

## Phase 3 — Cross-tab reorder sync (Issue 2)

**Goal:** Reordering chords in any tab updates SSOT order and is reflected in every other tab.

**Root causes (both confirmed by code inspection)**
1. **Render-level:** `LyricsTab.tsx` line 337 calls `chordsBySlot(lineChords)` which paints chips at stored `slotIndex`, ignoring the SSOT order returned by `getLineChordsViaSSOT`.
2. **Store-level:** `movePatternChord` (`song.ts` line 2746) only mutates `section.chords`; `moveChordToSlot` (`song.ts` line 1911) only mutates `slotIndex`. Neither updates the other projection.

**Step 3a — render-level fix (smallest viable)**
- `LyricsTab.tsx`: replace `chordsBySlot` with a placement that walks `lineChords` in SSOT order and uses `slotIndex` only as a preference (place at preferred slot if free AND ≥ previous + 1, otherwise next free slot).
- This alone resolves Progressions → Lyrics propagation.

**Step 3b — store-level reconciliation (recommended for true SSOT)**
- `src/store/song.ts`: add helper `reconcileLyricsSlotsFromSSOT(section)`.
- Call it from every reorder mutation: `movePatternChord`, `reorderPatternChord`, `movePatternChordToPatternAt`, lyrics drag handlers.
- Update `moveChordToSlot` to also reorder the same chord's position inside `section.chords` so its relative order on that line matches the new visual order.
- Preserve chord `id` and mirror linkage; rely on existing `pushHistory()`.

**Files**
- `src/components/lyrics/LyricsTab.tsx` (line 105 helper, line 337 call site, lines 595–625 arrow handlers).
- `src/store/song.ts` (lines 1911, 2746, plus other reorder mutations).

**Exit criteria**
- Add A, B, C, D → Progressions arrow B right → Lyrics shows A, C, B, D.
- Lyrics drag C left of A → Progressions shows C, A, B, D.
- Multi-line section: reorder on one line leaves other lines' slot positions untouched.
- Existing `slotIndex` gaps are preserved when SSOT order matches; only compacted when SSOT requires.

**Why last:** highest blast radius (store + renderer on both sides). Requires Phases 1 and 2 stable so DnD-driven reorders are also covered.

---

## Phase order rationale

```text
Phase 0 ── diagnose Issue 3 ──┐
                              ▼
Phase 1 ── fix drag preview ──► unblocks touch QA
                              │
Phase 2 ── fix basket drag ───► unblocks drag-based QA of Phase 3
                              │
Phase 3 ── fix SSOT sync ─────► last because biggest blast radius
```

No single root cause links the three issues — they are independent — but Phase 1 is the prerequisite for honestly testing Phases 2 and 3 on touch.

---

## Cross-phase regression watch

- After Phase 1: verify ring/shadow on selected chips still look acceptable without `transition-all`.
- After Phase 2: verify `renderClone` (if used) and selection badge counts still read from the correct source.
- After Phase 3: verify undo/redo (history snapshots) and that mirrored chords across sections still update together.
