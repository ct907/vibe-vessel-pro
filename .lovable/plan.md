# SSOT Chord Refactor — Phased Plan

Final contract (locked in with user):
- `Section.chords: SectionChord[]` is the single source of truth for a section.
- Sync invariant = chord **type** (`ChordSymbol`) + **relative order** within `section.chords`. Slot index in lyrics and beat position/length in progression are per-view metadata, free-form, with NO spacing enforcement.
- When a chord is added in the progression view, it also gets a `lyricsPlacement` next to its neighbor's slot (or `slotIndex = 1` if the section has no other chords).
- Existing songs in localStorage will be wiped manually by the user. No migration code.
- Reactivity via Zustand subscription + `useMemo` derivations in tabs.

## Phase 1 — Store SSOT, UI untouched (NEXT TURN)
Goal: introduce `section.chords` as the source of truth in the store. Keep
`line.chords` and `block.chords` as derived mirrors maintained by the store
itself, so the existing UI compiles and runs unchanged.

- Add `SectionChord` type with `lyricsPlacement?` and `progressionPlacement?`.
- Add `chords: SectionChord[]` to every `Section`.
- Helpers:
  - `findSection(state, sectionId)`, `findSectionByLineId`, `findSectionByPatternId`
  - `rederiveSectionMirrors(section, progression)` — rebuilds `line.chords` (as `ChordAnchor[]`) and `block.chords` (as `PatternChord[]`) from `section.chords` + their stored placements. Run at the end of every chord-mutating action.
  - `insertSectionChordAt(section, index, sectionChord)` to keep relative-order insertion explicit.
- Rewrite EVERY chord-mutating action so it:
  1. Mutates `section.chords` (add / remove / reorder / patch placement / patch type).
  2. Calls `rederiveSectionMirrors` to rebuild `line.chords` and `block.chords`.
- Affected actions: placeChordInSlot, upsertChordAt, upsertChordAtWord, appendChordToLine, removeChordAnchor(+Batch), shiftChordAnchors, moveSelectedChordsByOrder, moveChordAnchor, moveSelectedChordsTo, pasteChordsAt, formatChordsInLine(+Song), moveChordWordSlot, moveChordToSlot, moveChordsAcrossLines, addChordToPattern, updatePatternChord, removePatternChord, movePatternChord, removePatternChordsBatch, shiftPatternChords, movePatternChordsTo, setPatternChordLength, resizePatternChordsWithOverflow, reorderPatternChord, movePatternChordToPatternAt, movePatternChordToSlot(+s), addChordToPatternSlot, replacePatternChords, addToBasket-then-place flows.
- Persistence: bump `SerializedSong.version` and store `section.chords` instead of mirroring; on load build mirrors.
- Verify: build passes, lyrics/progressions still display chords correctly, basket→drop still works.

## Phase 2 — LyricsTab reads section.chords directly
- Replace `line.chords` reads with `useMemo(() => section.chords.filter(c => c.lyricsPlacement?.lineId === line.id).sort by slotIndex)`.
- Update FocusedChordEditor.

## Phase 3 — ProgressionsTab reads section.chords directly
- Replace `block.chords` reads with derived selector.
- Update SuggestionsPanel + drag-drop handlers.

## Phase 4 — Cleanup
- Delete `ChordAnchor`, `PatternChord`, `mirrorId`, mirror-rederive code.
- Update `lib/lyrics/export.ts`, `store/playback.ts`.
- Final type pruning + type check + manual smoke.
