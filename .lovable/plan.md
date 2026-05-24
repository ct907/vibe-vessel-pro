## What you reported

After applying a spice variation that changes the chord count, pressing Play shows the orange playhead pinned to the start of one of the spice-added chords and no audio plays. This happens on the very first Play after the spice apply as well as on subsequent ones, and only in the Progressions tab.

## Working hypothesis

`handlePlay` in `src/components/header/TransportHeader.tsx` seeds the playhead via `setCurrent(built.meta[0])` and then calls `playProgression(built.events, ...)`. The playhead therefore renders correctly on whatever `buildPlayback` returns first. The fact that the indicator shows up but no sound plays means `playProgression` is being called with events whose start times never enter the lookahead horizon — most likely because of where spice's `addChordToPattern` ends up placing chords.

Key observations from the code:

- `SpiceSheet.commitSuggestion` (for `countChanged` suggestions) calls `removePatternChordsBatch(pattern.id, oldIds)` and then loops `addChordToPattern(pattern.id, withOctave(c, i), cursor, len)`.
- `addChordToPattern` (`src/store/song.ts:2551`) **ignores `atBeat`**. It computes the new chord's `startBeat` from `usedInPattern`, and if `free < 0.5` it overflows the chord into a freshly-spawned continuation pattern via `placeSectionChordInProgression`.
- For an N-chord spice that exceeds the host pattern's beats, spice-added chords end up split across the original pattern and one or more new patterns. `buildPlayback` then walks `sec.chords` in order — but `events[].startBeat` is calculated as `cursorBeat + localOffset + pp.startBeat`, where `cursorBeat` is per-section, and the *new patterns spawned by overflow* are appended to `progression`. If a new pattern lands in a different section group than the loop expects, its `localOffset` may be inconsistent with the order of `sec.chords`, producing events with non-monotonic or negative `startBeat` after a rotation, or a single chord whose `startBeat` is huge relative to `loopBeats`.
- The scheduler in `audio.ts` advances `schedNextIdx` strictly forward and only schedules events whose `eventAt < horizon`. If `events[0].startBeat` is far beyond the loop, nothing ever gets queued; the seeded playhead remains visually pinned to `meta[0]` and no voices spawn — matching the reported symptom exactly.

## Investigation steps

1. **Reproduce in browser tools.** Load the preview, add ~4 chords, open Spice on a pattern, apply a count-changing suggestion (e.g. a `cinematic` or `step_between` one that produces more chords than the source). Hit Play. Confirm symptom.
2. **Dump scheduler input.** Temporarily add a `console.log(built.events, built.loopBeats)` in `handlePlay` just before `playProgression(...)` is called. Check:
   - Are all `startBeat` values inside `[0, loopBeats)`?
   - Do they sort monotonically?
   - Is the pattern referenced by `meta[0].patternId` actually rendered?
3. **Cross-check `addChordToPattern` overflow.** Log `placement.sectionChord.progressionPlacement` whenever the `free < 0.5` branch fires; verify spice-added chords aren't silently being shoved into a continuation block with `startBeat` reset to 0 in a *new* pattern block that buildPlayback then orders unexpectedly.
4. **Confirm root cause** and choose the smallest fix:
   - **Option A (most likely fix):** in `commitSuggestion` for `countChanged`, resize/grow the host pattern's `bars` so the spice-added chords always fit instead of spilling into continuation blocks. Use the sum of `durations` to compute required bars rounded up to `beatsPerBar`.
   - **Option B:** make `addChordToPattern` honour the supplied `atBeat` when called inside a single transactional spice apply so chords land at predictable beats, then fix `buildPlayback` ordering if needed.
   - **Option C:** if buildPlayback is the actual problem (rotation across overflow patterns), patch the ordering there.

## Deliverable

- Reproduce the bug and identify which of A/B/C matches.
- Implement the minimum fix.
- Verify: apply a count-changing spice on a 4-chord block, press Play, expect audible chords with the playhead advancing through all of them.
- Run `npx tsc --noEmit`.

## Out of scope

- No design changes to the Spice sheet UI.
- No changes to the global playback store shape.
- No changes to the chord detail sheet work from earlier turns.
