## Preserve extended chord qualities in `generateProgressionSuggestions`

Edit only `src/lib/music/suggestions.ts`. No UI or other file changes.

### 1. Add quality-family helper

Near the top (after the `QUALITY_PRETTY` map), add:

```ts
type QualityFamily = "maj" | "min" | "dom";

const FAMILY_MEMBERS: Record<QualityFamily, Quality[]> = {
  maj: ["maj", "maj7", "maj9", "maj11", "maj13", "6", "6/9", "add9", "add11"],
  min: ["min", "min7", "min9", "min11", "min13", "min6", "minMaj7"],
  dom: ["7", "9", "7alt", "7#5", "7b9", "7#9"],
};

const FAMILY_BASE: Record<QualityFamily, Quality> = {
  maj: "maj",
  min: "min",
  dom: "7",
};

function buildChordLike(
  rootPc: number,
  sourceQuality: Quality,
  targetFamily: QualityFamily,
  useFlat: boolean,
): ChordSymbol {
  const quality = FAMILY_MEMBERS[targetFamily].includes(sourceQuality)
    ? sourceQuality
    : FAMILY_BASE[targetFamily];
  const root = pcToName(rootPc, useFlat);
  return { root, quality, display: root + QUALITY_PRETTY[quality] };
}
```

### 2. Use it in the substitution rules

- **`relativeSwap(c, useFlat)`**:
  - When source family is maj (members of `FAMILY_MEMBERS.maj`), return `buildChordLike((pc+9)%12, c.quality, "min", useFlat)`.
  - When source family is min, return `buildChordLike((pc+3)%12, c.quality, "maj", useFlat)`.
  - Otherwise return null (unchanged).
  - Update the gating from `c.quality === "maj" | "min"` to family membership so e.g. `Cmaj7` and `Am9` get swapped too.

- **`tritoneSub(c, useFlat)`**: replace with `buildChordLike((rootToPc(c.root)+6)%12, c.quality, "dom", useFlat)`. Caller in rule 3 already ensures a dominant context; if the source is a plain `V` triad it was promoted to `"7"` before calling, so `buildChordLike` preserves that.

- **Rule 3 (tritone sub) promotion step**: where it currently builds `dom = { ...c, quality: "7", display: ... }` for a non-dominant `V`, keep that as-is (the goal is `V → V7 → tritone sub`, no extension to inherit).

- **`secondaryDominantOf`**: unchanged — always fresh `"7"`.

- **`diatonicAt` (IV↔ii rule, deceptive cadence, modal interchange)**: unchanged — these are scale-derived, no source extension to carry.

### 3. Verify

Run `npx tsc --noEmit`. No tests to update (no existing tests cover this behaviour). Commit + push to `claude/enhance-chord-interface-DqKIg`.

### Notes

- `dim`, `aug`, `sus2`, `sus4`, `5`, `dim7`, `m7b5` are intentionally absent from all three families, so `relativeSwap` returns null for them (matches today's behaviour) and `tritoneSub` falls back to plain `"7"`.
- `Quality` type and `QUALITY_PRETTY` already cover every member listed above — no new types needed.
