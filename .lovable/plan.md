# Phase 1.5 — Consolidated Plan (with Parser Ordering Rule)

Rolls together everything still pending: extended chord qualities, color taxonomy, 80%/90% device-aware width with desktop reflow, format-action consolidation, drag-disabled-in-select-mode, and the orientation-vs-resize split.

---

## 1. Extend chord `Quality` enum — with strict ordering rule

`src/lib/music/chords.ts`

### 1a. Add to the `Quality` union
`"5"`, `"7alt"`, `"7#5"`, `"7b9"`, `"7#9"`, `"maj11"`, `"maj13"`, `"min11"`, `"min13"`, `"add11"`, `"6/9"`.

### 1b. `QUALITY_INTERVALS` additions
- `5`: `[0, 7]`
- `7alt` / `7#5`: `[0, 4, 8, 10]`
- `7b9`: `[0, 4, 7, 10, 13]`
- `7#9`: `[0, 4, 7, 10, 15]`
- `maj11`: `[0, 4, 7, 11, 14, 17]` · `maj13`: `[0, 4, 7, 11, 14, 21]`
- `min11`: `[0, 3, 7, 10, 14, 17]` · `min13`: `[0, 3, 7, 10, 14, 21]`
- `add11`: `[0, 4, 7, 17]`
- `6/9`: `[0, 4, 7, 9, 14]`

### 1c. `QUALITY_PRETTY` and `QUALITY_HUMAN` entries
Pretty: `5`, `7alt`, `7#5`, `7b9`, `7#9`, `maj11`, `maj13`, `m11`, `m13`, `add11`, `6/9`.
Human: "power", "altered dominant", "dominant 7♯5", "dominant 7♭9", "dominant 7♯9", "major 11th", "major 13th", "minor 11th", "minor 13th", "add 11", "six-nine".

### 1d. `COMMON_QUALITIES` additions
Append the eleven new entries so the picker surfaces them.

### 1e. **Parser ordering — codified rule**

Rule: **`QUALITY_MAP` entries MUST be sorted longest-pattern first (descending by the maximum literal length of any alternative in the regex).** When two patterns have the same length, the more specific (more accidentals/letters) wins. The shortest prefixes (`maj`, `min`, `7`, `6`, `9`) come last.

We will **rewrite the entire `QUALITY_MAP` array in the correct order** rather than splicing — splicing is what causes regressions. Add a comment block above the array stating the rule and instructing future maintainers to re-sort if they add entries.

Final ordering (longest → shortest):

```ts
// QUALITY_MAP ordering rule:
//   - Sorted by the longest literal alternative in each regex, DESCENDING.
//   - When ties, more-specific (more accidentals) wins.
//   - Shortest single-letter qualities are checked LAST.
//   - When adding a new quality, re-sort the entire array — never splice.
const QUALITY_MAP: Array<[RegExp, Quality]> = [
  // 5 chars
  [/^(?:minMaj7|mMaj7|mM7)/, "minMaj7"],
  [/^(?:maj13|M13)/,         "maj13"],
  [/^(?:maj11|M11)/,         "maj11"],
  [/^(?:min13|m13)/,         "min13"],
  [/^(?:min11|m11)/,         "min11"],
  [/^add11/i,                "add11"],
  // 4 chars
  [/^(?:dim7|°7)/i,          "dim7"],
  [/^(?:m7b5|ø)/,            "m7b5"],
  [/^(?:maj9|M9)/,           "maj9"],
  [/^(?:maj7|M7|Δ7?)/,       "maj7"],
  [/^(?:min9|m9)/,           "min9"],
  [/^(?:min7|m7)/,           "min7"],
  [/^(?:min6|m6)/,           "min6"],
  [/^7alt/i,                 "7alt"],
  [/^sus2/i,                 "sus2"],
  [/^sus4/i,                 "sus4"],
  [/^add9/i,                 "add9"],
  // 3 chars
  [/^(?:dim|°)/i,            "dim"],
  [/^(?:min|m(?!aj))/,       "min"],
  [/^(?:aug|\+)/i,           "aug"],
  [/^sus/i,                  "sus4"],   // bare "sus" → sus4
  [/^7#5/,                   "7#5"],
  [/^7b9/,                   "7b9"],
  [/^7#9/,                   "7#9"],
  [/^6\/9/,                  "6/9"],
  [/^(?:maj|M(?!7|9|11|13))/,"maj"],
  // 1 char (must be last)
  [/^9/,                     "9"],
  [/^7/,                     "7"],
  [/^6/,                     "6"],
  [/^5(?!\d)/,               "5"],
];
```

