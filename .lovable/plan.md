## Add progression suggestions to the Chord detail sheet

Extend the existing `detailChord` Sheet in `src/components/chords/ChordsTab.tsx` with a new "Works well with" section powered by a new helper in `src/lib/music/suggestions.ts`. Preserve the input chord's quality family on suggestions (Cm7 → other m7 suggestions when compatible).

Files touched:
- `src/lib/music/suggestions.ts` (add helper)
- `src/components/chords/ChordsTab.tsx` (extend sheet UI)

No new files. No changes to multi-select/checkbox logic (none exists). Uses the existing `addChordToSong` flow rather than a "basket" (the project has no basket store).

---

### 1. New helper in `src/lib/music/suggestions.ts`

Export `getChordProgressionSuggestions(chord, keyRoot, mode)` returning `ChordSymbol[]` (4–6 chords).

```text
- useFlat = same flat-key detection used in generateProgressionSuggestions
- deg = degreeOf(chord, keyRoot, mode)
- Per-degree successor map (degrees, 0-indexed I=0, ii=1, ...):
    0 (I/i):   [3, 4, 5, 1]      // IV V vi ii
    3 (IV/iv): [0, 4, 1, 6]      // I V ii vii°
    4 (V/v):   [0, 5, 3, 1]      // I vi IV ii
    1 (ii):    [4, 3, 0, 6]
    5 (vi):    [3, 1, 4, 0]
    2 (iii):   [5, 3, 0, 4]
- For each target degree d:
    base = diatonicAt(d, keyRoot, mode, useFlat)
    family = base.quality === "maj" → "maj"
             base.quality === "min" → "min"
             base.quality === "dim" → null (leave base as-is, no family swap)
             base.quality === "7"   → "dom"  (in case future modes produce it)
    if family && FAMILY_MEMBERS[family].includes(chord.quality) → buildChordLike(rootPcOfBase, chord.quality, family, useFlat)
    else → base
- Non-diatonic (deg === -1):
    rootPc = rootToPc(chord.root)
    push tritoneSub(chord, useFlat)
    push secondaryDominantOf(chord, useFlat)  // V7 of the chord
    then walk the 7 diatonic positions sorted by semitone distance from rootPc,
    take the 2 nearest, build via diatonicAt + family inheritance as above
- Dedupe by display, drop the input chord itself, cap at 6.
```

Reuses existing `buildChordLike`, `FAMILY_MEMBERS`, `diatonicAt`, `tritoneSub`, `secondaryDominantOf`, `degreeOf`, `rootToPc`.

### 2. UI changes in `src/components/chords/ChordsTab.tsx`

Inside the existing detail sheet (`detailChord` block), add a new section between the explainer/"Add to song" button and the "Used in these progressions" presets list:

```text
<h3>Works well with</h3>
<div flex-wrap gap-2>
  {suggestions.map(c => <ChordChip chord={c} variant="ink" octave={octave} onClick={() => addChordToSong(c)} />)}
</div>
```

- `suggestions` = `useMemo(() => getChordProgressionSuggestions(detailChord, meta.keyRoot, meta.keyMode), [detailChord, meta.keyRoot, meta.keyMode])`
- `ChordChip` already audits on tap-and-hold and accepts `onClick`; tapping a suggestion calls `addChordToSong(c)` (does not close the sheet, so the user can add several).
- Existing header (coloured via `getChordColorClasses`, large `font-mono-chord` display, quality label) stays as-is. The header chord is already auditioned by the existing `ChordChip` in the grid before opening; no extra play button is added (the project's audition pattern is hold-to-sustain on `ChordChip`, not a dedicated ▷ button).
- Existing "Add to song" amber button for the selected chord remains.
- Existing "Used in these progressions" preset list remains below.

No change to grid click handlers — they already call `setDetailChord(c)` (the sheet trigger), not `playChord`. The user's description of the current behaviour doesn't match the actual code; the audition-on-click claim is outdated.

### 3. Verify

`npx tsc --noEmit`, commit, push to `claude/enhance-chord-interface-DqKIg`.
