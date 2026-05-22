# Chord Explorer — Start screen & Voicing Editor refinements

## a) Audition on the start screen

**Starting Key tile (`ChordExplorer.tsx`, lines 432–443)**
- `changeKey(k)` currently only sets state. Wrap it so picking a key also plays the root chord of that key in the current mode.
- Build the preview chord via `parseChord(k + (mode === "min" ? "m" : ""))`, then `voiceChord(chord)` → `playNotes(pitches, 1)`.
- Same audition fires when the user toggles Maj/Min while a key is selected, so they hear the new tonic.

**Quality picker (`SuggestionPalette.tsx`, lines 95–115)**
- The Major / Minor / Dim buttons currently add + play in one click (already routed through `addStarter` → `playNotes`). Add an explicit pre-listen affordance: tapping the chord name area plays the chord without adding; the existing add behavior stays on the main button.
- Concretely: split each quality tile into a small speaker icon (preview only, calls `playNotes(voiceChord(parseChord(...)))`) and the existing label (adds the chord). Keeps the "audition before commit" feel parallel to the key tile.

## b) Reveal quality only after a key is picked

Today both `ChordExplorer`'s "Starting Key" card AND `SuggestionPalette`'s "Pick a starting note" grid render simultaneously when there are no chords — duplicated note grids.

- Remove the note grid inside `SuggestionPalette` (the `starterNote` flow) for the empty state.
- `SuggestionPalette` empty state becomes: nothing until a key has been chosen, then show "Pick a quality for {keyRoot}" with the three quality buttons (Major / Minor / Dim) using `keyRoot` as the starter note. Pass `keyRoot` in as a prop.
- The `ChordExplorer` Starting Key tile stays as the entry point. Heading copy under it becomes "Pick a quality for {keyRoot}" once a key is highlighted.
- Mode toggle still lives on the Starting Key tile; it no longer needs to live in the quality picker.

```text
Before (empty state)               After (empty state)
┌──────────────────────┐           ┌──────────────────────┐
│ Starting Key  [Maj]  │           │ Starting Key  [Maj]  │
│ C D E F G A B …      │           │ C D E F G A B …  ← D │
├──────────────────────┤           ├──────────────────────┤
│ Pick a starting note │           │ Pick a quality for D │
│ C D E F G A B …      │           │ [D]  [Dm]  [Ddim]    │
│ (then quality row)   │           └──────────────────────┘
└──────────────────────┘
```

## c) Voicing Editor — fixed-width note columns, wider connection lane

In `VoicingEditor.tsx` `SectionPanel` (lines 249–304), the two `VoiceColumn`s share a `grid-cols-2` with a 12px gap, so they consume ~50/50 of the panel width and the SVG connection lines are short.

- Replace `grid-cols-2` with a flex row: left column `flex: 0 0 20%`, right column `flex: 0 0 20%`, middle spacer `flex: 1 1 auto` so the connection lane is ~60% of the panel width.
- The SVG overlay continues to fill the wrapper (already absolute / `inset: 0`); endpoints recompute from row `getBoundingClientRect` so widening the gap automatically lengthens the lines.
- When only one chord exists (`!rightStep`), keep the single column centered (no spacer).

## d) Octave number next to each note

In `VoiceColumn` (lines 60–82, `VoicingEditor.tsx`):
- After computing `name = pcToName(...)`, also compute `octave = Math.floor(pitch / 12) - 1` (MIDI convention, so MIDI 60 → C4).
- Render the octave as a small subscript-style label inside the play button: `{name}<sub>{octave}</sub>` styled with `text-[10px] text-ink-soft ml-0.5 align-baseline`.
- Update `aria-label` to `Play ${name}${octave}`.

## Technical notes

- No new files; edits limited to `src/pages/ChordExplorer.tsx`, `src/components/explorer/SuggestionPalette.tsx`, `src/components/explorer/VoicingEditor.tsx`.
- `SuggestionPalette` props gain `keyRoot` (already imported into the file via context) and lose its internal `starterNote` state. `onAddStarter` signature is unchanged.
- Audition uses existing `playNotes` + `voiceChord(parseChord(...))`; no new audio plumbing.
- Octave math relies on existing MIDI pitch integers in `step.pitches`; no engine changes.
- `npx tsc --noEmit` before commit per project rules; commit and push on `claude/enhance-chord-interface-DqKIg`.
