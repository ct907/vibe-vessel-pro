## Goal

Three small Phase 1.5 Part A cleanups: surface all 31 chord qualities in the Chords tab grid, verify the green altered-dominant gradient is wired end-to-end, and color the suggestion cards in both chord-picker surfaces.

---

## Current state

- `COMMON_QUALITIES` in `src/lib/music/chords.ts` already lists all 31 qualities, family-grouped.
- `src/lib/music/chordColor.ts` already returns `from-green-700 to-red-800` for `7alt / 7#5 / 7b9 / 7#9`.
- `tailwind.config.ts` safelist already includes the `green` token in both `from-` and `to-` patterns and the gradient base class.
- `src/components/chords/ChordsTab.tsx` defines its **own** local `ALL_QUALITIES` array with only 18 entries — this is why the grid is missing `5`, `6/9`, `add11`, `maj11/13`, `min11/13`, `7alt`, `7#5`, `7b9`, `7#9`.
- `ChordPickerSheet.tsx` (mobile + desktop suggestion grids) and `FocusedChordEditor.tsx` (mobile full-screen editor) render suggestion buttons with `bg-card` and a plain `ink-chord` text — they do not call `getChordColorClasses()`.

So Issue 2 is already done; only Issues 1 and 3 require code changes.

---

## Changes

### 1. `src/components/chords/ChordsTab.tsx` — render all 31 qualities

- Remove the local 18-entry `ALL_QUALITIES` constant.
- Import `COMMON_QUALITIES` from `@/lib/music/chords` and use it as the source for the per-row variant loop.
- Keep the existing row-level dedupe (`seenInRow`) so enharmonic duplicates are still collapsed.
- Verify `qualitySuffix()` handles every new quality (`5`, `6/9`, `add11`, `maj11`, `maj13`, `min11`, `min13`, `7alt`, `7#5`, `7b9`, `7#9`). The current rule "if `maj` → `''`, if `min` → `m`, else literal" already produces correct symbols for all of these (e.g. `Cmin11` → `Cm11`, `C7alt`, `C6/9`, `C5`).

### 2. `src/components/chord/ChordPickerSheet.tsx` — colored suggestion cards

In both the mobile horizontal scroller (lines ~196–217) and the desktop grid (lines ~221–242):

- Import `getChordColorClasses` from `@/lib/music/chordColor`.
- For each suggestion, compute `const { bg, text } = getChordColorClasses(s.symbol)`.
- Replace `bg-card … hover:bg-accent` with `cn(bg, text, "border-none hover:opacity-90 transition-opacity")` on the button.
- Drop the `ink-chord` / `text-muted-foreground` overrides on the inner spans so the per-card `text` color cascades; keep the play-icon button readable by giving it a translucent overlay (`bg-black/10 hover:bg-black/20`) instead of relying on `text-muted-foreground`.
- Keep label sublines but use `opacity-80` so they remain legible on both light (`text-zinc-900`) and dark (`text-stone-50`) variants.

### 3. `src/components/lyrics/FocusedChordEditor.tsx` — colored suggestion cards

In the suggestions grid (around lines ~211–236):

- Same treatment as above: import `getChordColorClasses`, compute `bg`/`text` per suggestion, apply to the outer button, replace `bg-card`/`ink-chord`/`text-muted-foreground` accordingly.
- Keep the play-icon button as a stop-propagation child with a translucent backdrop so it remains tappable on every gradient.

### 4. Quick verification (no code changes)

- `tailwind.config.ts` safelist already covers `green` and the `red-700/800` range — no edits needed.
- `chordColor.ts` mapping for altered dominants already returns the green→red gradient — no edits needed.
- Run the existing `chord-parser.test.ts` after the change to confirm `COMMON_QUALITIES` round-trips through the picker (test already iterates the full list).

---

## Files touched

- `src/components/chords/ChordsTab.tsx` (drop local list, use `COMMON_QUALITIES`)
- `src/components/chord/ChordPickerSheet.tsx` (color suggestion cards)
- `src/components/lyrics/FocusedChordEditor.tsx` (color suggestion cards)

No changes to `chords.ts`, `chordColor.ts`, or `tailwind.config.ts`.

---

## Acceptance

- Chords tab shows every variant in `COMMON_QUALITIES` for each scale degree (after row-dedupe), including `5`, `6/9`, `add11`, `maj11/13`, `min11/13`, and the four altered dominants.
- Altered dominants render with the green→red gradient in basket, chord chips, picker suggestions, and focused editor suggestions.
- Picker suggestion cards (both mobile sheet and desktop grid) and focused-editor suggestion cards display chord-family colors instead of plain `bg-card`.
