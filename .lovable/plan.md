## Plan: Three usability refinements

### 1) 80% usable-width rule for chord layout

The chord row needs ~20% of viewport reserved for the right-edge edit (pencil) controls so the last chord isn't crammed under them. Apply this only to slot-capacity math — not to lyric character wrapping or the FocusedChordEditor's fixed 80-slot scroller.

`**src/lib/music/chordLayout.ts**` — `formatChordsAndLyrics`:

- Introduce `usableWidth = config.screenWidth * 0.8`.
- Change `slotsPerLine = Math.max(2, Math.floor(usableWidth / slotWidth))`.
- Leave `charsPerLine` based on full `screenWidth` (lyric text already wraps natively to container; the 20% reserve is a chord-row affordance, not a text wrap).
- Update the `dbg(...)` payload to include `usableWidth` for traceability.

`**src/store/song.ts**` — `autoLayoutSection` residual-overflow check (line ~1809):

- Same change: `slotsPerLine = Math.max(2, Math.floor((screenWidth * 0.8) / slotWidth))` so the residual-overflow warning matches the new capacity.

**Not changed:** `FocusedChordEditor` — it uses a horizontally scrollable fixed 80-slot grid (`min-width: 2240px`), independent of viewport, so the 80% rule does not apply there.

---

### 2) Chord chip color rules (render-time projection)

Pure render-time mapping from chord quality + extension. No SSOT/schema/store changes.

**New file `src/lib/music/chordColor.ts**` exporting `getChordChipClasses(chord: ChordSymbol)` returning `{ bg, text }` Tailwind classes.

Family detection (from `chord.quality` / `chord.display`):

- `dim`, `°`, `m7b5` (half-dim) → **teal**
- `m`, `min` (and not `maj`) → **blue**
- `maj`, plain triad, `sus`, `add`, `aug`, `5` (power chord) → **yellow**
- `7` (dominant), `9`/`11`/`13`with `maj` prefix --> orange
- `7` (dominant), `9`/`11`/`13`with `m` prefix -->  purple

Note: `m7b5` (half-diminished) is explicitly **teal-500** per spec example, so it must be matched **before** the generic dim test.

Weight by highest extension number found in the symbol:

- contains `9`, `11`, or `13` → **700**
- contains `7` (and not 9/11/13) → **500**
- otherwise (triads, 5ths, sus, add, aug) → **300**

Tailwind classes returned (using palette already available via Tailwind defaults). Example:

- yellow: `bg-yellow-300/700` etc., text `text-yellow-950` for 300, `text-yellow-50` for 500/700 (contrast).
- blue: `bg-blue-300/500/700`, matching text.
- purple: `bg-purple-300/500/700`.
- red: `bg-red-300/500/700`.

`**src/components/chord/ChordChip.tsx**`:

- When `variant === "card"` (default), apply the family/weight classes from `getChordChipClasses` instead of the current `bg-chord-chip/50` token.
- `variant === "ink"` and `variant === "filled"` keep current behavior (used in Chords tab/Basket where a uniform look is desired) — confirm-on-build whether the user wants these too; default plan keeps them as-is to avoid surprise. (If they should also be colored, it's a 1-line variant change.)
- Selected ring (`ring-primary`) and hover behavior preserved.

**Verification**: `C → yellow-300`, `Em → blue-300`, `Ddim → teal-300`, `G7 → orange-500`, `Cmaj9 → orange-700`, `Em7 → purple-500`, `Em7b5 → purple-500`, `Csus4 → yellow-300`, `Caug → yellow-300`, `C5 → yellow-300`.

---

### 3) Single Song-Settings entry for "Format Chords"

The per-section dropdown currently has "Format chords & lyrics" (LyricsTab.tsx line 902). Song Settings (SongTitleHeader.tsx line 65) already has a "Format chords" item wired to `formatChordsInSong()`.

`**src/components/lyrics/LyricsTab.tsx**`:

- Remove the `<DropdownMenuItem>` for "Format chords & lyrics" (and unused `Wand2` import if no longer referenced; line 1464 uses it for the auto-reflow info banner — keep import).
- Section dropdown becomes: Rename (custom only) → Duplicate → Color → Delete (existing flow).

`**src/components/song/SongTitleHeader.tsx**`:

- Label already reads "Format chords" — confirm copy matches spec exactly. No change needed.
- This single action calls `formatChordsInSong()` which iterates all sections — already correct.

**No store changes.** `autoLayoutSection` remains exported for the watchdog and the cross-device auto-format-on-load path (Issue #1 from previous phase).

---

### Files touched

- `src/lib/music/chordLayout.ts` — 80% rule in `slotsPerLine`.
- `src/store/song.ts` — 80% rule in residual-overflow check inside `autoLayoutSection`.
- `src/lib/music/chordColor.ts` — **new**, family/weight projection.
- `src/components/chord/ChordChip.tsx` — apply colored classes for `card` variant.
- `src/components/lyrics/LyricsTab.tsx` — remove per-section "Format chords & lyrics" menu item.
- `src/components/song/SongTitleHeader.tsx` — verify-only (label already correct).

### Out of scope / not changed

- FocusedChordEditor's 80-slot scroller (independent of viewport).
- `ink` / `filled` ChordChip variants in Chords tab and Basket (pending your call).
- Persistence, schema, store shape — none affected.