Notes on ordering decisions:
- `maj` lookahead extended to `M(?!7|9|11|13)` so `M11`/`M13` aren't eaten.
- `7#5`/`7b9`/`7#9` go above `^7` — critical, otherwise `^7` matches first.
- `6/9` goes above `^6`.
- `5(?!\d)` prevents matching the `5` inside `7#5` / `m7b5` (defensive — those already match earlier, but keeps the regex self-safe).
- `7alt` goes above bare `^7`.
- `add11` goes above `add9` and above any `min/maj` shorter prefixes (no collision but length rule is followed).

### 1f. Add a unit test (or assertion in the parser) for the ordering invariant
Add `src/test/chord-parser.test.ts` covering:
```ts
expect(parseChord("C5")?.quality).toBe("5");
expect(parseChord("G7alt")?.quality).toBe("7alt");
expect(parseChord("D7#9")?.quality).toBe("7#9");
expect(parseChord("Fmaj13")?.quality).toBe("maj13");
expect(parseChord("Bm11")?.quality).toBe("min11");
expect(parseChord("Aadd11")?.quality).toBe("add11");
expect(parseChord("C6/9")?.quality).toBe("6/9");
// Regression guards
expect(parseChord("C7")?.quality).toBe("7");
expect(parseChord("Cmaj7")?.quality).toBe("maj7");
expect(parseChord("Cm7")?.quality).toBe("min7");
expect(parseChord("C9")?.quality).toBe("9");
expect(parseChord("Cadd9")?.quality).toBe("add9");
```

This test is the **enforcement mechanism** for the ordering rule — any future edit that re-introduces a prefix collision will fail CI.

---

## 2. Chord color taxonomy

Create `src/lib/music/chordColor.ts` returning `{ bg, text }` Tailwind class strings keyed off `quality`:

| Family | Qualities | Treatment |
|---|---|---|
| Major (solid) | `maj` | `bg-yellow-700` / `text-stone-50` |
| Minor (solid) | `min` | `bg-blue-800` / `text-stone-50` |
| Major-bright | `6`, `add9`, `6/9` | `bg-yellow-300` / `text-zinc-900` |
| Minor-bright | `min6` | `bg-blue-300` / `text-zinc-900` |
| Major-extended | `maj7`, `maj9`, `maj11`, `maj13`, `add11` | `bg-gradient-to-r from-yellow-600 to-red-950` |
| Minor-extended | `min7`, `min9`, `min11`, `min13` | `bg-gradient-to-r from-blue-700 to-purple-950` |
| Dominant | `7`, `9` | `bg-gradient-to-r from-orange-800 to-blue-600` |
| Altered dominant | `7alt`, `7#5`, `7b9`, `7#9` | `bg-gradient-to-r from-orange-900 to-red-950` |
| Minor-major | `minMaj7` | `bg-gradient-to-r from-purple-800 to-yellow-600` |
| Diminished | `dim`, `dim7`, `m7b5` | `bg-gradient-to-r from-blue-800 to-purple-950` |
| Suspended/aug | `sus2`, `sus4`, `aug` | `bg-pink-300` / `text-zinc-900` |
| Power | `5` | `bg-gradient-to-r from-yellow-300 to-blue-300` / `text-zinc-900` |

Wire into:
- `src/components/chord/ChordChip.tsx` — when the chip is being used as a real chord (variant `card`/`ink`), replace `variantCls` with the helper output. Keep `filled` variant intact for non-chord uses (basket controls).
- `src/components/progressions/ProgressionsTab.tsx` line 440 — replace `bg-chord-chip/50 text-chord-chip-foreground hover:bg-chord-chip/60` with helper output. Selection ring already correct (line 441).
- `src/components/basket/BasketBar.tsx` — verify; apply if it renders chord chips.

`tailwind.config.ts` `safelist`:
```ts
safelist: [
  "bg-yellow-700", "bg-yellow-300", "bg-blue-800", "bg-blue-300", "bg-pink-300",
  "bg-gradient-to-r", "text-stone-50", "text-zinc-900",
  { pattern: /^from-(yellow|red|blue|purple|orange|pink)-(300|400|600|700|800|900|950)$/ },
  { pattern: /^to-(yellow|red|blue|purple|orange|pink)-(300|400|600|700|800|900|950)$/ },
],
```

---

## 3. Device-aware usable width (80% mobile / 90% desktop) + desktop reflow

`src/lib/music/chordLayout.ts` — replace the screen-width division lines with:
```ts
const factor = config.screenWidth < 1024 ? 0.8 : 0.9;
const usableWidth = config.screenWidth * factor;
const charsPerLine = Math.max(8, Math.floor(usableWidth / CHAR_WIDTH_PX));
const slotsPerLine = Math.max(2, Math.floor(usableWidth / slotWidth));
```

Mirror the same factor in `src/store/song.ts` residual-overflow safety net (~line 1809).

