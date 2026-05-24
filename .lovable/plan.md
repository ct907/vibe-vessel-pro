## Scope

Three files: `src/components/progressions/ProgressionsTab.tsx`, `src/components/lyrics/LyricsTab.tsx`, `src/components/lyrics/FocusedChordEditor.tsx`. No store changes.

## 1. ProgressionsTab — clean up section options menu

In the section options dropdown (`SectionGroup`, around lines 1022–1073):
- Remove the **Copy chords** `DropdownMenuItem`.
- Remove the **Paste chords** `DropdownMenuItem`.
- Drop the now-unused `parseChordTextStrict` import and `replacePatternChords` from the destructured store call if no longer referenced.

## 2. ProgressionsTab — remove section expand/collapse button

Remove the chevron toggle around lines 1140–1147 (the `<button>` that calls `updateSection(sectionId, { collapsed: !collapsed })`). Section bodies always render expanded. Keep the `collapsed` field intact in the store (still used by sort mode + the global "Collapse all" header button); just stop rendering the per-section toggle and the `{collapsed && …}` mini-preview block (lines ~1153–1166). The `{!collapsed && (` wrapper around the body becomes unconditional.

## 3. ProgressionsTab — beat selector becomes typing input with steppers

Replace the `<Select>` in the block header (lines 287–306) with an inline group:

```text
[ − ] [  16  ] / 16 beats · 4 bars   [ + ]
```

- Editable number input (`Input type="text" inputMode="numeric"`, similar to the existing `BarsInput` helper) bound to `totalBeats`. Commit on change/blur via `updatePattern(pattern.id, { bars: Math.max(1, Math.round(value / pattern.beatsPerBar)) })`.
- `−` / `+` buttons step by `pattern.beatsPerBar` (one bar at a time), clamped to ≥ `pattern.beatsPerBar`.
- Static suffix label: `/ {totalBeats} beats · {pattern.bars} bar(s)` using `·` (U+00B7) as separator.
- Show the `usedBeats` count as the existing `{formatBeats(usedBeats)} /` prefix before the input.

## 4. FocusedChordEditor — progression preview becomes scrollable chord row

In the `isProgression && progChord` branch (lines ~426–445), replace the single "Current chord" chip with a preview row matching the lyrics preview (lines 365–423):

- Build `progSortedChords = getPatternChordsViaSSOT(ownerSection, progPattern)` (or reuse the same SSOT helper already imported in this file; if not imported, import from `@/store/song`).
- Render a horizontally-scrolling `flex` row of compact chord tiles (one per chord, no empty slot tiles — chords are contiguous in pattern SSOT order). Each tile shows `toSounding(c.chord).display` in `font-mono-chord`.
- Highlight the tile whose `id === props.chordId` with the same primary inset shadow used for the current slot in lyrics preview.
- Eyebrow text: "Preview · scroll horizontally to see full row".
- Keep the existing "Reorder this chord" row below; its arrow buttons already call `movePatternChord(patternId, chordId, ±1)` over the SSOT-ordered list, which inherently ignores empty beat slots and swaps with the next chord.

## 5. LyricsTab — surface Duplicate as a top-level icon button

In the section header (around lines 880–920), add a `Copy` ghost icon button immediately before the `DropdownMenuTrigger` (`MoreVertical`), calling `duplicateSection(section.id)`. Remove the existing **Duplicate** `DropdownMenuItem` (lines 885–887) from the menu.

## 6. LyricsTab — remove section expand/collapse button

Remove the chevron toggle at lines 923–931 (the `<button>` that calls `toggleSectionCollapsed(section.id)`). Make the `{!section.collapsed && (` body wrapper (line 935) unconditional. Keep `toggleSectionCollapsed` in the store untouched (still used by sort mode plumbing).

## Verification

- `npx tsc --noEmit`
- Progressions: options menu shows only Add Key Change / Arpeggiator / Section color / Delete section / Delete last block. Sections always render expanded. Block header shows `n / N beats · M bars` with working −/+ steppers and editable input.
- Progressions FocusedChordEditor: tapping a chord in a pattern opens the editor; preview is a horizontal scroll row of all chords in that block with the active chord highlighted; left/right reorder arrows swap with the next chord.
- Lyrics: each section header shows a `Copy` icon button next to the options menu; no expand/collapse chevron; section bodies always visible.
