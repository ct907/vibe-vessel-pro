# Diagnosis & fix plan for 3 persistent regressions

Read-only review of the relevant files. Three independent issues; each has its own root cause. Issue 1 first (smallest, unblocks QA of the others), then Issue 3 (localized to BasketBar), then Issue 2 (highest blast radius — touches store + renderer).

---

## Issue 1 — Dragged chord jumps to top-left

### Likely root causes, ranked

1. **Most likely: `transition-all` on the dragged element fights pangea's inline `transform`.**
   In `ProgressionsTab.tsx` lines 444–456 the chord `<button>` IS the draggable AND carries `className="... transition-all hover:opacity-90"`. At drag start, `provided.draggableProps.style` switches the element to `position: fixed` with continuously updated `transform: translate(...)`. With `transition: all`, the browser tries to interpolate every frame's `transform` and `top/left`, which on touch devices commonly snaps to the initial computed origin near `0,0` until the first frame settles — visible as the chip "jumping to the top-left."
   `ChordChip.tsx` line 158 also uses `transition-all`. That only matters when the chip itself is the drag node (true in progressions; not in lyrics, where the wrapper div is the draggable).

2. **Likely (progressions only): the chord's width is a percentage that collapses when pangea makes the element `position: fixed`.**
   In `ProgressionsTab.tsx` the dragged button uses `width: calc(${widthPct}% - 4px)` and our spread order is:
   ```
   style={{ ...colors.style, width: `calc(...% - 4px)`, touchAction: "none", ...dragProvided.draggableProps.style }}
   ```
   The pangea spread is last, so its width should win — but if pangea returns `undefined` for width on early frames, our `calc(% - 4px)` survives. Once the parent is gone from layout flow, the percentage resolves against the viewport (or zero) and the chip computes a tiny/zero width near the top-left corner.

3. **Possible: sticky `<TransportHeader>` uses `backdrop-blur`.**
   `backdrop-filter` creates a new containing block in WebKit/Blink. The header is a sibling above `<main>` (not an ancestor of the draggables), so it shouldn't trap them — but worth ruling out by temporarily removing `backdrop-blur` if causes (1) and (2) don't fully resolve it.

4. **Unlikely: conditional remount during drag.** Lyrics Draggable keeps a stable structure and ref; basket `key={b.id}` is stable. No remount on selection toggle.

5. **Unlikely: portaling required.** No ancestor has `transform`/`filter`/`perspective`. Portaling via `<Draggable renderClone>` to `document.body` would still be a robust hardening step but isn't the root cause.

**Files implicated**
- `src/components/progressions/ProgressionsTab.tsx` lines 428–467 (chord `<button>` draggable: `transition-all` + percentage width + late `dragProvided.draggableProps.style` spread).
- `src/components/lyrics/LyricsTab.tsx` lines 438–505 (wrapper div draggable).
- `src/components/chord/ChordChip.tsx` line 158 (`transition-all`).

**Was the previous fix incomplete?** Yes. Earlier work locked lyrics slot widths to 40px (fixed the lyrics-only "offset" symptom) but never touched the progression chord, where the draggable element itself carries `transition-all` AND a percentage width.

### Proposed fix

**Minimal safe fix**
- `ProgressionsTab.tsx` lines 444–456: swap `transition-all` → `transition-colors` on the chord `<button>`. Strip the percentage width while dragging:
  ```
  style={{
    ...colors.style,
    width: dragSnapshot.isDragging ? undefined : `calc(${widthPct}% - 4px)`,
    touchAction: "none",
    ...dragProvided.draggableProps.style,
  }}
  ```
- `ChordChip.tsx` line 158: `transition-all` → `transition-colors`.

**Optional stronger fix**
- Add `<Draggable>` `renderClone` portal to `document.body` for both ProgressionsTab and LyricsTab Draggables. Future ancestors with `transform`/`backdrop-filter` then can't break drag math.

