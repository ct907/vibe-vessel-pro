## 1. Add Spice — inherit chord octaves from the pattern

In `src/components/progressions/SpicePanel.tsx`, attach octave info to every suggestion chord before previewing or committing:

- Build an `octaveFor(i)` helper from `sortedChords` (use `sortedChords[i]?.chord.octave`, falling back to the previous chord's octave, then to `4`). This handles `countChanged` suggestions where indices may exceed the original length.
- In `playSuggestion`, set `{ ...c, octave: octaveFor(i) }` on each chord before pushing into `events`.
- In `commitSuggestion`, do the same on chord lists passed to `replacePatternChords` and `addChordToPattern` in both the count-changed and 1:1 branches. The Undo path already restores from the original chord objects, which retain their octaves.

No changes in `lib/music/suggestions.ts` or `lib/music/spice.ts`.

## 2. Inline preset progressions inside chord editors

Extract a presentational `PresetList` from `src/components/progressions/PresetBrowser.tsx` (filter chips + preset cards with Play/Use; no `Sheet`). Keep the existing `PresetBrowser` wrapper using it for any other callers.

Render `<PresetList />` directly inside the editor sheet content — **no button, always visible** — in both:
- `src/components/chord/ChordPickerSheet.tsx`: place it immediately below the typing input row (after the octave select / Nashville preview block).
- `src/components/lyrics/FocusedChordEditor.tsx`: same placement, directly below its typing input row.

When the user types in the input, the existing chord suggestion grid appears **above** the preset progression list, so the editor layout becomes:

```text
[ input row + helpers + octave ]
[ Nashville preview (existing, when applicable) ]
[ Chord suggestions grid (existing — shown while typing) ]
[ Popular Progressions (filter chips + preset cards, always visible) ]
```

The whole editor sheet body becomes a single vertical scroll container so the user can scroll through both sections inside the modal. Remove inner `overflow` containers on the suggestion grid (the `gridMaxHeight`-bounded scroll areas in ChordPickerSheet, and the equivalent in FocusedChordEditor) so they grow naturally and the outer sheet scrolls instead.

`PresetList` `onUse(chords)` behavior:
- Pattern-block mode (`props.patternId`): clear existing chords in that pattern, then sequentially insert preset chords with `addChordToPatternSlot` starting at `props.atBeat`, applying the editor's current `octave` to each. Close the editor sheet.
- Lyrics-slot mode (`props.sectionId` + `lyricsLineId`): place chords into consecutive slots starting at the active slot via `placeChordInSlot`, carrying the current `octave`. Close the editor sheet.

## 3. Remove preset entry points from ProgressionsTab

In `src/components/progressions/ProgressionsTab.tsx`:
- Delete the `<Music2>` ghost icon button in the block header (lines ~296–308).
- Delete the empty-state "Browse progressions" sculpted button (lines ~797–808).
- Delete the `<PresetBrowser>` instance, `presetBrowserOpen` state, the `PresetBrowser` import, and the `Music2` import (verify it isn't used elsewhere in the file first).

## Verification

- `npx tsc --noEmit`
- Spice preview/commit uses the focused chord's octave.
- Both editors show Popular Progressions inline under the input; typing a chord shows the suggestion grid above it; the whole sheet scrolls.
- ProgressionsTab has no preset buttons.
