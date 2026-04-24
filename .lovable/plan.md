## Goal

Make chord chips visually anchor to the start of lyric words instead of being placed on a free monospace grid. Replace the per-character chord-row caret/typing with a word-slot model + a manual "Format Chords" action.

Also fix the build error in `ChordsTab.tsx` (`size="md"` → `size="default"`, lines 199 & 206 — `Button` only allows `default | sm | lg | icon`).

## Data model (`src/store/song.ts`)

Keep existing `ChordAnchor` shape but reinterpret:

- `chordCol` becomes the **word index** the anchor is bound to (0-based index into the line's word list). `null`/`undefined` = unbound (floating).
- Add an explicit `order: number` per anchor for left-to-right display order. (Bound chords sort by `wordIndex`, then `order`; floating chords sort by `order` only and render after bound ones, OR — see fallback below — render at default gap-2 positions when there are no words at all.)
- Migration: existing `chordCol` (column) → treat as `order`, leave `wordIndex` undefined until user runs Format Chords.

New helpers:

- `getWords(text: string): { index: number; start: number; end: number; text: string }[]` — split by `/\S+/` (start col of each word in the raw string).
- `formatChordsForLine(line)`: pure function that walks chords in `order`, snaps each to the **closest unused** word (by current visual position vs word start col), skipping words that already have a chord assigned to them in this pass; leftover chords keep their previous `wordIndex` (or stay floating).

New / modified store actions:

- `formatChordsInLine(sectionId, lineId)` — runs the snap above, pushes history.
- `formatChordsInSection(sectionId)` and `formatChordsInSong()` — convenience wrappers used by the toolbar button (button next to "Expand all" applies to all sections).
- `moveChordWordSlot(sectionId, lineId, anchorId, direction: -1 | 1)` — context-menu ←/→: move binding to the previous/next word. If the target word is occupied by another chord, **swap** the two anchors' `wordIndex` (and adjust `order`). If no target word exists in that direction, swap order with the neighboring chord instead (covers the floating case + ensures rule 4).
- Remove/retire `insertChordSpaceAt`, `removeChordCellAt`, `setChordRowLen` callers from the lyrics tab. Keep the actions for now to avoid touching exports broadly; mark deprecated in a comment.

## Lyrics tab (`src/components/lyrics/LyricsTab.tsx`)

Rewrite the chord-row rendering for each `LineRow`:

- Stop using `cellPx` / monospace columns / caret / area-drag-by-pixels for placement. Remove the `chordCaret`, `chordRowLen`, `insertChordSpaceAt`, `removeChordCellAt` plumbing in this component.
- Render the chord row as an absolutely positioned overlay aligned to the lyric `<textarea>`/measurement layer:
  - Use a hidden mirror `<div>` that mirrors the textarea's wrapped layout (same font, width, padding, white-space: pre-wrap) with one `<span data-word-index={i}>` per word.
  - After layout, read each word span's `getBoundingClientRect()` relative to the row container to get the pixel `left` of each word.
  - Place each chord chip via `style={{ position: "absolute", left: wordLeftPx[anchor.wordIndex] }}`.
- **Fallback when the line has no words yet**: render chips inline (flex row) with `gap-2`, in `order` sequence (rule 2).
- **Rule 1 enforcement**: when the user adds a chord via the picker, choose target word index = first word that has no chord bound to it; if all words are taken, append as floating (no `wordIndex`).
- Remove the typing caret visual (`|`) and per-character spaces in the chord row. Tap-on-empty-row still opens the picker, but no caret position is shown — the picker just appends.
- Keep chord chip click = play/audition + open picker for that chord (unchanged behavior).
- Drag-to-rearrange across rows (`moveSelectedChordsTo`) keeps working but the destination is "which row" + "append-or-insert into word slots" rather than a pixel column. Simpler: drop = move to target line and run the line's `formatChordsForLine` with the moved chords appended.

Add a **"Format Chords"** button in the section/lyrics toolbar:

- Place beside the existing "Expand all" / collapse-all button at the top of the lyrics tab (search for `setAllSectionsCollapsed` usage).
- Icon: `Brush` (broom) from `lucide-react`.
- Disabled state: enabled iff at least one line in the song contains words AND at least one chord exists. Otherwise grey out with a tooltip "Type lyrics first".
- onClick: dispatch `formatChordsInSong()`.

Per-line context-menu changes (the existing chord-row select-mode menu):

- ← / → buttons rebind to `moveChordWordSlot(..., -1 | +1)` for the focused anchor (or each in selection, in left-to-right order to preserve relative order).
- Remove the column-shift behavior of `moveSelectedChordsByOrder` from these buttons (action stays in store but is no longer wired here).

## Progressions tab

No data-model change reaches here directly. `chordCol` is no longer a pixel column but it never was rendered in the progression tab anyway — it only uses `mirrorId`. No edits expected beyond keeping `syncPatternFromAnchors` working: update `anchorsInVisualOrder` to sort by `(wordIndex ?? Infinity, order)` so cross-tab ordering stays stable.

## Migration / persistence

In `loadFromJSON` (search `version: 2` block in `song.ts`), for each anchor: if `chordCol !== undefined && wordIndex === undefined`, copy `chordCol → order` and leave `wordIndex` undefined (user will Format Chords to snap). Bump `version` to `3` for new saves; still load v2.

## Build-fix (independent, immediate)

`src/components/chords/ChordsTab.tsx` lines 199 and 206: change `size="md"` to `size="default"`. The component already specifies `h-12` so the visual size is preserved.

## Files touched

- `src/store/song.ts` — add `wordIndex`/`order` semantics, `formatChordsForLine`, `formatChordsInSong`, `moveChordWordSlot`, migration in `loadFromJSON`, update `anchorsInVisualOrder`.
- `src/components/lyrics/LyricsTab.tsx` — rewrite `LineRow` chord-row rendering (word-anchored overlay + flex-fallback), drop caret/character-cell logic, add Format Chords button in the top toolbar, rewire ←/→ in the chord-row context menu.
- `src/components/chords/ChordsTab.tsx` — fix `size="md"` build error.

## Open questions / decisions made

- **What "closest" means for the broom snap**: nearest by current pixel position of the chip vs word's pixel start, measured in the live layout. Ties broken left-first.
- **Floating chords after format**: chords that can't snap retain whatever previous position they had (rule 3) — rendered after bound ones in a small floating row at the right end of the line, with a subtle dotted outline to signal "unanchored".
- **Pixel measurement**: uses a hidden mirror div + `getBoundingClientRect`. Recomputed via `ResizeObserver` on the line container and on `line.text` change.