**Regression risks**
- Removing `transition-all` from the chord button removes any transition on box-shadow / ring changes. Acceptable; we still animate colors. Verify "ring on selected" and "shadow on dragging" still look fine (instant transitions are OK here).
- Stripping `width: calc(...)` while dragging can briefly let the dragged clone snap to its natural content width — usually preferable. Verify with a long chord name like "Cmaj7#11".

---

## Issue 2 — Reorder doesn't sync between Lyrics and Progressions

### Likely root causes, ranked

1. **Confirmed bug (render-level): the lyrics row paints chords at their stored `slotIndex`, ignoring the SSOT order it just walked.**
   In `LyricsTab.tsx`:
   - line 105 `chordsBySlot()` — `out[c.slotIndex] = c`.
   - line 337 `const slots = chordsBySlot(lineChords)`.
   Even though `lineChords` is now in SSOT order via `getLineChordsViaSSOT`, the on-screen position of each chip is pinned to the stale `lyricsPlacement.slotIndex` from before the progressions reorder. Result: when the user reorders in Progressions, `section.chords` shifts but `slotIndex` values are unchanged, so the lyrics row paints chips in the OLD positions.

2. **Confirmed bug (store-level): `movePatternChord` (lines 2746–2769) only swaps positions inside `section.chords`. It does NOT update `lyricsPlacement.slotIndex`.**
   That matches the documented SSOT principle ("slot/beat is per-view metadata"), but combined with (1) the lyrics view never re-derives slot positions from SSOT order. The change is real but invisible in lyrics.

3. **Symmetric bug (lyrics → progressions):** `moveChordToSlot` (store line 1911) swaps two anchors' `slotIndex` values; it does NOT mutate `section.chords` order. Lyrics renders from `slotIndex`, so it looks correct locally. Progressions reads `getPatternChordsViaSSOT` which walks `section.chords` — that order is unchanged, so the progression view shows the OLD order. Same root-cause class on the other side.

**Was the previous fix incomplete?** Yes. The previous round fixed `getLineChordsViaSSOT` to walk SSOT order, but the actual rendering goes through `chordsBySlot(lineChords)` which throws away that order in favor of `slotIndex`. And reorder actions on each side only mutate ONE of the two projections.

**The bug is BOTH store-level AND render-level.**

**Files implicated**
- `src/components/lyrics/LyricsTab.tsx`: `chordsBySlot()` (line 105), call site (line 337), left/right arrow handlers (lines 595–625) calling `moveChordToSlot` (only mutates `slotIndex`).
- `src/store/song.ts`: `moveChordToSlot` (line 1911) — only updates `lyricsPlacement.slotIndex`. `movePatternChord` (line 2746) — only reorders `section.chords`. Neither updates the OTHER projection.

### Proposed fix

**Minimal safe fix (render-level only — smallest blast radius)**
- In `LyricsTab.tsx`, replace `chordsBySlot(lineChords)` with a function that places chords into slots in SSOT order while still respecting `lyricsPlacement.slotIndex` as a *preference*:
  - Walk `lineChords` in SSOT order.
  - For each chord, place at its preferred `slotIndex` if that slot is free AND respects monotonic ordering vs. the previous placed chord. Otherwise place at the next free slot ≥ `previous + 1`.
  - The lyrics row then honors SSOT order even when `slotIndex` values are stale.

**Optional stronger fix (recommended — true SSOT)**
- Make every reorder action mutate BOTH projections atomically:
  - `movePatternChord` / `reorderPatternChord` / progression drag handlers must also recompute `lyricsPlacement.slotIndex` for affected chords. Simple rule: after reordering `section.chords`, walk each affected line's chords in SSOT order and assign `slotIndex = currentSlotIndex` if it preserves monotonicity, otherwise bump to `prev + 1` capped at `CHORD_ROW_SLOTS - 1`.
  - `moveChordToSlot` (lyrics arrows + lyrics drag) must also reorder the entries in `section.chords` to match the new visual order on that line. Reorder ONLY the relative order of entries belonging to that line; preserve interleaving with other-line chords by stable index.
