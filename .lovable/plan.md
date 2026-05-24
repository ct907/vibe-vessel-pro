## Goal

Replace the inline expanding spice panel with a modal sheet (same pattern as `ChordPickerSheet` / `FocusedChordEditor`). The sheet shows spice suggestions organized by filter chips, and each suggestion card has a chart toggle that reveals a voice-leading overlay comparing the original chords against the spiced ones.

## Behavior

### 1. Spice modal sheet

- New component `src/components/progressions/SpiceSheet.tsx` built on shadcn `<Sheet>` (side="bottom", scrollable inner column), styled like `ChordPickerSheet` and `FocusedChordEditor`.
- Header matches the reference screenshot: small "VERSE n BLOCK m" eyebrow + "Add Spice" title on the left, sculpted-amber **Done** button on the right that closes the sheet (and stops any preview).
- In `ProgressionsTab.tsx`, the existing per-block Sparkles button keeps its current state pattern but now opens this sheet instead of expanding inline:
  - Remove the `<SpicePanel ... hideTrigger />` block (lines 896–903).
  - Render `<SpiceSheet open={spiceOpen} onOpenChange={setSpiceOpen} pattern={pattern} activeChordId={activeChordId} originalChords={sortedChords.map(c => c.chord)} onAuditionChange={setPreviewingSpiceChords} />`.
- The existing `VoiceLeadingRibbon` overlay on the pattern block stays untouched (still driven by `previewingSpiceChords` while audition is playing from inside the sheet).

### 2. Filter chips

- Chip row directly under the header. Chips: `All` + one chip per category present in `suggestions` (uses `CATEGORY_ORDER` + `CATEGORY_EMOJI` already defined in `SpicePanel.tsx`; e.g. 🎬 Dramatic shift, 🕵️ Inner voice walk, 🍷 Bittersweet color, ✨ Tension gateway, 🌉 Smooth bridge…).
- Selected state uses sculpted-amber pill (`.btn-sculpt-amber` + rounded-full); idle uses `.btn-sculpt-cream` pill. Active chip persists across re-renders inside the sheet only.
- Selecting a chip filters the rendered group list to that category. `All` shows every category, grouped with section headers (`🎬 Dramatic shift`, `🕵️ Inner voice walk`, …) as in the screenshot.

### 3. Suggestion card layout (per screenshot)

Each card is a paper-card rounded rectangle:
- Top row: theory label (e.g. `C → G#`) + small friction delta (`friction +0.7`) on the left; on the right a small chart icon button (`Activity`, square sculpted-cream) that toggles the per-card voice-leading overlay.
- Chord chip row underneath (existing `ChordChip` strip, keeping the `changedIndices` ring highlight).
- Bottom-right actions: Audition (Play/Square) and Apply (Check, sculpted-amber when card is the currently auditioned one). Reuse the play/commit handlers from `SpicePanel` verbatim.

Reuse the existing `generateSpiceSuggestions`, `playSuggestion`, `commitSuggestion`, `octaveFor`, and toast/undo logic — move them from `SpicePanel.tsx` into `SpiceSheet.tsx` (or extract into a small hook `useSpiceSuggestions(pattern, activeChordId)` colocated in the same file). `SpicePanel.tsx` becomes unused on this surface; leave the file in place but stop importing it from `ProgressionsTab.tsx` (no behavioral risk — nothing else references it).

### 4. Per-card voice-leading overlay

- New component `src/components/progressions/VoiceLeadingOverlay.tsx` adapted from `VoiceLeadingLinesPanel.tsx`.
- Renders both progressions on the same SVG:
  - **Original** voicing: same shape geometry (diamond / pentagon / square / circle per voice index) but rendered at reduced opacity (~0.35), with dashed connector lines (`strokeDasharray="4 4"`, thin 1.2px regardless of smoothness).
  - **Spiced** voicing: full-opacity markers and current thick/thin smoothness rule (≤2 semitones → 3px, else → 1.2px).
- Y math reuses the existing anchor logic from `VoiceLeadingLinesPanel`, but the anchor reference is the **original** first chord's voices, so both progressions share the same vertical baseline and "spice effect" is visible as relative motion.
- X positions: equal columns across the measured container width (same `ResizeObserver` pattern already in `VoiceLeadingLinesPanel`). Number of columns = `max(originalChords.length, spicedChords.length)`.
- A small legend on the top-right of the overlay: dashed swatch "Original" + solid swatch "Spiced".
- The overlay mounts inside the suggestion card with the same smooth height/opacity transition `VoiceLeadingLinesPanel` already uses; toggled by per-card local state `overlayOpen` driven by the chart icon. Only one overlay open per card; multiple cards can be open independently.

### 5. Empty / single-chord states

- If `sortedChords.length < 2`, the Sparkles trigger is already hidden in `ProgressionsTab.tsx` (existing condition), so the sheet won't open in that case — no change needed.
- If `suggestions.length === 0`, the sheet shows the same dashed empty state SpicePanel uses today, centered under the chip row.

## Technical notes

- Files to **create**: `src/components/progressions/SpiceSheet.tsx`, `src/components/progressions/VoiceLeadingOverlay.tsx`.
- Files to **edit**: `src/components/progressions/ProgressionsTab.tsx` (swap `<SpicePanel>` for `<SpiceSheet>`; drop unused import).
- Files **untouched**: `SpicePanel.tsx` (kept for safety; no longer used by this surface), `VoiceLeadingLinesPanel.tsx`, `VoiceLeadingRibbon.tsx`, `spice.ts`, `chords.ts`.
- Sheet open/close still drives `setPreviewingSpiceChords(null)` on close, preserving the existing on-block ribbon behavior.
- Sticky header inside sheet (eyebrow + title + Done + chip row); body scrolls.
- All colors via existing tokens (`--paper`, `--paper-card`, `--paper-shade`, `--primary`, `--primary-strong`, `--ink-soft`); voice marker palette stays the literal yellow/green/blue/red from `VoiceLeadingLinesPanel`.

## Out of scope

- No changes to the spice generation engine, audio playback, or undo/toast logic.
- No persistence of selected filter chip or per-card overlay state across sheet open/close.
- No interaction (hover/tap) on overlay markers.
- No changes to the existing pattern-block-level voice-leading button or its panel.