## Fix: Substitute tapped chord quality into matching preset slots

In the chord detail sheet's "Used in these progressions" section, preset chords are currently rendered with base diatonic qualities from `realizePreset`. When the tapped chord's root matches a slot, that slot should show the exact tapped chord (preserving its full quality, e.g. Cm7 instead of Cm).

### Change

In `src/components/chords/ChordsTab.tsx`, in the `matchingPresets` `useMemo` (line ~97-111):

Replace:
```ts
const chords = realizePreset(preset, meta.keyRoot, meta.keyMode);
```

With:
```ts
const tappedPc = rootToPc(detailChord.root);
const chords = realizePreset(preset, meta.keyRoot, meta.keyMode).map((c) =>
  rootToPc(c.root) === tappedPc ? detailChord : c
);
```

`rootToPc` is already imported. This single substitution propagates to all three consumers of the `chords` array inside the render loop: chord chip display, Play button, and Send to Progressions button.

### Verification

Run `npx tsc --noEmit` before committing. No changes to `realizePreset`, `presets.ts`, or `suggestions.ts`.