## Goal

In each pattern block, the chart icon (currently a no-op `Activity` button next to the spice button) becomes a toggle that reveals a "VOICE LEADING LINES" panel. The panel shows the chord chips as the baseline and stacks the chord's voicing notes above each chip as differently-shaped markers, with connector lines whose thickness reflects voice-leading smoothness.

## Behavior

1. **Toggle.** Clicking the chart icon flips `voiceLinesOpen` for that block. Icon highlights when open (same active treatment as the Sparkles spice button). Pressing again hides the panel.

2. **Panel placement.** Replaces the current `VoiceLeadingRibbon` slot inside `PatternBlock`. Sits between the chord chip row and the spice panel. Hidden by default; smooth height/opacity transition on open.

3. **Voicing data.** For each chord in the block, derive notes via `chordToMidi(chord, octave)` from `src/lib/music/chords.ts`. Take up to 4 voices, sorted top→bottom. Use these voices: top→bottom shapes are yellow diamond, green pentagon, blue square, red circle (matching screenshot). If a chord has fewer than 4 notes, render only what exists.

4. **Vertical positioning (per requirement #5).**
   - The first chord's voices anchor the layout: each of its 4 voices is placed at a fixed default y (e.g., top=16, pent=40, sq=64, circ=88), giving a clean horizontal baseline.
   - For each subsequent chord, compute each voice's y as `firstChordVoiceY[i] - (midi[i] - firstChordMidi[i]) * 4px`. Higher note = moves up, lower = moves down, 4px per semitone.
   - Compute the min/max y across all voices for all chords (with a small marker radius padding).
   - Set panel height = `clamp(120, maxY - minY + paddingTop + paddingBottom, 280)` px. If content would exceed 280, clamp at 280 (notes may then visually compress at the edges — acceptable per requirement #5).
   - Translate all marker positions so the layout fits inside the clamped height.

5. **Connector lines (per requirement #3).** For each voice index, draw a polyline through that voice's points across chords. Segment-by-segment: if `|midi[i+1] - midi[i]| <= 2` → thick stroke (e.g. 2.5px); else → thin stroke (e.g. 1px). Stroke color matches the marker color for that voice (yellow / green / blue / red).

6. **Horizontal alignment.** Each voicing column is centered above its corresponding chord chip in the row below. Use the same flex track as the chord chip row (mirror widths from `lengthBeats` ratios so columns line up with chips even when chord lengths differ). The panel and chip row share a common width grid.

7. **Label inside panel.** Small "VOICE LEADING LINES" header at the top, matching the screenshot's centered caption styling (uppercase, `--ink-soft`, font-display tracking).

8. **Markers.** SVG shapes filled with their voice color and a thin dark outline matching the screenshot. Shapes:
   - Voice 1 (top): yellow diamond (rotated square)
   - Voice 2: green pentagon
   - Voice 3: blue square (rounded)
   - Voice 4 (bottom): red circle
   Each marker shows the note name (letter + optional accidental) centered, using `font-mono-chord` at ~10px.

## Technical notes

- Edit `src/components/progressions/ProgressionsTab.tsx`:
  - Add `const [voiceLinesOpen, setVoiceLinesOpen] = useState(false)` inside `PatternBlock`.
  - Wire the existing `Activity` button (lines 374–383) to toggle this state, mirroring the spice button's active styling (`color: voiceLinesOpen ? 'var(--primary-strong)' : undefined`).
  - Replace the current `<VoiceLeadingRibbon ... />` usage (lines 878–882) with a new `<VoiceLeadingLinesPanel>` component, gated on `voiceLinesOpen && sortedChords.length >= 1`.
- Create `src/components/progressions/VoiceLeadingLinesPanel.tsx` (replaces the existing `VoiceLeadingRibbon.tsx` usage in this surface — keep the old file untouched in case it's used elsewhere; quick rg shows it's only referenced here, so we can repurpose or delete it; plan keeps it untouched and adds the new component to be safe).
- The new component receives `{ chords: ChordSymbol[]; chipWidths: number[] | null }` (or computes equal columns if widths not provided) and renders the SVG/HTML described above.
- Use `chordToMidi(chord, chord.octave ?? 4)` to compute voicings. Sort each chord's notes descending and slice to top 4.
- Note name display: convert midi → pitch class using `NOTES_SHARP` from `chords.ts`.
- Respect design tokens; marker fills use literal colors from the screenshot (yellow `#E8C547`, green `#9CC27A`, blue `#7FB0D6`, red `#D77A6B`) since they encode voice identity, not theme accent. Outline uses `var(--ink)` at low opacity.

## Out of scope

- No changes to the spice engine, spice preview, or `VoiceLeadingRibbon` original/spiced toggle.
- No persistence of the open/closed state (per-session only).
- No interaction (hover tooltips, click-to-play) on markers.