- Treat `lyricsPlacement.slotIndex` purely as a per-view position hint. Add one helper `reconcileLyricsSlotsFromSSOT(section)` and call it from every reorder mutation.

**Regression risks**
- The recommended fix touches several store mutations. Risk: chord identity & mirror linkage. Mitigate by preserving `id`, only swapping `slotIndex` and array order. Existing `pushHistory()` already snapshots before each.
- Edge case: lyrics row with 0 free slots when SSOT pushes a 9th chord into an 8-slot row. Decision: clamp to last slot (existing failure mode for >8 chords) — document this.

---

## Issue 3 (revised) — All BasketBar chips need a second gesture to drag

### What the code actually contains today

`src/components/basket/BasketBar.tsx` lines 122–159 — the chip Draggable:

```tsx
<Draggable key={b.id} draggableId={`basket:${b.id}`} index={i} isDragDisabled={false}>
  {(prov, snap) => (
    <div
      ref={prov.innerRef}
      {...prov.draggableProps}
      {...prov.dragHandleProps}
      data-basket-chip="true"
      data-basket-id={b.id}
      role="button"
      aria-pressed={sel}
      aria-label={...}
      onPointerDown={(e) => onChipPointerDown(b.id, e)}
      onPointerUp={(e) => onChipPointerUp(b.id, e)}
      onPointerCancel={() => (tapInfo.current = null)}
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        ...prov.draggableProps.style,
      }}
    >
      <div style={{ cursor: snap.isDragging ? "grabbing" : "grab", opacity: snap.isDragging ? 0.9 : 1 }}>
        <StaticChordChip chord={b.chord} dragging={snap.isDragging} selected={sel} />
      </div>
    </div>
  )}
</Draggable>
```

Walking the corrected 5-cause checklist against this code:

1. **Draggable remount?** `key={b.id}` is stable. No conditional rendering around `<Draggable>`. BUT: BasketBar subscribes to `useBasketSelectionStore` which replaces `selected` with a NEW `Set` on every toggle, re-rendering the entire BasketBar. The Draggable's `key` is stable so pangea SHOULD keep its registration, but the wrapper `<div>` is a brand-new VDOM node each time. Generally fine — but combined with a pointer event currently in flight, can cause pangea to lose its sensor lock. **Likelihood: medium.**

2. **Pointer events blocked at a container level?** The chips container (BasketBar root + the `flex flex-wrap items-center gap-2 py-1` wrapper inside the Droppable) does NOT set `touchAction`, `pointer-events: none`, `preventDefault`, or `stopPropagation`. The fixed-position root carries no handlers. **Likelihood: low.**

3. **`dragHandleProps` spread incorrectly?** Spread is unconditional and on the same element as `innerRef` and `draggableProps`. Correct. **Likelihood: very low.**

4. **Scroll container interfering?** The chip container is `flex flex-wrap` (not `overflow-x-auto`). `touchAction: "none"` IS set on the chip itself, so body scroll shouldn't claim the gesture. **Likelihood: low-to-medium.**

5. **Custom tap detection on every chip? — YES, confirmed.** Every chip has `onPointerDown` / `onPointerUp` / `onPointerCancel` on the SAME element pangea uses for its drag sensor. Pangea installs its own pointer listeners on the drag handle. Our React handlers run alongside pangea's on the same DOM node:
   - `onChipPointerDown` arms `tapInfo.current = { id, t, x, y }` (lines 89–99).
   - `onChipPointerUp` toggles selection if movement < 8px and time < 300ms.
   - On a slow press-and-drag (typical on touch — finger down, settles 100–300ms, then moves), the simultaneous arming of two pointer-tracking systems on the same DOM node delays pangea's drag-start. The first gesture often gets eaten as a tap (if quick) or as a no-op (if pangea didn't quite cross threshold before our handlers re-rendered the tree via `toggleSelected` on lift). Lift → selection toggles → re-render → pangea's sensor resets. Second gesture works because there's now no `tapInfo` armed conflict and the chip is in steady state.
   - **Likelihood: high — this is the most plausible single root cause.**

