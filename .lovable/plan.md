## Goal

Fix `WhyThisChordSheet`'s "Used in these progressions" section so chords like `Am7b5`, `Adim7`, `Aaug` find relevant presets. The current matcher realizes presets in `meta.keyRoot` and does literal name equality, which fails for non-diatonic qualities. Replace it with a three-tier functional matcher and add 4 new presets that feature non-diatonic qualities.

## Files to change

1. `src/lib/music/presets.ts` — append 4 new entries to `PROGRESSION_PRESETS` (not `QUALITY_PROGRESSION_PRESETS`, since `WhyThisChordSheet` reads `PROGRESSION_PRESETS`).
2. `src/components/chords/WhyThisChordSheet.tsx` — replace the `matchingPresets` memo with a three-tier matcher and add a zero-results hint section.

## New presets

Each follows the existing `ProgressionPreset` shape (interval-based degrees, with `interval` measured from key root). Minor-key presets use minor intervals; Lydian preset uses lydian intervals.

1. `descending-minor-line-cliche` — "Descending minor line cliché", `i – i(maj7) – i7 – i6`, tag "Cinematic" (yearning, descending). Degrees: `{0,min}, {0,minMaj7}, {0,min7}, {0,min6}`. (Same shape as existing `bond-line-cliche` but added to the main list.) — We'll skip if duplicate; instead use the spec's exact wording and add as a new entry to `PROGRESSION_PRESETS` so the main matcher finds it.
2. `half-diminished-bridge` — "Half-diminished bridge", `iiø7 – V7 – i – ♭VII`, tag "Jazz". Degrees (minor key): `{2,m7b5}, {7,7}, {0,min}, {10,maj}`.
3. `neapolitan-cadence` — "Neapolitan cadence", `♭II – V – i`, tag "Classical". Degrees: `{1,maj}, {7,maj}, {0,min}`.
4. `lydian-loop` — "Lydian loop", `I – II – vii° – I`, tag "Cinematic". Degrees: `{0,maj}, {2,maj}, {11,dim}, {0,maj}`.

(Spec says "vii"; in Lydian the vii is diminished. We'll use `dim` to be musically correct.)

## Matcher rewrite (three tiers, capped at 3 total)

For the focused `chord`, compute:
- `focusedQuality = chord.quality`
- `focusedDegree = (rootToPc(chord.root) - rootToPc(meta.keyRoot) + 12) % 12`
- `songKeyPc = rootToPc(meta.keyRoot)`

### Tier 1 — Primary (quality + degree match across 12 transpositions)

For each preset, for each transposition `t` in `0..11`:
- Build the realized chord list with key pc = `t`.
- Find any index `i` where `preset.degrees[i].quality === focusedQuality` AND `preset.degrees[i].interval === focusedDegree`.
- If found, the realized chord at `i` has root pc `(t + focusedDegree) % 12`. For the match to produce a chord whose root equals `chord.root`, we need `t = (rootToPc(chord.root) - focusedDegree + 12) % 12 = songKeyPc`. So primary matching is effectively: does the preset, in `meta.keyRoot`, contain a chord with this exact quality at this exact degree? That's the cleanest reading and avoids spamming 12 transposed copies of the same preset.
- Record `{ preset, chords: realizePreset(preset, meta.keyRoot, meta.keyMode), hitIndex: i }`.

### Tier 2 — Secondary (quality-only, anywhere)

If Tier 1 has fewer than 2 results, scan presets for any degree with `quality === focusedQuality` (any degree). Realize in `meta.keyRoot`; pick `hitIndex` as that degree. Label `matchKind: "secondary"`, rendered as section header per-card: "Also uses [QUALITY_LABEL]".

### Tier 3 — Borrowed (parallel-mode aware)

If still under 3 results, call `findParallelModesContaining(focusedDegree, focusedQuality)` (excluding `meta.keyMode`). For each returned mode, scan presets whose `degrees[i].quality === focusedQuality` at that same `focusedDegree` (interpreted in that mode). Realize in `meta.keyRoot` using that mode's flat-spelling rule. Label `matchKind: "borrowed"`, header: "Borrowed context — [mode name]".

Implementation: each result carries `{ preset, chords, hitIndex, matchKind: "primary" | "secondary" | "borrowed", subLabel?: string }`. Dedupe by `preset.id`. Cap to 3, fill in priority order.

### Rendering changes

The "Used in these progressions" section becomes a list where each card optionally shows a small caption above the preset name:
- `primary` → no caption (current behavior).
- `secondary` → caption "Also uses [quality label]".
- `borrowed` → caption "Borrowed context — [mode name]".

Highlight ring on `hitIndex` chord is already implemented; keep it.

### Zero-results hint

When all three tiers return zero, render a one-line hint instead of hiding the section:

```
[chord.display] is a specialist chord — try it as a passing chord between [prev] and [next].
```

Compute `prev`/`next` from `nashvilleLadder(meta.keyRoot, meta.keyMode)` by picking the two diatonic chords whose roots are closest in pitch class to `chord.root` (one below, one above by semitone distance). Render inside the same section using the existing card surface.

## Verification

- `npx tsc --noEmit` passes.
- Tap `Am7b5` in C major (Chords tab) → at least 1 result (half-diminished bridge in A minor key would be primary, but song key is C major so it'll likely hit via Tier 3 borrowed; if no primary in C major, Tier 2 picks up `minor-ii-v-i` since that preset has `m7b5` at degree 2). Either way ≥1 card renders.
- Tap `Adim7` in C major → at least 1 result (likely Tier 2/3 from `chromatic-passing-dim` or `dim-turnaround`).
- Tap plain `A` major in C major → primary tier still returns the same set as before (no regression).
- Tap `Aaug` in C major → all three tiers empty, hint renders.
- "Send to Progressions" path is unchanged and still works.

## Out of scope

- No store changes, no new modes file changes, no Progressions/Lyrics tab edits.
- `QUALITY_PROGRESSION_PRESETS` is not touched.
