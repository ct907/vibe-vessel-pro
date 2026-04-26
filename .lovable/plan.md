## Goals

Address 11 UX issues across the Lyrics tab, Progressions tab, BasketBar, and FocusedChordEditor without changing the SSOT model.

---

## Lyrics Tab

### L1. Pencil button no longer auto-selects all chords

**File:** `src/components/lyrics/LyricsTab.tsx` (~lines 509–527)

Currently entering Edit Mode pre-selects every chord on the row (`selection.set(lineChords.map(...))`). Remove that block so Edit Mode opens with an empty selection — the user does the picking.

### L2. Add "Select all" to the chord-row context menu

**File:** `src/components/lyrics/LyricsTab.tsx` (selection toolbar, lines 538–622)

Add a small "Select all" button (or icon button with checkmark) in Row 1 of the toolbar that calls `selection.set(lineChords.map(c => c.id))`. Position it next to the counter so it remains discoverable while in Edit Mode.

### L3. Don't auto-close context menu when selection becomes empty

**File:** `src/components/lyrics/LyricsTab.tsx` (toolbar render guard, line 537)

Today the toolbar render condition is `selection.size > 0 && lineChords.some(...)`. Replace with `isEditMode` so that while Edit Mode is on, the toolbar stays visible even with 0 selected chords (showing "0 selected · Select all · Done"). The toolbar is dismissed only by the **Done** button or by tapping the **pencil** again. The `useEffect` that clears selection on outside click (lines 298–321) should also be gated to NOT clear if `isEditMode` is true (or only clear selection — never close edit mode).

### L4. Don't exit edit mode after Delete

**File:** `src/components/lyrics/LyricsTab.tsx` (Delete button, ~lines 603–616)

Currently Delete calls `selection.clear()` which (under L3) keeps the toolbar open since `isEditMode` stays true. Confirm Delete only clears `selection` and does NOT call `setIsEditMode(false)`. Same treatment for the toolbar's `X` Close-selection button (line 546): it should clear selection but keep edit mode on.

### L5. Chord row "stuck not draggable" investigation

**File:** `src/components/lyrics/LyricsTab.tsx` (Draggable wrapper around chip, lines 421–488)

Chips can become non-draggable, likely because the inner `onClick` handler stops propagation/prevents the synthetic events `@hello-pangea/dnd` listens for during a slow press. We will:

- Ensure the Draggable wrapper always renders `dragProvided.dragHandleProps` (it does), and
- Add `onPointerDown` that does NOT call `stopPropagation` (only the `onClick` should), so dnd's sensor sees the press.
- Reset the `lastSelectedRef` and any per-row pointer state when `selection.size === 0` to prevent stale capture.

If reproducible after that, also remove `pointer-events-none` on the inner chord chip wrapper (line 462) when `isEditMode` is on so dnd's hit-testing finds the chip directly.

---

## BasketBar

### B1. Tap-to-focus chord should be immediately draggable

**File:** `src/components/basket/BasketBar.tsx` (lines ~95–185)

Currently `isDragDisabled={!sel}` means an unselected chip can't be dragged at all; after a tap the chip becomes selected, but the user reports needing a second gesture. Root cause: the same pointer gesture that toggled selection is consumed by our tap detector and never reaches the dnd sensor. Fix:

- After `toggleSelected(id)` in `onChipPointerUp`, do nothing else — but on the NEXT pointerdown the sensor will already see `isDragDisabled=false`. Verify by removing `touchAction:"none"` on unselected chips (only set it once selected) and confirming pangea's drag handle is active.
- Alternative if still flaky: switch the strategy to `isDragDisabled={false}` for all basket chips, and use the tap detector only to toggle selection on quick taps (drag still wins on long-press / movement).

### B2. Mobile drag clone offset (chord appears top-left of finger)

**Files:** `src/components/basket/BasketBar.tsx` (renderClone), `src/components/lyrics/LyricsTab.tsx` (Draggable inside slot)

