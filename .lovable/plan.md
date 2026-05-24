# Quality-aware "Used in these progressions"

## Problem
In ChordsTab → chord detail sheet → "Used in these progressions", the same three generic presets (Jazz Turnaround, Deep Pop Canyon, Cinematic Drift, etc.) are surfaced for every chord. They're picked by matching the chord's *root interval* against the preset's degrees, then `applyFamilyQuality` swaps that one slot to the tapped chord's quality family.

This is misleading for richer qualities. A `CmMaj7`, `Cdim7`, `Cm7b5`, `C7alt`, `Csus4`, `C6/9`, etc. has idiomatic contexts (Bond/Bossa, ii–V–I, backdoor, minor-line cliché, modal vamp) that the current generic pool can't express. Currently we just force a quality onto a slot that wasn't written for it.

## Goal
Show progressions that actually *feature* the tapped chord's quality in its idiomatic role — different preset lists for different chord qualities, while keeping the generic triad/7th catalog as a fallback.

## Approach

### 1. Tag presets with the qualities they showcase
Extend `ProgressionPreset` in `src/lib/music/presets.ts`:

```ts
export interface ProgressionPreset {
  id: string;
  name: string;
  formula: string;
  tag: string;
  degrees: PresetDegree[];
  // NEW: which qualities this progression is idiomatic for,
  // and which degree slot is the "feature" chord
  featuredQualities?: Quality[];
  featureIndex?: number; // defaults to first slot matching featuredQualities
}
```

Existing presets stay (treated as generic triadic/diatonic). Add a new set of quality-specific presets, e.g.:

- **minMaj7** — "James Bond Line Cliché" (i – i(maj7) – i7 – i6), "Bond Minor Plagal" (i(maj7) – iv – i)
- **m7b5 / ø** — "ii°–V–i" (iiø7 – V7♭9 – i), "Half-Dim Approach" (vii ø7 – iii7 – vi)
- **dim7** — "Chromatic Passing" (I – #i°7 – ii7 – V7), "Diminished Turnaround"
- **7 (dominant)** — "ii–V–I" (ii7 – V7 – Imaj7), "Backdoor ii–V" (iv7 – ♭VII7 – Imaj7), "Blues Turnaround" (I7 – VI7 – ii7 – V7)
- **7alt / 7♭9 / 7#9 / 7#5** — "Altered V→i" (iiø7 – V7alt – i(maj7)), "Hendrix" (I7#9 – IV7 – ♭III7)
- **maj7** — "Jazz I–vi–ii–V" (Imaj7 – vi7 – ii7 – V7), "Bossa I–IV" (Imaj7 – IVmaj7)
- **min7** — "Modal Vamp" (i7 – ♭VII – IV), "Smooth ii–V–i" (i7 – iv7 – ♭VII7 – ♭IIImaj7)
- **maj9 / maj13 / 6/9** — "Lush Bossa" (Imaj9 – IV6/9 – iimin9 – V13), "Mellow Loop"
- **sus2 / sus4** — "Sus Suspension" (Vsus4 – V – I), "Open Drone" (Isus2 – V – Isus4 – I)
- **min9 / min11 / min13** — "Neo-Soul Loop" (imin9 – iv11 – ♭VIImaj7 – ♭VImaj7)
- **add9 / add11** — "Modern Pop Loop"
- **aug** — "Whole-Tone Rise" (I – I+ – I6 – I7), "Augmented Bridge"
- **5 (power)** — "Power Rock" (I5 – ♭VII5 – IV5), "Punk I–IV–V"

Each entry carries `featuredQualities` so it only surfaces for the right chord types, and `featureIndex` so the highlight ring lands on the slot that motivates the picking.

### 2. Selection logic in `ChordsTab.matchingPresets`
Rewrite the `useMemo`:

1. Collect presets whose `featuredQualities` includes `detailChord.quality`. For each, use `featureIndex` (or default to first matching slot) as the hit, transpose so that featured degree's root equals `detailChord.root` (rather than always anchoring to `keyRoot`), and realize all other degrees relative to that anchor.
2. If fewer than 3 quality-specific matches, fall back to today's interval-match behavior over the generic presets to top up.
3. Drop `applyFamilyQuality` swapping for quality-specific picks — they already place the correct quality at the right slot.

Add a small helper `realizePresetAnchored(preset, anchorRoot, anchorIndex, useFlat)` in `presets.ts`.

### 3. UI
No layout change in `ChordsTab.tsx`. Just consume the new `matchingPresets` shape (same `{ preset, chords, hitIndex }`). The "Send to Progressions" and Play buttons keep working unchanged.

### 4. Out of scope
- No store / playback changes.
- No new tests beyond keeping `npx tsc --noEmit` clean.

## Files to edit
- `src/lib/music/presets.ts` — extend type, add quality-tagged presets, add anchored realize helper.
- `src/components/chords/ChordsTab.tsx` — rewrite `matchingPresets` selection; drop forced family swap for quality picks.

## Verification
- `npx tsc --noEmit`
- Manual: tap C, Cmaj7, Cm7b5, Cdim7, C7alt, Csus4, Cadd9, C5 — confirm each shows progressions idiomatic to its quality, with the tapped chord highlighted in its real slot.