`src/components/lyrics/LyricsTab.tsx` — alongside the existing orientation listener (line ~1258), add a debounced **window-resize** reflow that only fires on **non-touch** devices:
```ts
useEffect(() => {
  const isMobile = "ontouchstart" in window
    || navigator.maxTouchPoints > 0
    || window.matchMedia("(pointer: coarse)").matches;
  if (isMobile) return;
  let t: number | undefined;
  const onResize = () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      const w = window.innerWidth;
      useSongStore.getState().sections.forEach((sec) => {
        useSongStore.getState().autoLayoutSection(sec.id, w, 28);
      });
    }, 500);
  };
  window.addEventListener("resize", onResize);
  return () => { window.removeEventListener("resize", onResize); window.clearTimeout(t); };
}, []);
```

Mobile orientation modal stays as-is. Tweak its copy to clarify it's specifically for mobile rotation; primary action remains "Export Lyrics".

---

## 4. Progression select mode — disable drag + audition

`src/components/progressions/ProgressionsTab.tsx`:
- Line 420: `<Draggable draggableId={c.id} index={0} isDragDisabled={selectMode}>`.
- Tighten the audition guard at line 258 to also block when `selectMode` is true at entry:
  ```ts
  if (!alreadyOnly && !wasInSelectMode && !selectMode) {
    const c = sortedChords.find((x) => x.id === chordId);
    if (c) void playChord(c.chord);
  }
  ```
- Add `cursor-grab` on the chip when `!selectMode`, `cursor-pointer` when `selectMode`.

---

## 5. Consolidate "Format chords" to Song Settings only

- `src/components/lyrics/LyricsTab.tsx` lines 906–917 — delete the per-section `<DropdownMenuItem>`.
- `src/store/song.ts` `formatChordsInSong` (~line 1754) — make the single Song-Settings action do both word-snapping and a viewport-aware reflow:
  ```ts
  formatChordsInSong: () => {
    pushHistory(get);
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    set((s) => ({
      sections: s.sections.map((sec) => {
        const snapped = { ...sec, lines: sec.lines.map((l) => snapLineToWords(l)) };
        return formatChordsAndLyrics(snapped, { screenWidth: w, slotWidth: 28 }).section;
      }),
      [SSOT_MODE]: true,
    } as any));
  },
  ```

---

## Files touched

- `src/lib/music/chords.ts` — extended `Quality`, intervals, pretty/human, picker list, **rewritten `QUALITY_MAP` in correct order with rule comment**
- `src/lib/music/chordColor.ts` — **new**
- `src/lib/music/chordLayout.ts` — device-aware factor
- `src/store/song.ts` — same factor in safety net; extend `formatChordsInSong`
- `src/components/chord/ChordChip.tsx` — color helper
- `src/components/progressions/ProgressionsTab.tsx` — color helper, `isDragDisabled={selectMode}`, defensive audition guard, cursor hint
- `src/components/basket/BasketBar.tsx` — color helper (verify)
- `src/components/lyrics/LyricsTab.tsx` — remove per-section Format item; desktop debounced resize listener; orientation modal copy tweak
- `tailwind.config.ts` — safelist
- `src/test/chord-parser.test.ts` — **new**, enforces ordering invariant

No schema, SSOT, or store-API surface changes. Existing saved songs remain valid (their `quality` strings are still members of the expanded enum).

---

## Risks (with mitigations)

| Risk | Mitigation |
|---|---|
| Future quality added in wrong position re-introduces prefix collision | `chord-parser.test.ts` regression suite + explicit comment block on `QUALITY_MAP` |
| Tailwind purges dynamic gradient classes | `safelist` patterns in `tailwind.config.ts` |
| iPadOS Safari "desktop mode" treated as mobile or vice-versa | Touch detection uses `ontouchstart || maxTouchPoints || pointer:coarse`. Desktop-class iPadOS still has touch, so it gets the orientation modal (correct — it's a tablet). |
| Power chord (`5`) audition lacks a third — sounds "empty" | Musically correct. `[0, 7]` is the canonical voicing. |
| `7alt` collapses to `7#5` voicing | Documented limitation; sufficient for current audition needs. |
| Reflow on resize fires during drag-resize of dev tools | 500 ms debounce prevents thrash. |

---

## Verification checklist

**Parser (CI):**
- [ ] `bunx vitest run chord-parser` passes all new + regression cases
- [ ] No existing chord parse changes meaning

**Mobile:**
- [ ] Portrait → landscape rotation shows orientation modal, no auto-reflow
- [ ] Layout uses 80% of viewport width
- [ ] In progression select mode, tapping a chip only selects (no audio)
- [ ] In progression select mode, drag does nothing

**Desktop:**
- [ ] Window resize triggers reflow ~500 ms after release
- [ ] Layout uses 90% of viewport width
- [ ] No orientation modal on resize

**Chords UI:**
- [ ] Picker shows all new qualities; `C5`, `G7alt`, `Dm11`, `Fmaj13`, `Aadd11`, `C6/9` parse + audition correctly
- [ ] Each color family renders the documented background (visual spot-check across both tabs)
- [ ] Selection ring still readable on every gradient
