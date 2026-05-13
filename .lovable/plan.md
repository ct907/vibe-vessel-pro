# Extend natural octave-save behaviour to ChordPickerSheet (desktop)

## Problem

On desktop, both Lyrics and Progressions use `ChordPickerSheet` instead of `FocusedChordEditor`. Today the sheet has its own local `octave` state but:

1. **Picked chord doesn't carry the octave.** `handlePick(chord)` calls `onPick(chord)` without merging the selected octave. Both consumers (`LyricsTab.handlePick`, `ProgressionsTab.handlePick`) write that chord straight into the store via `upsertChordAt` / `placeChordInSlot` / `updatePatternChord` / `addChordToPatternSlot`, so the saved chord ends up with no `octave` field — playback and audition then fall back to 4.
2. **Octave doesn't seed from the chord being edited.** Opening the sheet on an existing chord always starts at octave 4, even if the chord was previously saved at 3 or 5.
3. **Octave-only edits aren't saved.** If a user opens an existing chord, changes the dropdown to octave 5, and closes the sheet without re-picking from the suggestion grid, the change is lost (no live persistence).

This is the desktop analogue of the lyrics-mode bug we just fixed in `FocusedChordEditor`.

## Fix

### 1. `src/components/chord/ChordPickerSheet.tsx`
- Seed `octave` from `initialChord?.octave ?? 4` in the existing "open" effect (alongside the query seed). Apply both when uncontrolled and when `initialChord` changes while open.
- In `handlePick`, attach the current octave: `onPick({ ...chord, octave })`.
- Add an optional prop `onOctaveChange?: (octave: number) => void`. Wire the existing octave `<Select>` to call it after `setOctave`. This is the "natural save" hook for octave-only edits.

No UI changes; the dropdown stays where it is.

### 2. `src/components/lyrics/LyricsTab.tsx`
- Pass `onOctaveChange={(oct) => { ... }}` to `ChordPickerSheet`. When `picker.anchorId` is set, look up the live chord (`activeLine.chords.find(c => c.id === picker.anchorId)?.chord`) and call `upsertChordAt(picker.sectionId, picker.lineId, picker.slotIndex, { ...currentChord, octave: oct }, picker.anchorId)`. When no anchor (still placing a new chord), do nothing — the octave will ride along with `onPick`.
- `handlePick` needs no change: the chord arg now already includes `octave`, so the store writes it through.

### 3. `src/components/progressions/ProgressionsTab.tsx`
- Pass `onOctaveChange` to `ChordPickerSheet`. When `picker.replaceChordId` is set, find the current pattern chord and call `updatePatternChord(picker.patternId, picker.replaceChordId, { chord: { ...current.chord, octave: oct } })`. When adding a new chord (no `replaceChordId`), do nothing.
- `handlePick` keeps its current shape; the incoming `chord` already carries the octave for both `updatePatternChord` and `addChordToPatternSlot`.

## Result

Desktop matches mobile: octave selected in `ChordPickerSheet` is persisted on the chord automatically — both when picking and when changing only the octave on an existing chord. Tap-to-audition (already reads `chord.octave`) and Transport playback (per-chord octave from earlier fix) then play the saved octave.

## Files touched
- `src/components/chord/ChordPickerSheet.tsx` — seed octave from initial chord, attach octave to picked chord, expose `onOctaveChange`.
- `src/components/lyrics/LyricsTab.tsx` — wire `onOctaveChange` to `upsertChordAt` for the edited anchor.
- `src/components/progressions/ProgressionsTab.tsx` — wire `onOctaveChange` to `updatePatternChord` for the replaced chord.
