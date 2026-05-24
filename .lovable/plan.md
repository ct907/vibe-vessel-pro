## Root cause

`duplicateSection` in `src/store/song.ts` rebuilds the new section's lyric lines but throws away two pieces of state that the chord-row layout depends on:

```text
src/store/song.ts:1372
  const newLines: LyricLine[] = src.lines.map((l) => ({
    id: nanoid(),
    text: l.text,
    chords: l.chords.map((a) => ({
      id: newAnchorId,
      offset: a.offset,        // copied
      chord: a.chord,          // copied
      mirrorId: undefined,     // re-linked later
      // slotIndex, wordIndex, chordCol — DROPPED
    })),
    // _isChordOverflow — DROPPED
  }));
  const newSection = { …, chords: [] };
```

The wrapped `set` then runs `refreshAllSectionChords` → `recomputeSectionChordsFromMirrors`, whose only slot fallback is `slotIndex: a.slotIndex ?? 0`. With `slotIndex` missing on every cloned anchor, all SectionChords in the duplicate collapse to `lyricsPlacement.slotIndex = 0` on whichever line they were copied to. That is exactly what the user sees in step 3 — chords stacked with no spacing between pairs.

When the user then taps Format Chords, `formatChordsInSong` calls `formatChordsAndLyrics` for every section. For the duplicate it sees:
- 4 SectionChords all at `slotIndex: 0`.
- Plus any line that was an `_isChordOverflow` row in the source now appears as a regular (text-empty) lyric line, because the flag wasn't copied. The formatter's "drop pre-existing overflow rows" pass in `chordLayout.ts` (`if (l._isChordOverflow) return`) doesn't kick in, so the row survives as a normal line carrying its own anchors. After autoLayout repacks them, that line renders as the "extra row of the same chord progression" reported in step 5.

So both symptoms trace back to the same lossy clone in `duplicateSection`.

## Fix

Preserve the dropped fields when duplicating a section. Minimal change, no API/shape changes:

1. In `src/store/song.ts` `duplicateSection` (lines 1372–1388):
   - Copy `_isChordOverflow` on each cloned `LyricLine`.
   - Copy `slotIndex`, `wordIndex`, `chordCol` on each cloned `ChordAnchor` (alongside `offset`, `chord`, `mirrorId`).

That's enough to make `recomputeSectionChordsFromMirrors` reproduce the source's `lyricsPlacement.slotIndex` faithfully, which:
- restores the original spacing in the duplicated section's chord row (fixes step 3), and
- ensures Format Chords doesn't see ex-overflow rows as fresh content, so no phantom row is spawned (fixes step 5).

No changes needed to `formatChordsAndLyrics`, `recomputeSectionChordsFromMirrors`, or the wrapped setter — they already do the right thing once the cloned anchors carry their slot info.

## Verification

- `npx tsc --noEmit`.
- Manual repro of the exact steps in the report:
  1. Add a 4-chord progression in LyricsTab via FocusedChordEditor.
  2. Duplicate the section — chord row in the copy should have the same spacing as the original.
  3. Press Format Chords — duplicated section's chord row stays a single row (or splits only when total width genuinely exceeds the viewport, matching the original section's behavior).

## Out of scope

- No changes to FocusedChordEditor, formatter, or progression code.
- No design or UI tweaks.
- Earlier playback / spice work untouched.
