# SSOT Chord Refactor — Phased Plan

Final contract (locked in with user):
- `Section.chords: SectionChord[]` is the single source of truth for a section.
- Sync invariant = chord **type** (`ChordSymbol`) + **relative order** within `section.chords`.
- Slot index in lyrics and beat position/length in progression are per-view metadata, free-form, with NO spacing enforcement.
- When a chord is added in the progression view, it also gets a `lyricsPlacement` next to its neighbor's slot (or `slotIndex = 1` if section has no other chords).
- Existing songs in localStorage will be wiped manually by the user. No migration code.

## Phase 1 (CURRENT) — Introduce SSOT projection, keep mirrors authoritative
Lower-risk variant: rather than rewriting every chord-mutating action to write
to `section.chords` first, we add `section.chords` as a **derived projection**
that is recomputed AFTER every chord-touching mutation by a single helper
(`recomputeSectionChordsFromMirrors`). The existing line/pattern mirrors stay
authoritative for now; UI keeps working unchanged.

This phase establishes the new type, the projection, and the persistence
shape. Phases 2–3 then switch UI reads to `section.chords`. Phase 4 inverts
the flow (mutations write SectionChord first, mirrors become derived).

Scope:
- Add `SectionChord { id, chord, lyricsPlacement?: { lineId, slotIndex }, progressionPlacement?: { patternId, startBeat, lengthBeats } }`.
- Add `Section.chords: SectionChord[]`.
- Add `recomputeSectionChordsFromMirrors(section, sectionPatterns)` that:
  * walks `section.lines[*].chords` and `progression.filter(p=>p.sectionId===section.id)[*].chords`,
  * pairs them by `mirrorId` (if present),
  * emits one `SectionChord` per anchor, attaching the matching pattern chord's placement when paired,
  * then appends any pattern chords with no mirroring anchor as their own SectionChord (progression-only).
- Wrap the zustand `set` so that any state update that touches `sections` or `progression` re-runs the projection across all sections.
- Bump `SerializedSong.version` to 3, persist `section.chords`. On load (v3) trust mirrors, recompute projection. On v2 load, recompute projection from existing mirrors. (No legacy data path needs to honor SectionChord directly yet.)

## Phase 2 — LyricsTab reads section.chords
- Replace `line.chords` reads with `useMemo(() => section.chords.filter(c => c.lyricsPlacement?.lineId === line.id).sort by slotIndex)`.
- Update FocusedChordEditor.

## Phase 3 — ProgressionsTab reads section.chords
- Replace `block.chords` reads with derived selector.
- Update SuggestionsPanel + drag-drop handlers.

## Phase 4 — Invert flow + cleanup
- Rewrite chord-mutating actions to mutate `section.chords` first, then rederive `line.chords` / `block.chords`.
- Delete `ChordAnchor`, `PatternChord`, `mirrorId`, mirror-rederive helpers.
- Update `lib/lyrics/export.ts`, `store/playback.ts`.
- Final type pruning + type check + manual smoke.
