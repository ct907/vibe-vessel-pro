## Spread tapped chord's quality family across preset slots

In `src/components/chords/ChordsTab.tsx`, extend the substitution in the `matchingPresets` useMemo so every diatonic chord in the realized preset that shares the tapped chord's quality family gets upgraded to that quality. Other-family slots (e.g. dominant V when tapped is minor) stay as base.

### Changes

1. Extend the existing import from `@/lib/music/chords` to also pull in `QUALITY_FAMILY` and `QUALITY_PRETTY` (both already exported):

```ts
import { ..., QUALITY_FAMILY, QUALITY_PRETTY, rootToPc } from "@/lib/music/chords";
```

2. Add a local helper above the component:

```ts
function applyFamilyQuality(c: ChordSymbol, tapped: ChordSymbol): ChordSymbol {
  if (rootToPc(c.root) === rootToPc(tapped.root)) return tapped;
  if (QUALITY_FAMILY[c.quality] === QUALITY_FAMILY[tapped.quality]) {
    return {
      ...c,
      quality: tapped.quality,
      display: c.root + QUALITY_PRETTY[tapped.quality],
    };
  }
  return c;
}
```

3. In the `matchingPresets` useMemo, replace the current `.map(...)` line with:

```ts
const chords = realizePreset(preset, meta.keyRoot, meta.keyMode).map((c) =>
  applyFamilyQuality(c, detailChord),
);
```

The `chords` array is already the single source rendered into the chips, passed to `playPreset` (which calls `playProgression`), and sent via `sendPresetToProgressions` — so all three consumers automatically receive the upgraded qualities.

### Verification

- `npx tsc --noEmit`
- Spot-check examples from the brief: `Em11` in ii–V–I–vi (E major) → `F#m11 – B – Em11 – C#m11`; `G7b9` → other dominant slots become `7b9`, non-dominant unchanged.

No changes to `chords.ts`, `presets.ts`, `suggestions.ts`, or any other file.
