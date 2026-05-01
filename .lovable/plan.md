# Review: Delete Sync + Progressions Multi-Select (system + UX)

## A. Delete sync between Lyrics and Progressions

### 1. System correctness

**Actions involved:**
- Lyrics → progression: `removeChordAnchor` / `removeChordAnchorsBatch` (`song.ts` ~1420–1435).
- Progression → lyrics: `removePatternChord` / `removePatternChordsBatch` (`song.ts` ~2666–2715).

**State path:** all four mutate `section.chords` directly (the SSOT) and return `[SSOT_MODE]: true`. The wrapped `set` in `song.ts` rebuilds both `line.chords` and `pattern.chords` mirrors from the new SSOT in the same dispatch. Both views read via SSOT helpers (`getLineChordsViaSSOT`, `getPatternChordsViaSSOT`) and subscribe through `useSongStore((s) => s.sections...)`, which returns a new array reference on every change. So the underlying state IS in sync within the same render frame.

**Edge cases / bugs found:**

1. **Stale empty overflow rows (real bug, UX-visible).** When chords on a continuation row (`_isChordOverflow: true`) are deleted, the overflow row itself is NOT removed by `removeChordAnchorsBatch`. Only `autoLayoutSection` collapses it, and the existing layout watchdog only fires when `sec.chords.length` *grows* (`LyricsTab.tsx` line 1219: `if (sec.chords.length > prev) grown.push(sec.id)`). Deletes shrink, so no reflow runs → empty overflow rows linger until the next add or until "Format chords" is invoked.

2. **Stale local selection state across views (minor).** `useDndSelection` in lyrics holds anchor ids in component state; after a delete, ids of deleted chords remain in `selection.selected` until explicit `selection.clear()`. The lyrics toolbar does call `selection.clear()` after batch delete (line 636), so this is fine for lyrics. The progression `PatternBlock` also clears `selected` after batch delete (line 627). No actual leak — just brittle if a future code path forgets.

3. **Edit-mode persistence after delete.** Both tabs intentionally keep edit/select mode open after a batch delete so the user can keep working. Behaviour is symmetric — good.

4. **Cross-tab: no visual artifact, but no scroll-into-view.** If the user is on the progression tab and deletes from lyrics in another window/path, the chip simply disappears. No staleness, but also no acknowledgement.

### 2. UI interaction review

What the user experiences today:

- **Lyrics → Progression:** Delete a chord on lyrics; switch to progressions → chord is gone. Works. **BUT** if the deleted chord lived on an overflow row, the empty overflow row stays visible in lyrics until something else triggers a reflow. The user sees a ghost row with no chips — confusing and looks broken.
- **Progression → Lyrics:** Delete from a pattern block; switch to lyrics → chord is gone. Works correctly with no ghost (lyrics derives positions from the SSOT each render).
- **Multi-delete in lyrics:** All chips vanish, selection clears, edit mode stays on → correct.
- **Asymmetry:** Lyrics-side delete leaves an overflow ghost; progression-side delete does not. Feels broken in one direction.
- **No optimistic feedback:** The chord just disappears. No subtle fade/shrink. For a single chord this is fine; for batch delete on 5–10 chips it can feel jarring on touch where the press confirmation is the only signal.

### 3. Recommended fixes (priority order — UX first)

**Interaction fixes (do first):**

a. **Collapse stale overflow rows on lyrics-side delete.** In `LyricsTab.tsx`, after `removeChordAnchorsBatch` (and the single-anchor delete path used by the chord picker), call `autoLayoutSection(sectionId, window.innerWidth, 28)` on the next tick. Cheap, no schema change. This makes lyrics-side delete look as clean as progression-side delete.

b. **Make the delete feel symmetric.** Apply the same one-line post-delete reflow in both delete sites (`removeChordAnchor`, `removeChordAnchorsBatch`) inside the lyrics toolbar and the picker. Optional: add a 120ms opacity fade on chip exit using a tiny CSS transition on `[data-chip-anchor]`.

c. **Don't leave the user in edit mode with zero selectable chords.** In progression `PatternBlock`, if a batch delete removes every chord in the block, auto-`exitSelect()` (currently it only clears `selected` but stays in select mode — the toolbar then renders "0 selected" with all buttons disabled, which is dead UI).

**System fix (do second, only if needed):**

d. **Audit `removePatternChord` paths from FocusedChordEditor.** I haven't found a stale read here, but worth verifying once (a) is in. Add a temporary `console.assert` in dev that section.chords length matches what both views render.

---

## B. Progressions multi-select via pencil

### 1. System correctness

- `selectMode` + `selected: Set<string>` live in `PatternBlock` local state.
- Pencil button toggles `selectMode` on/off (line 302–310), `exitSelect()` clears both flags.
- Tap-on-chord routes through `handleChordTap`: shift = range, ⌘/ctrl = toggle, plain = exclusive single-select; tapping the only-selected chord clears it.
- Outside-pointer-down inside the same DOM exits select mode (line 154–167), explicitly excepting basket chips, dialog content, and the context-menu container (`data-progression-ctx`).
- Keyboard: Delete/Backspace deletes; +/- resize active single; Esc exits.
- Batch delete via `removePatternChordsBatch` clears `selected` but leaves `selectMode` on (line 624–628).
- "Select all" exists in the context-menu (line 527–537). Drag-to-reorder uses `Draggable`/`Droppable`; `justDraggedAtRef` (line 217) suppresses the tap-fire-after-drag race.

State machine is sound.

### 2. UI interaction review

What the user experiences:

