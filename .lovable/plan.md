

## Sections with multiple pattern blocks + safer deletes + variation suggestions (revised)

Same overall plan as before, with three changes per your clarifications.

### 1. Data model: section → many pattern blocks
`src/store/song.ts`
- Add `sectionId: string` to `PatternBlock`. Migrate legacy songs by setting `sectionId = pattern.id` on load.
- Mirror/anchor lookups switch from "match by id" to "match by sectionId".
- New actions: `addPatternToSection(sectionId)`, `removePatternBlock(patternId)` (blocks removing the last block in a section), `getSectionPatterns(sectionId)`.
- `placeMirroredChord` walks all pattern blocks in the section, only creating a new continuation block when none have room.

### 2. Pattern bar reduction → spillover within section
When `updatePattern` reduces bars, overflow chords (in order, lengths preserved, `mirrorId` preserved) get appended to the next pattern block in the same section. A new block is created only if no existing block in the section has room.

### 3. Section naming consistent with lyrics tab
Progressions tab uses `getSectionDisplayName(...)` so labels read "Verse 1 / Chorus 2 / …". Multiple blocks in one section are visually grouped under one section header card; per-block subtitle reads "Block 1 / Block 2". Each section card has an "+ Add pattern block" button.

### 4. Separate delete options in Progressions tab
- Trash icon on each pattern block → "Delete pattern block" (disabled when it's the only block in its section).
- Trash icon on the section header → "Delete entire section" (removes section, all its pattern blocks, and all its lyric lines).

### 5. Cross-tab delete confirmation dialog (revised)
New `src/components/common/ConfirmDeleteDialog.tsx` using `AlertDialog` + `Checkbox`.
- Body explains the cross-tab effect.
- Checkbox label: **"Don't show this again"** (acknowledgement = suppress future dialogs, NOT a gate to confirm).
- Confirm button is always enabled. If the checkbox is ticked when confirming, we set `suppressCrossTabDeleteWarning: true` in the song store.
- Persistence: this flag is part of the song JSON (added to `loadFromJSON` / `toJSON`), so it travels with save files as you asked. It's also kept in the in-memory store so it applies for the rest of the session.
- Wired into:
  - Lyrics tab section "Delete section" (cross-tab dialog).
  - Lyrics tab line "Delete line" (lighter dialog, no cross-tab note, no checkbox).
  - Progressions tab "Delete section" (cross-tab dialog, same suppress flag).
  - Progressions tab "Delete pattern block" (lighter dialog, no checkbox — only affects that block).
- Whenever `suppressCrossTabDeleteWarning` is true, cross-tab deletes skip the dialog and run immediately.

### 6. Chord-progression variation suggestions (revised — no AI)
New collapsible "Suggest variations" panel at the bottom of each pattern block.

`src/lib/music/suggestions.ts` (new, deterministic, rule-based)
- Reads the pattern's chord sequence + song key/mode.
- Generates up to **4** variations using diatonic substitutions: relative major/minor swap, tritone sub on dominants, ii–V insertion before V, IV↔ii substitution, deceptive V→vi, secondary dominants, simple tasteful re-orderings that preserve tonal function.
- **Each variation keeps the exact chord lengths of the source pattern** (same number of slots, same `lengthBeats` per slot — only the chord identities change).
- Each suggestion: `{ label, chords: ChordSymbol[] }`.

UI (`src/components/progressions/SuggestionsPanel.tsx`):
- Up to 4 suggestion rows. Each row shows the chord chips inline + a small **play button on the right** that plays only that suggestion (uses existing `playProgression` with the suggestion's chord list and the pattern's beat layout). Pressing again stops it.
- Each row also has a "Replace" action that swaps the pattern's chords for the suggestion's chords (lengths already match, so this is a 1:1 swap).
- **Empty state**: if the generator returns zero suggestions, show a small inline message:
  > "No variations found for this progression."
  
  with a single link button **"Search Google for similar progressions"**. The link opens a new tab to a Google search built from the chord list, e.g.
  ```
  https://www.google.com/search?q=chord+progression+similar+to+C+G+Am+F+in+key+of+C+major
  ```
  (chords joined with `+`, key + mode appended for context).
- No AI calls anywhere — purely client-side music theory rules + a Google fallback link.

### Files touched / new
- `src/store/song.ts` — model change, spillover, new pattern actions, `suppressCrossTabDeleteWarning` flag (in JSON + store).
- `src/components/progressions/ProgressionsTab.tsx` — section grouping, dual delete buttons, suggestions hookup, display-name fix, section drag/sort preserved.
- `src/components/lyrics/LyricsTab.tsx` — wire confirm dialog for section + line deletes.
- `src/components/common/ConfirmDeleteDialog.tsx` — new shared confirm with "Don't show again" checkbox.
- `src/lib/music/suggestions.ts` — new rule-based generator (preserves chord lengths).
- `src/components/progressions/SuggestionsPanel.tsx` — new UI with per-row play button + Google fallback.

### Risks / notes
- Existing saved songs migrate automatically (`sectionId` fallback).
- Suppressing the dialog is reversible: we'll add a "Reset delete warnings" item to the nav menu sheet (next to Dark mode) so users can re-enable it.
- Suggestions are deterministic and offline; quality depends on the rule set, which we can extend over time.

