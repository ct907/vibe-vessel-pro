## Phase 1.5 Part A — Color refresh + verify chord coverage

### Findings from current code

Before making changes, I checked the current state of the relevant files:

- **`src/lib/music/chords.ts`** — `COMMON_QUALITIES` already contains all **31** qualities the prompt asks for (including `5`, `6/9`, `add11`, `maj11`/`maj13`, `min11`/`min13`, `7alt`, `7#5`, `7b9`, `7#9`). The `Quality` type, `QUALITY_INTERVALS`, `QUALITY_PRETTY`, `QUALITY_HUMAN`, and `QUALITY_FAMILY` maps are all complete.
- **`src/components/chord/ChordPickerSheet.tsx`** — Suggestions are rendered from `suggestChords(query)`, which returns every entry of `COMMON_QUALITIES` when the query is just a root letter. So all 31 chords already appear; the new ones are also reachable through the Type × Variant dropdowns + altered-dominant chips that were added in the previous turn.
- **`src/components/basket/BasketBar.tsx`** — Already imports and uses `getChordColorClasses(chord)`, so any color change in `chordColor.ts` automatically propagates to the basket.
- **`src/lib/music/chordColor.ts`** — Already returns gradients for `maj11`/`maj13`/`add11` and the four altered dominants. They currently end at `red-950` (the muddy/brown look the user is calling out).
- **`tailwind.config.ts`** — Safelist pattern currently allows `from-*-(300|400|600|700|800|900|950)` and `to-*-(300|400|600|700|800|900|950)` over `yellow|red|blue|purple|orange|pink`. No `green`.

So **Issue 1 (missing chords) is effectively already solved** in the codebase. The deliverable is therefore the color refresh + a defensive verification pass.

---

### Changes

#### 1. `src/lib/music/chordColor.ts`
Two switch arms updated:

- **Major-extended family** (`maj7`, `maj9`, `maj11`, `maj13`, `add11`)
  ```ts
  return { bg: "bg-gradient-to-r from-yellow-600 to-red-700", text: "text-stone-50" };
  ```
- **Altered-dominant family** (`7alt`, `7#5`, `7b9`, `7#9`)
  ```ts
  return { bg: "bg-gradient-to-r from-green-700 to-red-800", text: "text-stone-50" };
  ```

All other arms (solid yellow/blue triads, pastels, dominant orange→blue, minor-extended blue→purple, diminished blue→purple, mMaj7 purple→yellow, sus/aug pink, power yellow↔blue) stay unchanged.

#### 2. `tailwind.config.ts`
Add `green` to the gradient safelist patterns so `from-green-700` is preserved through the Tailwind purge:

```ts
{ pattern: /^from-(yellow|red|blue|purple|orange|pink|green)-(300|400|600|700|800|900|950)$/ },
{ pattern: /^to-(yellow|red|blue|purple|orange|pink|green)-(300|400|600|700|800|900|950)$/ },
```

(The `950` step is kept in the pattern because the existing minor-extended and diminished gradients still terminate at `purple-950`.)

#### 3. Verification pass (no code change unless something is missing)
- Spot-check `ChordPickerSheet.tsx` lines 452–516 (the truncated tail of the helpers) to confirm the `Select` for variants renders the new entries (`11`, `13`, `6/9`, `add11`, etc.) — they were added in the previous turn but I want to eyeball them.
- Confirm `ChordChip.tsx` (and the `StaticChordChip` inside `BasketBar`) render via `getChordColorClasses`, so the new gradients show in every surface (picker tile previews if any, lyrics inline chips, progressions cards, basket).
- Run the existing `src/test/chord-parser.test.ts` to make sure parser/family round-trips still pass — no test changes expected.

---

### Final palette after the change

| Family | Qualities | Background |
|---|---|---|
| Major triad | `maj` | `bg-yellow-700` |
| Minor triad | `min` | `bg-blue-800` |
| Bright add | `6`, `add9`, `6/9` | `bg-yellow-300` |
| Bright minor add | `min6` | `bg-blue-300` |
| **Major extended** | `maj7`, `maj9`, `maj11`, `maj13`, `add11` | **`from-yellow-600 to-red-700`** |
| Minor extended | `min7`, `min9`, `min11`, `min13` | `from-blue-700 to-purple-950` |
| Dominant | `7`, `9` | `from-orange-800 to-blue-600` |
| **Altered dominant** | `7alt`, `7#5`, `7b9`, `7#9` | **`from-green-700 to-red-800`** |
| Minor-major | `minMaj7` | `from-purple-800 to-yellow-600` |
| Diminished | `dim`, `dim7`, `m7b5` | `from-blue-800 to-purple-950` |
| Sus / aug | `sus2`, `sus4`, `aug` | `bg-pink-300` |
| Power | `5` | `from-yellow-300 to-blue-300` |

---

### Out of scope
- No new chord types (everything in the prompt's list is already present).
- No changes to picker layout, audio, or store.
- No basket refactor — it already consumes the color taxonomy.

### Risk
- Tailwind safelist regex change — verified the new pattern is a strict superset of the old one (only adds `green`), so no existing class is dropped.
- Visual regression on `maj7`-heavy songs: the gradient endpoint shifts from `red-950` to `red-700`, which is the explicit intent.