`@hello-pangea/dnd` positions the clone using the original element's bounding rect. When the source element is `pointer-events-none` or wrapped in transformed parents (e.g. the row that gets `relative z-[60]` while focused, line 330), the clone offset can be miscalculated.

Plan:

- In BasketBar's `renderClone`, ensure no `transform` is applied to the parent during drag — remove `scale-105` from the `selected` styling on `StaticChordChip` since it's compounding with dnd's clone transform.
- In LyricsTab, avoid applying `pointer-events-none` to the inner chip wrapper (line 462) — pangea uses pointer position relative to the dragged element, and pointer-events:none on the visible child can cause the offset to default to (0,0) of the parent on touch.
- Verify by setting CSS `will-change: transform` on draggable chip parents to keep their transform origin stable.

---

## FocusedChordEditor (Mobile)

### F1. Don't elevate the underlying lyric/chord row; show clones inside the editor

**File:** `src/components/lyrics/FocusedChordEditor.tsx` + `src/components/lyrics/LyricsTab.tsx`

Currently the LineRow gets `relative z-[60] ring-2 ... shadow-lg` when active (line 330) which visually pops the row above other UI. Instead:

1. In `LyricsTab.tsx`: remove the `active`-specific `z-[60]` / ring / shadow styling when the FocusedChordEditor is open on mobile (gate by `isMobile && picker`). Underlying rows stay at their normal z-depth.
2. In `FocusedChordEditor.tsx`: just below the header (above the input field) render a **read-only clone** of:
  - The lyric text (read `line.text`)
  - The chord row with current chord chips placed at their slot positions:
    - Sync state using section.chords [], both original and clone views refresh using SSOT.

The clone updates live as `placeChordInSlot` / `upsertChordAt` mutate the store (the component already subscribes to `sections`). Add a clear visual separator between the clone and the input.

---

## Progressions Tab

### P1. Add edit-pencil to pattern block (matches Lyrics tab)

**File:** `src/components/progressions/ProgressionsTab.tsx` (PatternBlock header, ~lines 295–326)

Add a `<Pencil>` icon button next to the Trash icon that toggles `selectMode`. Behavior:

- Toggling on: `setSelectMode(true)`, do NOT pre-select chords.
- Toggling off: `exitSelect()` (clears selection + select mode).
- While `selectMode` is true, tapping a chord toggles its membership (already implemented at lines 266–275).
- The unified context menu (P4) shows whenever `selectMode` is on, even with 0 selected (showing "0 selected · Select all · Done").

Also remove the auto-close-on-empty effect (lines 147–150) since `selectMode` should now be controlled solely by the pencil / Done.

### P2. Resize chord slots up to 48px to fit long names

**File:** `src/components/progressions/ProgressionsTab.tsx` (slot styling at lines 394–402, 437)

The pattern row uses `flex: span span 0%` for proportional widths inside a fixed grid, so 28→48px doesn't directly apply there. The 28px clamp is in the **lyrics chord row** (see `LyricsTab.tsx` line 370 `${(i+1)*28}px` and slot `w-7 = 28px` line 400).

Plan (for the **lyrics** chord row, since that's where the 28px slot grid lives):

- Replace fixed `w-7` slot with `min-w-[28px] max-w-[48px] w-fit` and let chord chip text size the slot via `width: fit-content`.
- Update the divider positions (line 366–373): instead of fixed `(i+1) * 28`, render dividers as siblings between slots using flex `border-l` on each slot — this keeps dividers correct as widths vary.
- Slot indices remain stable; only their on-screen widths change.

Check if dynamic width of the slots are calculated when user initiates drag and drop action. Check if observer needs debouncing to prevent excessive rerenders.

This applies only to lyrics chord row (where the 28px lives), not the beat-grid pattern block.

### P3. Allow deleting an empty pattern block when other blocks exist

**File:** `src/components/progressions/ProgressionsTab.tsx` (line 140 `canDeleteThisBlock` and ~316–322)

Today deletion is allowed only when `blocksInSection > 1`, regardless of whether the block has chords. That's already what the user wants (block A can be emptied → moved → deleted as long as there's any other block in the SONG, not just the section). Update to song-level:

