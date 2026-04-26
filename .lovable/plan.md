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

## Phase 2 (DONE) — LyricsTab reads section.chords
- Added `getLineChordsViaSSOT(section, lineId)` selector in `store/song.ts` that returns ChordAnchor[] in SSOT order (using `section.chords` projection, falling back to raw line.chords if SSOT empty).
- `LyricsTab.LineRow` now derives `lineChords` via the selector and uses it everywhere (`chordsBySlot`, selection, clipboard, drag, render). `line.chords` is no longer read by the renderer (the legacy field still exists as the authoritative mirror that the projection is rebuilt from).
- `FocusedChordEditor` seeds initial query from the SSOT-derived list.
- `SectionCard.handleMergeUp` still reads `line.chords.length` for an emptiness check — kept as-is since it's a structural mirror question, not a render decision.

## Phase 3 (DONE) — ProgressionsTab reads section.chords
- Added `getPatternChordsViaSSOT(section, pattern)` selector in `store/song.ts` that returns PatternChord[] in SSOT order (using `section.chords` projection, falling back to beat-sorted pattern.chords).
- `ProgressionsTab.PatternBlock` now derives `sortedChords` via the selector (looking up the owner section from store via `pattern.sectionId ?? pattern.id`). The renderer + selection + drag-drop all flow from this SSOT-ordered list.
- `SuggestionsPanel.sortedChords` left as-is (beat sort is used for suggestion math, not display ordering of existing chords).
- Cross-pattern move helpers still read raw `pattern.chords` for beat capacity math — that's a structural mirror question, not a render decision.

## Phase 4a (DONE) — Read-side cleanup using SSOT
- `lib/lyrics/export.ts` rewritten to render chord rows directly from `section.chords` (SSOT) using `lyricsPlacement.slotIndex`. No more dependency on legacy `chordCol`/`offset`/`chordRowLen` per-anchor fields for export.
- `playback.ts` left untouched: its `mirrorId` field already equals the anchor id (== SectionChord id from the projection), so highlight selectors in LyricsTab/ProgressionsTab continue to work unchanged.
- Mirrors (`line.chords`, `pattern.chords`, `mirrorId`) remain authoritative writers — store actions are unchanged.

## Phase 4b — Invert flow + delete legacy types (sliced over 4 turns)

Strategy: section.chords becomes the authoritative writer. After each batch of actions is migrated, `line.chords` / `pattern.chords` are *derived* from `section.chords` by a new helper `deriveMirrorsFromSectionChords(section)`. Mirrors stay on the type until the very end so unmigrated actions keep working.

### 4b.1 — Foundation (PARTIAL — foundation landed, action migration deferred)
- ✅ Added `deriveMirrorsFromSectionChords(section, sectionPatterns)` in `store/song.ts` that rebuilds `line.chords` + each pattern's `chords` from `section.chords`.
- ✅ Added `syncMirrorsFromAllSectionChords(sections, progression)` to apply across the whole song.
- ✅ Added `SSOT_MODE` marker on partial state updates. Wrapped `set` checks for it: when present, treats `section.chords` as authoritative and rebuilds mirrors; when absent, defaults to refreshing `section.chords` from mirrors (legacy mirror-first flow).
- ⏸ DEFERRED: rewriting individual chord-mutating actions to be SSOT-first.

#### Why action migration was deferred
Two real behavioral semantics live in the existing mirror-first actions that the naive `deriveMirrorsFromSectionChords` does NOT replicate:
1. **Continuation-block spawning**: `placeMirroredChord` creates a brand-new pattern block in a section if no existing block has room. My derive helper just clamps/drops chords that don't fit. Migrating `placeChordInSlot` (and friends) to SSOT-first without porting this logic would silently lose chords on full patterns.
2. **Overflow cascade across pattern blocks**: `resizePatternChordsWithOverflow` pushes chords into the next pattern block when a resize exceeds capacity. SSOT-first would have to encode this cascade in the action itself before calling set.

Both are solvable but each adds 30–60 lines of careful logic per migrated action. Doing all 8 simple actions correctly is a full focused turn on its own; doing all 30+ actions across all 4 batches is multiple focused sessions with manual smoke between each.

#### Current state assessment
The infrastructure for SSOT-first mutations is in place. Future SSOT-first writes can use the `SSOT_MODE` marker. The existing UI continues to work via the mirror-first path. **Phase 4b can be resumed action-by-action incrementally as the need arises** (e.g., when adding a new chord-touching feature, write that action SSOT-first instead of mirror-first).

### 4b.2 — Medium actions
- Migrate: `upsertChordAt`, `upsertChordAtWord`, `moveChordToSlot`, `moveChordWordSlot`, `shiftChordAnchors`, `moveSelectedChordsByOrder`, `moveChordAnchor`, `moveSelectedChordsTo`, `addChordToPattern`, `updatePatternChord`, `movePatternChord`, `setPatternChordLength`, `shiftPatternChords`, `reorderPatternChord`, `movePatternChordToSlot`, `movePatternChordsToSlot`.
- Verify: build + chord row tap-to-add, slot reorder in both views, length change in progression.

### 4b.3 — Complex actions
- Migrate: `formatChordsInLine`, `formatChordsInSong`, `pasteChordsAt`, `resizePatternChordsWithOverflow`, `moveChordsAcrossLines`, `movePatternChordsTo`, `movePatternChordToPatternAt`, `insertChordSpaceAt`, `removeChordCellAt`.
- Verify: build + Format Chords button, paste chord text, resize chord that overflows next pattern, drag chord between lines/patterns.

### 4b.4 — Type cleanup + final
- Delete `mirrorId` field from `ChordAnchor` and `PatternChord` (no longer needed — pairing is implicit via SectionChord.id).
- OR fully delete `ChordAnchor` / `PatternChord` if mirrors are no longer needed at runtime (they may still be useful as the rendering shape — decide at this point).
- Update `playback.ts` to use `sectionChordId` instead of `mirrorId`.
- Bump `SerializedSong.version` to 4 (section.chords is now authoritative; mirrors omitted from JSON or kept as cache).
- Final type prune + smoke pass across all chord interactions.
