## Fix chord insertion order in ChordPickerSheet and FocusedChordEditor

### Problem
When typing chords sequentially in both the ChordPickerSheet (desktop) and FocusedChordEditor (mobile), chords accumulate right-to-left instead of left-to-right. Example: typing C, F, Em, Gm11 shows Gm11 Em F C.

### Root causes found

1. **ChordPickerSheet batch reversal** — In `handlePickNashville` and `handlePresetUse`, when `onPickBatch` is omitted (LyricsTab usage), chords are explicitly reversed before calling `onPick` one-by-one: `[...stamped].reverse().forEach((c) => onPick(c))`. Even for single-chord Nashville matches, this logic path can fire and the reversal logic was added as a reflow workaround that is no longer correct.

2. **FocusedChordEditor slot not advanced after upsert** — When `anchorId` is set (user tapped an existing chord to edit), `upsertChordAt` replaces the chord but `slot` is NOT incremented. The next typed chord calls `placeChordInSlot` at the SAME slot, pushing the previous chord to the right. Result: newest chord appears on the left, older chords shift right — a right-to-left accumulation.

### Changes

**File: `src/components/chord/ChordPickerSheet.tsx`**
- Remove `.reverse()` from the `handlePickNashville` fallback (lines ~155).
- Remove `.reverse()` from the `handlePresetUse` fallback (lines ~167).
- Keep `onPickBatch` forward-order path unchanged.

**File: `src/components/lyrics/FocusedChordEditor.tsx`**
- In `handlePick`, after `upsertChordAt` (the `anchorId` branch), advance `slot` by `chordSlotWidth(chord.display) + 1` so subsequent inserts land to the right, not on top of the replaced chord.
- In `handlePickNashville` and `handlePresetUse`, remove the `[...placements].reverse()` loops. Insert in forward order since `placeChordInSlot` + `insertSectionChordAtSlot` already maintain correct slot-sorted SSOT order.

**Verification**
- Run `npx tsc --noEmit`.
- In browser: tap an existing chord, type C → Enter → F → Enter → Em → Enter → Gm11 → Enter. Verify visual order is C F Em Gm11 left-to-right.
- Test Nashville batch (e.g. "2 5 1") in both components. Verify forward order.
- Test preset insertion. Verify forward order.