### Diagnostic phase (do this BEFORE writing the fix)

Add temporary console logs and run the suggested probes. Instrument `BasketBar.tsx`:

```tsx
<Draggable key={b.id} ...>
  {(prov, snap) => {
    console.log("[basket] render", { id: b.id, sel: isSelected(b.id), isDragging: snap.isDragging });
    return (
      <div
        ref={prov.innerRef}
        {...prov.draggableProps}
        {...prov.dragHandleProps}
        onPointerDown={(e) => { console.log("[basket] pointerdown", b.id); onChipPointerDown(b.id, e); }}
        onPointerUp={(e) => { console.log("[basket] pointerup", b.id); onChipPointerUp(b.id, e); }}
        ...
```

Also wrap the `DragDropContext` in `Index.tsx`:

```tsx
onDragStart={(start) => { console.log("[dnd] start", start); ... }}
onDragEnd={(result) => { console.log("[dnd] end", result); ... }}
```

Run these three probes on a touch device (or DevTools touch emulation):

- **Probe A** — press-and-hold an unselected chip for 1 s without moving, then drag.
  - Expect logs: `pointerdown` → (after selection store update) `render` → `[dnd] start`. If `[dnd] start` does NOT appear on the first gesture, confirms #5.
- **Probe B** — same as A but on an already-selected chip.
  - Expect: `pointerdown` (tap detector skips arming via early-return at line 94) → `[dnd] start` immediately on movement. If this STILL needs two gestures, root cause is NOT the tap detector — suspect #1 (re-render at the moment of selection-store subscription) or pangea's touch sensor itself.
- **Probe C** — temporarily delete `onPointerDown` / `onPointerUp` / `onPointerCancel` from the chip wrapper. Drag a fresh chip.
  - If drag works in one gesture → confirms #5 is the entire root cause.
  - If drag still requires two gestures → rules out #5; suspect #1 (re-renders from `useBasketSelectionStore` subscription racing with pangea's pointer setup) or #4 (mobile scroller competition).

### Likely outcome ranking

1. **#5 — custom pointer handlers on the drag-handle element compete with pangea's sensor.** Most likely. Confirmed by Probe C.
2. **#1 — selection store subscription causes a re-render mid-gesture.** Possible secondary contributor. Confirmed if Probe B still requires two gestures.
3. **#4 — touch scroll competition on the fixed bar.** Unlikely with `touchAction: none` already set; verify with Probe B.
4. **#2 / #3** — ruled out by code inspection.

### Proposed fix (write only after probe results)

**If Probe C confirms #5 (most likely):**

Move the tap detector OFF the drag-handle element. Use one of:

- **Option A (recommended): replace pointer handlers with `onClick` only.**
  ```tsx
  <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
       onClick={(e) => { if (!snap.isDragging) toggleSelected(b.id); }}
       data-basket-chip="true" ...
  >
  ```
  Pangea's drag-start cancels the synthetic `click` (the gesture moves past the click threshold), so real drags never call `toggleSelected`. Static taps still produce a `click` and select. Removes ALL competition with pangea's pointer sensor.

- **Option B:** keep pointer handlers but attach them to the INNER static chip wrapper (the one currently holding `cursor: grab`), so pangea's sensor on the outer node is uncontended. Selection logic still works because pointer events bubble. Slightly less clean than Option A.

**If Probe B also requires two gestures (selection-store re-render is the real cause):**

