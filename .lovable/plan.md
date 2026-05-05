
# Round of bug fixes & enhancements

Grouped into three phases. Each item lists only the files and key logic.

## Phase 1 — DnD, slash key, metronome timing (correctness)

### 1. Lyrics drag still offset on mobile + ghost still visible
`src/components/lyrics/LyricsTab.tsx`
- The portalled clone uses pangea's `draggableProps.style` (transform from item origin). On mobile this still drifts because the source slot collapses. Fix by computing the clone position from `e.clientX/clientY` (pointer-following ghost):
  - Track `pointerPos` via `pointermove` listeners installed on drag start (using `onDragStart` from the global DnD context, exposed via `useDndStore`).
  - In the portalled clone, override `style.transform = translate3d(${x - w/2}px, ${y - h/2}px, 0)` and `style.position: fixed; top: 0; left: 0`.
  - Hide the original chip while dragging: in `renderChip`, when `dragSnapshot.isDragging && !portalled`, render an empty placeholder div of the same size instead of the chip.

### 2. Progressions drag-to-reorder broken (focus theft)
`src/components/progressions/ProgressionsTab.tsx`
- Pattern block `<div>` and `<button>` chords have implicit focus traps. Pangea's draggable only accepts pointer-down on a non-interactive ancestor; the chord `<button>` inside captures pointer events first.
- Fix: remove implicit focusability when not in sort/edit mode:
  - On the section card root, only set `tabIndex={0}` when `sortMode` is on; otherwise `tabIndex={-1}`.
  - On `PatternBlock` root, do not set tabIndex; ensure the chord chip `<button>`s only get `dragHandleProps` when `selectMode` (pencil) is OFF — currently they always have it. Wrap chord chip with non-button element while still draggable (`<div role="button">`) so the GripVertical handle on the parent block stays the only drag affordance for block reorder.
  - Add `data-no-block-drag` regions; the block `Draggable` already only listens on `blockDragHandleProps` (GripVertical). Verify the GripVertical still receives the pointerdown by ensuring no parent `onPointerDownCapture` returns early.

### 3. Auto-create lyric row when chord row overflows / appends
`src/store/song.ts`
- After `placeChordInSlot`, `moveChordToSlot`, `pasteChordsAt`, `upsertChordAt` and after auto-layout: if the chord lands in the last `_isChordOverflow` row OR creates one, ensure the *next* line exists. Update `autoLayoutSection`'s overflow synth pass to also append a fresh empty lyric line (non-overflow) after the last overflow line if absent.

### 4. Mobile `/` key doesn't trigger new-section dialog
`src/components/lyrics/LyricsTab.tsx`
- Mobile soft keyboards fire `keydown` with `key=""` or `Unidentified`. Detect via `onBeforeInput` instead:
  - Add `onBeforeInput={(e) => { if (e.data === "/") { e.preventDefault(); openSlashDialog(); } }}` to the lyric `<textarea>`. Keep the existing `onKeyDown` path for desktop.

### 5. Metronome aligns with first note
`src/components/header/TransportHeader.tsx`, `src/lib/audio/metronome.ts`
- Currently metronome starts ~50ms ahead of `playProgression()` (separate timing origins). Fix by starting both from the same anchor:
  - Add `startMetronome({ ..., startAt })` parameter using shared `getAudioContext().currentTime + lookahead`.
  - In `handlePlay`, after `await ensureAudio()` capture `startAt = getAudioContext().currentTime + 0.1`. Pass to `Tone.Transport.start("+0.1")` (Tone accepts time string) and to `startMetronome({ startAt })`. Both then schedule against the same clock.

## Phase 2 — Sound: Pan-Delay-To-The-Beat

