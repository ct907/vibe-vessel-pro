# Plan: ChordsTab + Spice modal refinements

## 1. "Works well with" → preview only
In `ChordsTab.tsx` (line ~344), remove the `onClick={() => addChordToSong(c)}` from the `ChordChip`s inside "Works well with". They keep `audition` (default `true`), so tapping previews the sound but does nothing else. No tap target change.

## 2. Playhead on auditioned progression chords
Add a "currently sounding index" highlight to chord chips during preset/spice playback.

- `src/lib/music/audio.ts`: `playProgression` already schedules `ScheduledChord` events with `startBeat`/`lengthBeats`. Extend its options with `onStep?: (index: number | null) => void`, and fire it from a `setTimeout` queue aligned to each event's start (and `null` after the last chord ends or on stop).
- `src/components/chords/ChordsTab.tsx`: add `playingStep` state, pass `onStep` when calling `playProgression` inside `playPreset`. In the chip render (line ~374), add a second className branch like `playingPresetId === preset.id && i === playingStep && "ring-2 ring-primary/80 shadow-[0_0_0_3px_var(--primary-halo)]"`. Clear `playingStep` in `onEnd`/stop.
- `src/components/progressions/SpiceSheet.tsx`: same pattern — `playingStep` per `playingId`, pass `onStep` in `playSuggestion`, apply ring on the chip in `renderCard` (line ~217).

## 3. Spice modal: bigger gap between Play and Apply
`SpiceSheet.tsx`, `renderCard`, the inner action cluster currently `flex items-center gap-1.5` (line ~228). Change to `gap-6` (1.5 → 6, 4× the spacing). Keep the outer `ml-auto`.

## 4. Replace "friction ±N" with songwriter-friendly label
`SpiceSheet.tsx`, line ~205 currently renders `· friction ±X.X`. Map `frictionDelta` to a plain-language descriptor:

- `<= -1.5` → "Smoother voice leading"
- `<= -0.4` → "A bit smoother"
- `>= 1.5` → "Bolder, more movement"
- `>= 0.4` → "A bit edgier"
- else → "Similar feel"

Render the descriptor in the existing small muted span. Drop the numeric value. Add a `title` tooltip explaining "Smoothness of the note movement between chords" for power users.

## 5. Voice-leading overlay: focus toggle (Original ↔ Spiced)
`VoiceLeadingOverlay.tsx`:

- Add a `focus: "original" | "spiced"` state with a small two-button pill toggle rendered in the existing top-right legend area, replacing the current ORIG/SPICE legend swatches.
- Pass opacity via a `focus`-derived multiplier:
  - `focus === "original"`: original markers/lines opacity 1, spiced 0.35 (and rendered first so original sits on top).
  - `focus === "spiced"` (default): current behavior — spiced on top opaque, original faded behind.
- Reorder the SVG render groups based on `focus` so the focused layer paints last. Reuse existing `faded` marker prop; add the same fade to the focused-out line group via `opacity` on the wrapping `<g>`.

No other files needed.

## Verification
- `npx tsc --noEmit`
- Manual: tap chord → Works-well chord plays sound but isn't added; play a preset in ChordsTab and a spice card → orange ring follows each chord; spice card spacing visibly wider; friction text reads as plain language; overlay toggle swaps which layer is in front.
