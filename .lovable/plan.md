## Goal

In `WhyThisChordSheet`, the "Used in these progressions" examples should be transposed so the focused chord literally appears in the example. Currently they're realized in the song's key (`meta.keyRoot`), so opening `Ddim` in C major shows the Lydian Loop with `Bdim` at the hit position instead of `Ddim`.

## Fix

`src/lib/music/presets.ts` already exports `realizePresetAnchored(preset, anchorRoot, anchorIndex, useFlatHint?)` which transposes a preset so that the chord at `anchorIndex` has root `anchorRoot`. That's exactly what we need.

### `src/components/chords/WhyThisChordSheet.tsx`

1. Add `realizePresetAnchored` to the import from `@/lib/music/presets`.
2. In the `matchingPresets` memo, replace all three `realizePreset(preset, meta.keyRoot, meta.keyMode)` calls with `realizePresetAnchored(preset, chord.root, hit, useFlat)` so each example is transposed to put the focused chord at the matched degree.
3. Leave everything else (tier ordering, dedupe, caps, sub-labels, hit-index highlight) untouched. `nashvilleLadder`-based zero-results fallback also stays as-is — it's about the song key, not the preset.

### Notes

- The `_mode` argument was unused by `realizePreset` anyway, so accidental-spelling (sharp/flat) stays consistent via the existing `useFlat` (derived from `meta.keyRoot`). Anchored realization uses the same flat hint, which keeps the rest of the preset's chord names looking native to the current song key while still pinning the focused chord's root letter to the user's actual chord.
- For Tier 2 ("Also uses [quality]") and Tier 3 ("Borrowed context") matches the anchor will still be the focused chord; the rest of the preset transposes around it. That's the desired behavior — every example shown contains the chord they tapped, spelled the same way.
- Highlight ring on `hitIndex` already targets the right chord, so no further changes there.

## Verification

- `npx tsc --noEmit` passes.
- In C major, open `Ddim` → Lydian Loop now shows `D – E – Ddim – D` (or whichever transposition lands `Ddim` at the `vii°` slot), with the hit chord literally `Ddim`.
- Open plain `A` major in C major → primary matches now show the preset with `A` at the matched degree instead of the C-major realization. (Acceptable per request: the user wants examples centered on the focused chord.)
- Specialist fallback hint still fires for genuinely unmatched chords.
- "Send to Progressions" still inserts the (now anchored) realization into the first pattern block.

## Out of scope

- No preset data changes, no store changes, no other tabs touched.