- Hoist the `selected` Set read out of the BasketBar render path: subscribe ONLY where it's needed (the chip wrapper as a child component using a per-chip selector returning just a boolean), so toggling one chip doesn't re-render the whole basket and every other Draggable.
  ```tsx
  function BasketChip({ id, ... }) {
    const sel = useBasketSelectionStore((s) => s.selected.has(id));
    ...
  }
  ```

**If Probe C drag still fails (root cause is elsewhere):**

- Check whether `onDragStart` in `Index.tsx` synchronously calls `lyricsOnDragStart`, which may set state in lyrics that triggers a render cascade across the layout. If so, defer it to a microtask (`queueMicrotask`).

### Regression risks

- **Option A** loses the ability to distinguish between a long-press tap and a quick tap for selection — both would now select, which matches the user's stated mental model anyway.
- Per-chip selection subscription change is a refactor of `BasketBar` into `BasketBar` + `BasketChip` components. Minor risk: ensure the `renderClone` path inside the Droppable still has access to the chord object (it does — reads from `basket[rubric.source.index]`).

---

## Implementation order

1. **Issue 1 first.** CSS/style change with no store impact, low risk; unblocks meaningful manual testing of issues 2 and 3 (which both involve dragging).
2. **Issue 3 next.** Localized to `BasketBar.tsx` + the `onDragStart` in `Index.tsx`. Doesn't touch the store. Verifying issue 2 requires confidence that drags actually work cleanly.
3. **Issue 2 last.** Highest blast radius — store mutations on both sides plus the lyrics renderer. Best done after dragging is solid so DnD-driven reorders are also covered by the same "reconcile both projections" helper.

No single root cause explains all three; each is independent. But fixing #1 makes manual QA of #2 and #3 actually possible on touch devices.

---

## Validation plan

### Issue 1
1. On mobile viewport, open Progressions tab. Long-press any chord in any pattern.
2. Expected: chord chip stays under finger from the first frame, no jump to top-left.
3. Repeat on a chord with a long name ("Cmaj7#11"): width remains readable during drag.
4. Repeat in Lyrics tab on each of the first 3 chords in a row.
5. Repeat on the BasketBar (a selected chip).
6. With a `transform`-applying ancestor temporarily added (e.g. wrap `<main>` in `<div style={{ transform: 'translateZ(0)' }}>`), the drag should STILL track the finger if the optional portal fix is applied.

### Issue 2
1. Add 4 chords to a section: A, B, C, D.
2. Switch to Progressions, enter edit mode, use the right-arrow on chord B → it becomes order A, C, B, D.
3. Switch to Lyrics. Verify the row shows A, C, B, D (not A, B, C, D).
4. In Lyrics, drag chord C to the left of A → order becomes C, A, B, D.
5. Switch to Progressions. Verify the pattern shows C, A, B, D.
6. Repeat with multi-line sections to confirm only the affected line's slot indices are reconciled and other lines stay put.
7. Confirm that `slotIndex` gaps in the lyrics row (e.g. chord at slot 0 and slot 5 with empty slots between) are preserved when SSOT order matches the slot order, and only get compacted when SSOT requires it.

### Issue 3 (touch and mouse)
After fix, every one of these must succeed in a single uninterrupted gesture:

1. Fresh, never-selected chip → press → drag onto a lyric slot → drops correctly.
2. Selected chip → press → drag onto a progression pattern → drops correctly.
3. Multi-selected (3 chips) → press one of them → drag → all three drop into consecutive slots, "+2" badge visible mid-drag.
4. Multi-selected (3 chips) → press a chip NOT in the selection → drag → only that chip drops; the previous selection remains intact (or clears, depending on chosen semantic — make it explicit and document it).
5. Single tap on any chip (no movement) → toggles selection.
6. Tap a chip → tap it again → both toggle correctly without ghost selection state.
7. Drag-cancel mid-gesture (drop outside any droppable) → selection state matches pre-drag.