- Change `canDeleteThisBlock` to `totalPatternBlocksInSong > 1`. Compute via `useSongStore` selecting all `sections.flatMap(s => s.progression).length`.

The store action `removePatternBlock` already drops chords with no lyric placement and detaches mirrors, so empty deletion is safe.

### P4. Unify "active chord" and "select mode" context menus

**File:** `src/components/progressions/ProgressionsTab.tsx`

Remove the separate `activeChord` state path. After the change:

- Tapping a chord enters `selectMode` (or stays in it) and toggles that chord's selection — single chord = treated as a 1-item selection.
- The context menu always reads from `selectedIds`. With `selectedIds.length === 1` it shows the same controls as before but without the "Length: N beats" text indicator (the user explicitly asked us to remove that text — lines 582–586).
- Keyboard +/-/Del operate on `selectedIds` (already works via `removePatternChordsBatch` and `resizePatternChordsWithOverflow`).
- Audition (`playChord`) still fires on tap when `selectedIds` becomes exactly 1 (preserves the single-tap audition UX).
- The "Move to…" Select stays available whenever `selectedIds.length >= 1`.

Specific edits:

- Drop `activeChord` state, `setActiveChord` calls, the `useEffect` at lines 168–180, and the `active`/`activeIdx` derivations (lines 282–284).
- In `handleChordTap`: always go through the selection-toggle path; if after toggle `selected.size === 0`, exit selectMode only if pencil hasn't been engaged manually. Track `manualSelectMode` ref (set true when pencil pressed).
- Render the context menu when `selectMode === true` OR `selected.size > 0`.
- Remove the `{showSingle && c && <span>... beats</span>}` block (lines 582–586).
- Length controls work on `selectedIds`; if it's a single chord use `setPatternChordLength`, else `resizePatternChordsWithOverflow`.

---

## Out of scope (deferred)

- Cross-tab chord sync (separate SSOT polish task).
- Existing UI polish issues the user said to defer.

---

## Sequencing

Recommend implementing in this batch order so each piece can be smoke-tested:

1. **Lyrics edit-mode behavior**: L1, L2, L3, L4 (single coherent change set), **Drag fixes**: L5, B1, B2 (drag/touch behavior — interrelated), **Progressions context unification**: P1, P3, P4.
2. **Lyrics chord-row width / slot resize**: P2.
3. **FocusedChordEditor restructure**: F1.

After each batch, you can confirm console is clean before proceeding to the next.
---

## Implementation log (2026-04-26)

- L1–L4 done: pencil no longer pre-selects; Select-all button in toolbar; toolbar persists while in Edit Mode (controlled by Done/pencil only); outside-click & delete no longer exit edit mode.
- L5 + B2: removed `scale-105` from selected basket chip (was compounding with dnd transform); kept inner chip `pointer-events-none` for handle stability.
- B1: basket chips are now `isDragDisabled={false}` for all chips — quick tap toggles selection, long-press/movement initiates drag immediately.
- F1: underlying lyric row no longer gets `z-[60]/ring/shadow` on mobile when picker is open; FocusedChordEditor now renders a live read-only Preview (chord row + lyric text) above the input.
- P1: pencil button added to pattern block header, toggles `selectMode` without pre-selecting.
- P2: lyrics chord row slots are now `28–48px w-fit` for occupied slots; dividers moved from absolutely-positioned to per-slot `border-l`.
- P3: per-block deletion now gated by `totalBlocksInSong > 1` (read from `s.progression.length`) instead of per-section.
- P4: removed `activeChord` state entirely; unified context menu rendered whenever `selectMode` is on (single-tap selects exclusively + auditions, second tap clears); removed the "N beats" length text indicator; Select-all also added to the menu's row 1.