- **Discoverability of select mode (weak).** The pencil button is in the top-right of the block header next to the trash icon. When pressed, the icon turns primary-tinted and an `aria-pressed`. But: there's no full-block visual cue (no border, no overlay) to signal "this block is in edit mode". The lyrics tab has the same problem — pencil active state is small.
- **Selected chip visual (decent but weak in dense rows).** Selected chips get `ring-2 ring-primary` (line 436). On the chord-chip's saturated background this ring is visible, but not bold. With the new chord color system (gradients, brighter fills) the primary-color ring will be even harder to see on yellow/red gradients.
- **Tap conflict — single tap auditions AND selects (intentional).** This is actually the documented behaviour ("Unified default: single tap selects this chord exclusively, opens the context menu, and auditions"). But the mental model is muddy: in **edit mode**, a tap should probably *only* select (no audition), and audition should require holding or a separate gesture. Right now playing a chord is a side effect of selecting it — that's surprising in a focused editing context.
- **Drag-to-reorder vs tap-to-select.** Pangea's drag activation distance plus the `justDraggedAtRef` 350 ms guard handle the conflict, but on touch the user can accidentally trigger a tap when they meant to drag. No visible drag handle either — the whole chip is the handle.
- **"Active" focus + sustained voice.** Tapping a chord auditions via `playChord` (one-shot). Long-press to sustain isn't wired here (it IS wired in `ChordChip`, but the progression chips use a custom `<button>`, not `ChordChip`). Inconsistent with the rest of the app.
- **Context menu lifecycle.** Menu appears whenever `selectMode` is true (line 506) regardless of selection size. With 0 selected, every action button is disabled — the menu becomes a non-functional stub. Lyrics tab does the same thing, so it's at least consistent.
- **"Done" path.** Exists in three places: pencil icon, the menu's "Done" button, Escape, and outside-tap. Good redundancy.
- **After-delete behaviour.** Stays in select mode with empty selection. UX feels stuck — same problem as lyrics.
- **Select All.** Exists (line 527). Good.
- **No "selected count + delete" floating action like a mobile mail app.** On phones, the inline toolbar is fine; no need for a sticky bar.

### 3. Recommended fixes (priority order — UX first)

**Interaction fixes (do first):**

a. **Strong selected-state visual.** Replace `ring-2 ring-primary` with a higher-contrast treatment that survives gradient backgrounds:
   - thicker ring + offset: `ring-2 ring-primary ring-offset-2 ring-offset-card`
   - plus a subtle scale: `scale-[1.04]`
   - and a small checkmark badge in the corner when in select mode.
   Apply the same to lyrics chips for consistency.

b. **In edit mode, don't audition on tap.** In `handleChordTap`, only call `playChord` when `!selectMode`. Add a tiny "tap a chord to play" hint in non-edit mode and "tap to select" hint in edit mode. Removes the dual-meaning footgun.

c. **Auto-exit select mode after destructive emptying.** After `removePatternChordsBatch`, if the block has zero chords left, call `exitSelect()`. Otherwise stay (current behaviour) so the user can keep deleting. Same fix on the lyrics side.

d. **Pencil button needs a stronger affordance.** Replace the icon-only button with a small labelled toggle when the block isn't focused: "Edit chords" / "Done". On mobile especially, a 24-px pencil icon is easy to miss.

e. **Add a block-level outline when `selectMode` is on.** Wrap the block in a `ring-2 ring-primary/40` so the user sees which block is "live".

f. **Consistency with lyrics tab:**
   - lyrics shows a "0 selected" counter and same toolbar layout — already similar.
   - lyrics' Select All is on the toolbar, not in the menu — progression has it in the same toolbar. Consistent.
   - lyrics has Copy/Cut/Paste in the toolbar; progression has Play-from-here / Move-to / Length / arrows / Delete / Done. The two toolbars are different by intent. Don't try to make them identical — but **document the difference** in tooltips.

g. **Drag affordance on touch.** Add a faint `cursor-grab` and a tiny grip dot in the chord chip's top-left that's only visible in select mode. Signals "you can drag this".

**System fixes (do second):**

h. Replace the custom `<button>` in `ProgressionsTab.tsx` (line 420–451) with `ChordChip`, then wrap with `Draggable`. This gives progression chips the same long-press-sustain behaviour as everywhere else and removes hand-rolled audio code. Caveat: `ChordChip` doesn't currently accept a sub-label like the "2b" length text — extend `ChordChip` with an optional `subLabel` prop.

i. Verify outside-tap dismissal still works after the block-outline change in (e).

---

## Implementation plan (single coordinated PR)

Order I'd implement and ship:

1. **(A-a, A-b) Reflow after lyrics delete.** ~10 LOC in `LyricsTab.tsx`, no store changes. Eliminates ghost overflow rows. Highest ROI.
2. **(B-c) Auto-exit select mode when block empties.** ~3 LOC in `PatternBlock` + lyrics toolbar.
3. **(B-b) No-audition-in-edit-mode.** ~2 LOC in `handleChordTap`.
4. **(B-a) Stronger selected ring + checkmark badge.** Shared CSS utility used by both lyrics and progression chips. Looks great with new chord colors.
5. **(B-d, B-e) Pencil affordance + block outline in edit mode.** Pure styling.
6. **(B-g) Drag grip dot on touch in edit mode.** Pure styling.
7. **(B-h) Migrate progression chips to `ChordChip` with `subLabel` prop.** Bigger refactor; ship after the above land.

Files I'd touch:
- `src/components/lyrics/LyricsTab.tsx` (post-delete reflow, auto-exit, ring class)
- `src/components/progressions/ProgressionsTab.tsx` (audition guard, auto-exit, ring/badge, pencil label, block outline, drag grip)
- `src/components/chord/ChordChip.tsx` (optional `subLabel`, optional `selected` styling)
- No store changes; no schema changes.

UX correctness > technical correctness — this plan reflects that. Ready to implement on approval.