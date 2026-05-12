# Plan

## 1. Lyrics chord-row slot border on selection + hover

In `LyricsTab.tsx` (chord row, lines ~262-319), the slot border currently lights up only when `hasActiveChordInLine` is true. Make it visible whenever:

- a chord in this line is selected (already covered by `hasActiveChordInLine`),
- OR the user is hovering the chord row (use a `group` / `group-hover:` pair).

Changes:
- Add `group` to the row container (line 277).
- In each slot's `className` (line 313-316), keep the active-chord border state, and add `group-hover:border-muted-foreground/40` plus `group-hover:border-l-muted-foreground/35` for `slotIdx > 0`.
- Remove the per-slot `hover:border-muted-foreground/40` (it only fires on the slot under the cursor; the row-level hover gives the user the full slot grid).
- Border becomes hidden again automatically when the chord is deselected and the cursor leaves.

## 2. Pattern-block chords sit flush, even at 0.5-bar lengths

`ProgressionsTab.tsx` `PatternBlock` (lines ~268-320) currently builds `slotCount = bars * beatsPerBar` cells of equal width. A chord whose `lengthBeats < 1` still occupies one full slot but renders at `widthPct = lengthBeats/1 * 100`, leaving an empty gap before the next chord.

Refactor the layout so chord widths are proportional to `lengthBeats` and chips sit flush left, with no leading gaps:

- Replace the per-beat slot-cell `flex` model with two layered passes inside the existing `relative h-20 ... flex w-full` container:
  - **Bar/beat dividers**: keep the absolutely-positioned bar separators and beat dividers (lines ~298-315) as-is — they are already percentage-positioned over `totalBeats`.
  - **Chord track**: render a single `flex` row of chord chips, each with `style={{ flex: \`${c.lengthBeats} ${c.lengthBeats} 0%\` }}`. Chips render in SSOT order with no spacers between them, so a 0.5b chord sits flush against the next chord. Drop the per-chip `width: calc(${widthPct}% - 4px)` style — the flex basis now drives width.
  - **Free-space tail**: after the last chord, render one droppable that takes `flex: ${freeBeats} ${freeBeats} 0%`. This is the single "empty area" target for picker-open clicks and drops. (We lose per-beat empty droppables; compensate by giving the tail a `data-pattern-slot="${usedBeats}"` and computing the drop slot from pointer X within the tail when needed. If keeping per-beat empty drop targets is required, render `Math.floor(freeBeats / beatsPerSlot)` empty droppables sized `flex: 1 1 0%` after the chord track.)
- Keep the existing edge-left / edge-right droppables for cross-block transfers.
- Keep the `Droppable` per-chord wrapper for re-ordering inside the block; just place each `Droppable` inside the new flex track instead of inside per-beat slot cells.

Result: a 0.5-bar chord renders at exactly half a beat's width, the next chord starts immediately to its right, and the free-space drop zone fills the remainder.

## 3. Resizing a chord reflows neighbours to the right

Falls out of step 2: because chord widths come from `flex-basis = lengthBeats`, calling `setPatternChordLength` (or `resizePatternChordsWithOverflow`) updates `c.lengthBeats` in the store, which re-renders the flex track and the right-side neighbours shift automatically. No additional store changes needed; verify visually in the toolbar's `+` / `-` buttons (lines 593-630) and the keyboard ↑/↓ handler (lines 205-216).

If the store still snaps `startBeat` to integers and that causes visual jumps when a 0.5-bar chord grows to 1.0, switch the chord-track render to compute positions purely from accumulated `lengthBeats` (already true under SSOT — `getPatternChordsViaSSOT` returns chords in order; `startBeat` is only used for the playback cursor, which is already percentage-of-total-beats).

## 4. Chord context menu +20% bigger

Assumption: "chord context menu" = the floating chord toolbar in `ProgressionsTab.tsx` (lines 555-670) that appears under an active chord with reorder, ±½-bar, multi-select, select-all controls. (The right-click / long-press also opens `FocusedChordEditor`, which is a full-screen sheet — out of scope unless you say otherwise.)

Scale the toolbar and its buttons by ~1.2×:
- Container (line 558): `px-1.5 py-1` → `px-2 py-1.5`, `gap-1` → `gap-1.5`.
- Every `Button size="icon"` inside (lines 561, 577, 594, 615, 636, 656): `h-7 w-7` → `h-9 w-9`.
- Every `Lucide` icon inside those buttons: `h-4 w-4` → `h-5 w-5`.
- Chord-name span (line 573): `text-sm` → `text-base`; bar-length span (line 611) `text-xs` → `text-sm`; counter (line 649) `text-xs` → `text-sm`.
- Vertical dividers (lines 590, 632): `h-5` → `h-6`.

If you confirm the target is actually `FocusedChordEditor` (or the section-header `DropdownMenu`), I'll re-scope to that surface instead.

## Files touched

- `src/components/lyrics/LyricsTab.tsx` — chord-row slot hover/select border.
- `src/components/progressions/ProgressionsTab.tsx` — flush sub-beat chord layout (#2/#3) and toolbar sizing (#4).

No store, schema, or test changes are required; existing `chordLayout` and SSOT helpers are untouched.