### 6. Pan delay sweep
`src/store/sound.ts`, `src/lib/audio/context.ts`, `src/components/sound/SoundPanel.tsx`, `src/lib/music/audio.ts`
- `FX`: add `delayPan: boolean` (default false).
- `MasterChain`: convert delay output path to stereo —
  - Insert `panner = ctx.createStereoPanner()` between `delay` and `delayWet`.
  - Add an LFO `panLfo = ctx.createOscillator()` (triangle) → `panLfoGain` → `panner.pan` with depth 1.0 (so pan sweeps fully -1..+1 = 100L..100R).
  - Expose `setDelayPan(enabled, bpm)`: when enabled, `panLfo.frequency = bpm/60 / 4` (one full L→R→L cycle per bar at 4/4 — uses song's `beatsPerBar` from caller); set gain to 1; when disabled, gain to 0 and pan to 0. Source signal stays unaffected because LFO only modulates `panner` on the wet path.
- `applyFX`: call `setDelayPan(fx.delayPan, bpm * (4/beatsPerBar))` so cycle = 1 bar. Pass beatsPerBar through.
- SoundPanel: Add Switch labeled "Pan Delay To The Beat" inside Delay section.

## Phase 3 — Desktop chord picker, octave, edit mode

### 7. Edit-mode arrow keys reorder chord (lyrics + progressions)
`src/components/lyrics/LyricsTab.tsx`, `src/components/progressions/ProgressionsTab.tsx`
- When pencil edit mode is on with single selection, attach a `keydown` handler to `window`: ArrowLeft/Right calls `moveChordToSlot` (lyrics) or `movePatternChord` (progressions). Already exists in toolbar buttons — just bind keys to those handlers and gate by `isEditMode && selectedIds.length === 1` and check `document.activeElement` isn't a textarea/input.
- SSOT updates already cascade across views.

### 8. Desktop chord-picker max-height = 50vh
`src/components/chord/ChordPickerSheet.tsx`
- For `!isMobile`, override `sheetMaxHeight = window.innerHeight * 0.5` and `gridMaxHeight` accordingly.

### 9. Octave setting in chord context menu (sticky default)
`src/store/sound.ts` (or a new `src/store/chord-prefs.ts`), `src/components/lyrics/LyricsTab.tsx`, `src/components/progressions/ProgressionsTab.tsx`
- New persisted store `useChordPrefsStore` with `defaultOctave: number` (default 4).
- All call sites that add a chord via picker (`placeChordInSlot`, `addChordToPatternSlot`, etc.) read `defaultOctave` and store it as a per-chord-anchor `octave?: number` on `ChordAnchor`/`PatternChord`/`SectionChord`.
- Render in the edit-mode toolbar (both tabs): `<Select>` Oct 2/3/4/5/6. Selecting changes `defaultOctave` AND applies to all currently-selected chords (`updateChordOctave(ids, oct)` action on song store).
- `playChord(chord, dur, octave)` already accepts octave — pass anchor's stored octave, falling back to `defaultOctave`.

### 10. Desktop: chord click opens picker (not FocusedChordEditor)
`src/components/lyrics/LyricsTab.tsx`, `src/components/progressions/ProgressionsTab.tsx`
- Lyrics tab: chord chip onClick already calls `onPickerOpen` — verify it never routes to FocusedChordEditor when `!isMobile`. Currently `LyricsTab` only opens picker (good). FocusedChordEditor is invoked from `ProgressionsTab.handleChordTap` → `onEditChordOpen`.
- In ProgressionsTab `handleChordTap`, if `!isMobile && !selectMode` open the chord picker for replacement instead: call `openPicker(pattern.id, c.startBeat, c.id)` (passes `replaceChordId`).

### 11. Desktop: chord picker grid 4 columns
`src/components/chord/ChordPickerSheet.tsx`
- Desktop grid: change `grid-cols-2 sm:grid-cols-3` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` (or simply `grid-cols-4` when `!isMobile`).

### 12. Desktop: scroll active row to 30% viewport on edit
`src/components/lyrics/LyricsTab.tsx`, `src/components/progressions/ProgressionsTab.tsx`
- New helper `scrollRowToTop(el, fraction = 0.3)`: `const rect = el.getBoundingClientRect(); window.scrollBy({ top: rect.top - window.innerHeight*0.3, behavior: "smooth" });`.
- Call it in:
  - LyricsTab `onChordFocus` and `onPickerOpen` (desktop only) using `rowRef.current`.
  - ProgressionsTab `handleChordTap` (desktop only) using `blockRef.current`.

### 13. Desktop: chord picker 75% screen width
`src/components/chord/ChordPickerSheet.tsx`, `src/components/ui/sheet.tsx`
- The bottom sheet defaults to full width. On desktop, override `SheetContent` className via `style={{ width: "75vw", marginLeft: "auto", marginRight: "auto" }}` and add `left-[12.5vw] right-[12.5vw]` (override default `inset-x-0`). Keep mobile full width.

---

## Implementation order

1. **Phase 1** (correctness fixes) — biggest user-visible breakage.
2. **Phase 2** (Pan Delay) — isolated audio change.
3. **Phase 3** (desktop polish + octave) — UX layer.

After Phase 3, I will append a one-paragraph note to `.lovable/plan.md` recording these fixes.
