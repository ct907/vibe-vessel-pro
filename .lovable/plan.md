## Scope

All changes are in `src/components/progressions/ProgressionsTab.tsx`, plus small tweaks to `SpicePanel.tsx`, `SongAttributesMenu.tsx`, and the section header. No store changes.

## 1. Section header (`SectionGroup`)

Right-side cluster, in order:
`[voice-leading toggle (stub)] [duplicate] [section options menu] [collapse/expand]`

- Add a "Voice leading lines" ghost icon button (lucide `Activity`). For this phase it's a stub that toggles a local `voiceLeadingOpen` boolean and renders nothing — UI deferred to next phase. Tooltip: "Voice leading (coming soon)".
- Surface duplicate as a top-level ghost icon button (`Copy`) calling `duplicateSection(sectionId)`. Remove the "Duplicate" item from the options dropdown.
- Keep "Delete section" inside the options dropdown (`MoreVertical`). Remove any inline section-delete buttons surfaced elsewhere.

## 2. Song attributes pill

In `SongAttributesMenu.tsx`, give the "C Major | 4/4 | 100 bpm" trigger a filled background using a paper-shade pill style (rounded-full, `bg-[var(--paper-shade)]`, small horizontal padding) so it reads as a pill. Keep chevron + click behavior unchanged.

## 3. Block header row

Row becomes: `BLOCK {n} · [beats dropdown]                    [✧ Spice]`

- Remove `BarsInput` and "Bars" label.
- Replace `{usedBeats} / {totalBeats} beats` text with a `Select` whose options are `4, 8, 12, 16, 20, 24, 32, 48, 64` beats. On change: `updatePattern(pattern.id, { bars: Math.max(1, Math.round(value / pattern.beatsPerBar)) })`. Trigger label: `{usedBeats} / {value} beats`.
- Remove per-block trash button. Block removal moves into a "Delete last block" item appended to the section options dropdown when `blocks.length > 1`.
- Move the spice trigger into this header (right-aligned). Implementation: refactor `SpicePanel` to accept `open` + `onOpenChange` props and render its body only (no built-in trigger), OR export the trigger as a small subcomponent. Render the toggle button in the block header; the suggestions panel still expands below the chord grid.

## 4. Spice opens preset progressions

Behavioral change deferred. For this phase, clicking Spice still opens the existing suggestions list below the grid (only the trigger location changes).

## 5. Add Block button placement (single layout for all viewports)

After the last block of a section, render one row:

```text
[ + Add block (flex-1, dashed) ]   [ 💬 comment icon ]
```

This replaces both the mobile-only last-block button and the desktop grid's add-block tile. Empty-section case shows the dashed "+ Add chords" placeholder (see §7) followed by this same add-block/comment row.

## 6. Block layout & variable widths

Layout container per section:

- **Mobile (`<md`)**: blocks stacked vertically, one per row, full width. Within each row, the block's inner content takes `(bars / maxBarsInSection) * 100%` width, left-aligned.
- **Desktop (`md+`)**: blocks rendered in a 2-column grid (`grid grid-cols-2 gap-3`). If a section has only one block, it occupies one column (half width). With N blocks, layout is a `ceil(N/2) × 2` grid. Within each cell, the block's inner content uses `(bars / maxBarsInSection) * 100%` width, left-aligned (so a 2-bar block beside a 4-bar block visually shows as half-filled).

Drop the existing `extendBackground` / `pr-[15%]` hack — no longer needed.

The add-block/comment row from §5 sits below the grid spanning full width on desktop (`col-span-2`) and as its own row on mobile.

## 7. Empty-section "Add chords" placeholder

When a section has no chords (zero blocks, or all blocks empty in the initial empty state), render one full-width dashed card "+ Add chords". Click → ensure a block exists (`addPatternToSection` if needed) and open the chord picker at slot 0 of the first block. Matches PRECHORUS 2 in the reference screenshot. Beats dropdown stays hidden until chords exist.

## 8. Voice-leading section button

Stub only (see §1). No rendered panel this phase.

## Verification

- `npx tsc --noEmit`
- Mobile (390w): section header shows `[VL] [duplicate] [options]`; block row shows beats dropdown + spice; add-block + comment sit in one row under blocks; PRECHORUS 2 shows dashed "+ Add chords".
- Desktop (≥md): blocks render in a 2-column grid; a lone block takes half width; mixed-bar blocks fill proportionally within their cell.
- Beats dropdown resizes the pattern.
- Song meta pill visibly filled.
