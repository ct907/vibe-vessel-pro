# Add relative minor chords to Choose Your Path

## Goal
In the Chord Explorer's "Choose Your Path" suggestions, include chords drawn from the **relative minor of the current key** (or relative major if the key is minor). Placement into Linger / Push / Glide / Drift is decided by the existing voice-leading logic — no new category.

## Where the change lives
Single file: `src/lib/music/explorerEngine.ts`, function `getCandidates`.

Today the candidate pool is built from:
1. Diatonic chords of the current key
2. Diatonic chords of the **parallel** mode (C maj ↔ C min)
3. Secondary dominants of each diatonic chord
4. Chromatic-mediant maj/min triads a 3rd/6th away from the focus

We will add a 5th source: diatonic chords of the **relative** key.

## Relative-key rule
- `maj` key at root R → relative is `min` at root `pc(R) − 3` (e.g. C maj → A min)
- `min` key at root R → relative is `maj` at root `pc(R) + 3` (e.g. A min → C maj)

Use `pcToName(..., keyUsesFlat(keyRoot))` for the relative root so accidentals match the key.

## Implementation sketch
In `getCandidates`, after the parallel-mode loop, add:

```ts
const relRoot = pcToName(
  (rootToPc(keyRoot) + (mode === "maj" ? 9 : 3)) % 12,
  useFlat,
);
const relMode: ExplorerMode = mode === "maj" ? "min" : "maj";
for (const d of diatonicChords(relRoot, relMode)) {
  add(d.chord, false, -1, "");
}
```

Notes:
- `isDiatonic: false` — these aren't in the active key, so the existing categorizer will treat them as `drift` unless their voice-leading score qualifies them for `glide`. That matches "Auto (by voice distance)".
- The `seen` set already de-duplicates anything that overlaps with the current key or parallel mode (natural-minor relative shares most pitch classes, so often only the harmonic-minor V — e.g. E major in A minor — surfaces as new). Harmonic-minor V is produced because `nashvilleLadder` for minor returns a major V; this is the musically interesting addition.
- `inKey` continues to be computed against the active key, so the left-edge tint and ordering stay correct.

## Verification
- `npx tsc --noEmit`
- Manually: in C Major, the palette should start surfacing chords like **E** (V of relative minor) and **A min** family members under Glide / Drift based on voice distance from the focus.
- No UI changes needed; `SuggestionPalette` already renders whatever `getCandidates` returns.

## Out of scope
- No new category, no label changes, no styling changes.
- No change to secondary-dominant logic or chromatic-mediant logic.
