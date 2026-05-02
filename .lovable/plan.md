# Plan — OKLCH design system + pastel chord chips

## Goals
1. Move the global design tokens from HSL to OKLCH so the whole UI lives in a perceptually-uniform space.
2. Replace the chord-chip color taxonomy with the new pastel palette, using `linear-gradient(... in oklch, ...)` so cross-spectrum gradients don't go muddy in the middle.

---

## Step 1 — Global OKLCH tokens

The project currently defines all design tokens as HSL triplets in `src/index.css` (`--background: 41 38% 92%;`) and consumes them via `hsl(var(--background))` everywhere — `tailwind.config.ts`, `src/components/section/SectionColorPicker.tsx` (`hsl(var(--section-tint-...))`), and a few inline shadows in `index.css`.

Strategy: keep the same token names and the same CSS-variable-based pattern, but switch the **stored value** from "H S L" triplets to a full `oklch(...)` color string, and switch the **consumers** from `hsl(var(--x))` to plain `var(--x)`.

Edits:

- `src/index.css`
  - `:root` and `.dark` blocks: convert every token (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--paper`, `--paper-shade`, `--rule`, `--margin-line`, `--ink-soft`, `--chord-ink`, `--chord-chip`, `--chord-chip-foreground`, all `--sidebar-*`, all 16 `--section-tint-*`) to `oklch(L C h)` values that visually match the current warm-paper palette (light) and dark sepia palette (dark). Keep the values inside `var()` as full color strings, e.g. `--background: oklch(0.94 0.03 80);`.
  - Remove the `color: hsl(...)` / `box-shadow: ... hsl(...)` literals inside `.btn-neumorphic-play` and `--shadow-paper` and rewrite them with `oklch(...)` (the few that reference `var(--primary)` change from `hsl(var(--primary) / 0.45)` to a plain alpha applied via `color-mix(in oklch, var(--primary) 45%, transparent)` — same visual, OKLCH-native).
  - `.paper-ruled` and `.paper-margin` `hsl(var(--rule) / 0.55)` → `color-mix(in oklch, var(--rule) 55%, transparent)`.

- `tailwind.config.ts`
  - Replace every `"hsl(var(--token))"` entry in `theme.extend.colors` with `"var(--token)"`. Tailwind no longer needs the wrapper because the variable already holds a full color.
  - Leave the chord-color `safelist` patterns alone for now — Step 2 will replace them.

- `src/components/section/SectionColorPicker.tsx`
  - `hsl(var(--section-tint-${color}))` → `var(--section-tint-${color})`.
  - `hsl(var(--section-tint-${color}) / 0.5)` → `color-mix(in oklch, var(--section-tint-${color}) 50%, transparent)`.

- Quick repo sweep with `rg "hsl\(var\("` to catch any other consumers (e.g. inline styles in components I haven't listed) and convert them with the same `var(...)` / `color-mix(in oklch, ...)` rules.

No component logic changes; this is a token-format migration only.

---

## Step 2 — Pastel chord chip palette in OKLCH

Replace the Tailwind class-based palette in `src/lib/music/chordColor.ts` with hand-tuned pastel colors, using OKLCH equivalents of the requested hex values and OKLCH gradient interpolation for the multi-color families.

Approach:
1. Change the return shape of `getChordColorClasses(chord)` from `{ bg, text }` (Tailwind classes) to `{ style, className }`, where `style` is a `React.CSSProperties` carrying `background` (solid `oklch(...)` or `linear-gradient(to right in oklch, oklch(...), oklch(...))`) and `color` (a dark slate, e.g. `oklch(0.25 0.02 260)`). `className` keeps a light utility class for hover (`hover:opacity-90`) and font weight only.
2. Update the five consumers (`ChordChip.tsx`, `ChordPickerSheet.tsx`, `FocusedChordEditor.tsx`, `BasketBar.tsx`, `ProgressionsTab.tsx`) to spread `style` onto the element and drop the old `bg`/`text` class concatenation. The "filled" variant in `ChordChip` (used by basket controls) keeps its existing primary-tint behavior.
3. Remove the chord-related entries from `safelist` in `tailwind.config.ts` since Tailwind classes no longer drive these colors. Section-tint and other dynamic class patterns stay.

Palette mapping (hex → OKLCH; gradients use `linear-gradient(to right in oklch, A, B)`):

| Family | Qualities | Background |
|---|---|---|
| Plain major | `maj` | Soft Peach `#FDE6A9` → `oklch(0.92 0.08 85)` |
| Plain minor | `min` | Powder Blue `#D0E4F5` → `oklch(0.90 0.04 240)` |
| Gentle major | `6`, `add9`, `6/9` | Pale Butter `#FFF2C2` → `oklch(0.96 0.06 95)` |
| Gentle minor | `min6` | Ice Blue `#E1F0FA` → `oklch(0.94 0.03 235)` |
| Major extended | `maj7`, `maj9`, `maj11`, `maj13`, `add11` | Warm Sand `#FCE4B6` → Rose `#F5C6CB` |
| Minor extended | `min7`, `min9`, `min11`, `min13` | Sky Blue `#D2E0FB` → Lavender `#E2D4F0` |
| Dominant | `7`, `9` | Apricot `#F8D7C2` → Periwinkle `#C9D6F0` |
| Altered dominant | `7alt`, `7#5`, `7b9`, `7#9` | Mint `#D1E8D5` → Muted Blush `#F0C9C9` |
| Diminished | `dim`, `dim7`, `m7b5` | Dusty Blue `#CCD1E4` → Lilac `#D7C4E4` |
| Minor-major | `minMaj7` | Soft Thistle `#E0D4EB` → Pale Gold `#FCE4B6` |
| Sus / Aug | `sus2`, `sus4`, `aug` | Cotton Candy `#FAD4E4` (solid) |
| Power | `5` | Pale Lemon `#FDF1C4` → Baby Blue `#D6EAF8` |

Foreground for every chip: a dark charcoal in OKLCH (~`oklch(0.25 0.02 260)`) for AA contrast over all listed pastels (verified against the lightest chip — Pale Butter / Pale Lemon — which still hit ≥7:1).

I'll convert each hex to OKLCH precisely (using a small inline conversion, not eyeballing) when writing the file, so the exact L/C/h values land in the source.

---

## Verification

- Run the existing Vitest suite (`bunx vitest run`) — no test should change behavior; the chord parser is untouched.
- Open the preview, exercise the Chords tab, the chord picker sheet, and the focused chord editor on mobile width (384px) to confirm every family renders with the new pastel and that text stays legible.
- Spot-check section color swatches and the neumorphic play button to confirm the OKLCH token migration didn't shift the warm-paper aesthetic.

## Out of scope
- No changes to chord parser, audio engine, or any business logic.
- No new chord qualities; the 31-quality taxonomy stays as-is.
- The `--section-tint-*` palette stays visually identical (just re-encoded in OKLCH).
