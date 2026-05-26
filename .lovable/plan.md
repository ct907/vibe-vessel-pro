## Conditionally hide Popular Progressions in chord editors

The Popular Progressions list (`PresetList`) currently always renders inside both `ChordPickerSheet` and `FocusedChordEditor`. We want it shown only when the user is adding a chord into an empty space, and hidden when they're editing an existing chord.

### Context distinction
- **Editing existing chord** → `ChordPickerSheet` is opened with `initialChord` set; `FocusedChordEditor` is opened with `mode="progression"` (has `chordId`) or with `initialAnchorId` set (lyrics mode).
- **Adding to empty slot** → `ChordPickerSheet` opened with no `initialChord`; `FocusedChordEditor` opened with `mode="progression-add"` (has `atBeat`) or without `initialAnchorId` (lyrics mode).

### Changes

1. **`src/components/chord/ChordPickerSheet.tsx`**
   - Around line 360–362, wrap the `<PresetList />` block in `{!initialChord && (...)}` so presets only render when no chord is being replaced.

2. **`src/components/lyrics/FocusedChordEditor.tsx`**
   - Around line 674–676, compute `const showPresets = isProgressionAdd || (props.mode !== "progression" && !anchorId);` and wrap the `<PresetList />` block (plus its separator container) in `{showPresets && (...)}`.

### Verification
- `npx tsc --noEmit`
- Progressions tab: tap empty space in pattern → editor shows Popular Progressions. Tap existing chord → editor hides Popular Progressions.
- Lyrics tab (mobile): tap empty chord slot → presets visible. Tap existing chord chip → presets hidden. Desktop ChordPickerSheet behaves the same way.
