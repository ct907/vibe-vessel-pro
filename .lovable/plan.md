## Scope

All changes in `src/components/progressions/ProgressionsTab.tsx`. No store changes.

## 1. Beat selector — collapsed pill with chevron, expands to stepper

In `PatternBlock` header (lines 314–355), replace the always-visible stepper group with a `Popover`:

- **Trigger** (default state): pill-styled button — `background: var(--pill-rest-bg)`, `border-radius: 999px`, padded `4px 10px`, text `{formatBeats(usedBeats)}/{totalBeats} beats · {pattern.bars} bar(s)` followed by a small `ChevronDown` icon.
- **Content** (popover, `align="start"`): inline row `[−] [ {totalBeats} ] [+] beats · {pattern.bars} bar(s)` reusing the existing `BeatsInput`, minus button, plus button (same handlers already wired). No need for confirm — values commit live.

## 2. Add-block button — 40% width

In the `addBlockRow` (lines 1207–1230):

- Wrap in a flex row that still keeps the comment icon at the far right.
- The dashed `Add block` button takes `width: 40%` of the row container (which is the section blocks container, so 40% of section content width matching the reference).
- Drop `flex-1` from the button; use a spacer or `mr-auto` so the comment icon stays right-aligned.

## 3. Pill block style for section header + section options buttons

In `SectionGroup` header (lines 957–1149), wrap the whole non-sort header in a single full-width pill bar:

- Container: `flex items-center gap-2 px-3 h-12 rounded-full`, `background: var(--pill-rest-bg)`, `color: var(--pill-rest-fg)`.
- Inside: the existing section type `Select` trigger (drop its own pill background so it inherits the bar), the rename `Pencil` button, `KeyChangeSticker`, and then `ml-auto` cluster with `[duplicate] [options ⋮]`.
- The icon buttons (`Copy` duplicate, `MoreVertical`) get a sculpt-cream / paper-shade pill look: `h-9 w-9 rounded-md bg-[var(--paper-shade)] hover:bg-[var(--paper-shade-soft)]` matching the screenshot's soft inset buttons.

Sort-mode header (move up/down) stays as-is (no pill bar) since it's a distinct mode.

## 4. Voice-leading button moves into each block row

- Remove the `Activity` button from the section header cluster (lines 1046–1056 area).
- In `PatternBlock` header (right-side cluster around lines 356+), render a new ghost `Activity` icon button immediately **before** the spice trigger. Same stub behavior (`onClick` no-op, tooltip "Voice leading (coming soon)"). Visible regardless of chord count so users see the affordance per block.

## Verification

- `npx tsc --noEmit`
- Mobile 390w: each block header shows `[16/16 beats · 4 bars ▾]` pill; tapping opens a popover with `[−][16][+] beats · 4 bars`. Voice-leading chart icon appears next to the sparkle in each block. Section header is one dark pill bar containing `VERSE 1 ▾` + duplicate + 3-dots. Add-block dashed button is ~40% of the section width; comment icon stays at far right.
