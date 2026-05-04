# Next batch — 6 enhancements & fixes

Six independent items. Sequenced low → high blast radius. Each item is self-contained and lands in a working state.

---

## Item 1 — Metronome (header nav menu)

**Goal:** Audible click on every beat at `meta.bpm`, accent on beat 1 (+2 semitones higher), governed by `meta.beatsPerBar`.

**Where the control lives**

- Inside the existing `Menu` sheet in `TransportHeader.tsx`, **above** the BPM and Time-Signature controls.
- Toggle (Switch) labelled "Metronome", plus a small volume slider (0–100%).

**Engine**

- New file `src/lib/audio/metronome.ts` exporting `startMetronome(opts)` / `stopMetronome()`.
- Uses the shared `AudioContext` from `src/lib/audio/context.ts` (so volume sits inside the existing master chain — connect to `voiceBus` or directly to `destination` based on volume control).
- Click = short oscillator + envelope (sine, 5 ms attack / 60 ms decay).
  - Beat 1: `880 Hz * 2^(2/12)` (= +2 semitones above the standard 880 Hz accent tone).
  - Other beats: `880 Hz`.
- Scheduler: lookahead loop (every 25 ms, schedule clicks ≤100 ms ahead) — avoids `setInterval` jitter and stays in sync if BPM changes mid-play.

**Store**

- New `useMetronomeStore` (`src/store/metronome.ts`) with `enabled`, `volume`, `setEnabled`, `setVolume`. Persist to `localStorage` like `defaults.ts`.
- React effect in `TransportHeader` watches `(enabled, isPlaying, bpm, beatsPerBar)` and calls `startMetronome` / `stopMetronome`.
- Optional standalone preview tick when toggled on while not playing (single beat audition).

**Exit criteria**

- Toggle ON + Play → audible click at correct BPM, every `beatsPerBar` beats has a higher-pitch accent.
- Changing BPM mid-playback updates click rate within 1 beat.
- Toggle OFF immediately stops clicks; song audio unaffected.

---

## Item 2 — Lyrics drag visual offset (still broken)

**Goal:** Dragged lyric-row chip stays under the finger from frame 1.

**Diagnosis recap**

- Phase 1 (Progressions) fix worked, lyrics version did not. Root cause is different here: the lyric Draggable is wrapped in a slot whose width changes (`w-7` → `w-10`) the moment the chip leaves layout flow, and the chip is centred inside a parent `div` rather than positioned absolutely. Pangea's transform is calculated against the original parent rect, so when the parent shrinks the snapshot, the visual jumps.

**Fix — backup plan: portal renderClone to body**

- `LyricsTab.tsx` lines 458–525: convert the `Draggable` from inline render to `renderClone`.
- The `renderClone` returns the same chip but is portalled to `document.body`, so its position is computed against the viewport, not the (now collapsed) slot. This is the recommended pangea pattern for chips inside a flex/grid where parent geometry mutates during drag.
- Inline render still draws the resting chip; clone replaces it during drag.

**Belt-and-braces (only if portal clone alone doesn't fully resolve):**

- Stabilize slot width during any active drag: `(occupied || isAnyDragging) ? "w-10" : "w-7"` so the slot doesn't shrink under the moving chip.

**Files**

- `src/components/lyrics/LyricsTab.tsx` (Draggable block ~458–525, slot className ~430–445).

**Exit criteria**

- Press-hold + drag any lyric chip → chip tracks finger frame 1, no jump to top-left.
- Drop targets (slots) still highlight correctly; multi-drag "+N" badge still shows on the clone.

---

## Item 3 — Progressions tab: drag-to-reorder pattern blocks (single drag only)

**Goal:** Long-press a pattern block header → drag → reorder within the section. No multi-select.

**Scope**

- Reorder applies to **pattern blocks within a section**, single-drag only.
- Section reorder (already covered by sortMode arrows) stays untouched.
- No multi-select pattern: any tap-and-hold on a pattern block immediately initiates a single drag.

**Implementation**

- In `SectionGroup` (`ProgressionsTab.tsx` ~732), wrap `blocks.map(...)` in a new `Droppable` with `droppableId={`patternblock:${sectionId}`}` and `type="patternblock"` (separate `type` from the existing `type="chord"` so chord drags don't try to drop into the block-list droppable).
- Each `PatternBlock` gets a `Draggable draggableId={`patternblock:${p.id}`}` with `index={i}`.
- The drag handle is the section-block header strip (small grip icon `GripVertical`, only visible on hover/touch). Avoids hijacking taps on chord cells.
- Add a new tab-level handler in `ProgressionsTab.onDragEnd`: when `dst[0] === "patternblock"`, call a new store action `reorderPatternBlockInSection(sectionId, fromIndex, toIndex)`.

**Store**

- `src/store/song.ts`: add `reorderPatternBlockInSection(sectionId, from, to)`. Mutates the relative order of `progression[]` entries whose `sectionId === sectionId`. Pushes history.

**Exit criteria**

- Long-press grip on Block 2 → drag above Block 1 → order swaps; Lyrics view syncs accordingly after drag to reorder.
- Chord drags still work inside the same section (different `type` keeps droppables separate).
- Section reorder via sortMode arrows still works.

---

## Item 4 — Move chord into previous pattern block when space allows

**Goal:** When a chord is dragged off the left edge of its current pattern block, or when the left arrow is pressed in the context menu, accept the drop into the **previous** block if it has free beats.

**Behaviour**

- Already supported: cross-block drop already calls `movePatternChordToPatternAt` with capacity check (`ProgressionsTab.tsx` lines 1022–1042). Item is really about **discoverability and edge-of-block UX**.
- Add a thin "drop strip" droppable to the left of each block (and optionally to the right) with `droppableId={`pattern:${prevPatternId}:append`}`. When a chord is dragged over it, or when the the left arrow is pressed in the context menu,  it appends to the previous block at the next free slot if capacity allows; otherwise shows a destructive ring.
- Reuse the existing `addChordToPatternSlot` / `movePatternChordToPatternAt` logic; just translate `:append` → `prevPattern.bars * prevPattern.beatsPerBar - freeSlot` in the drag-end handler.

**Files**

- `src/components/progressions/ProgressionsTab.tsx`: render a 12px-wide droppable before/after the slot grid in `PatternBlock`.
- `src/components/progressions/ProgressionsTab.tsx onDragEnd`: handle `:append` suffix, compute target slot, validate fit, call existing store action. No new store action needed.

**Exit criteria**

- Block A (4 beats free) | Block B (chord X). Drag X onto strip immediately right of A → X moves into A's first free slot.
- If A has no room → strip turns red, drop is rejected with toast.
- Existing in-block reorder and full cross-block drop unaffected.

---

## Item 5 — Typing "/" in a lyric textarea opens a "New Section" dialog

**Goal:** Anywhere in a lyric textarea, pressing `/` (always intercepted) opens a dialog with the same section-type selector used elsewhere (verse, chorus, pre-chorus, bridge, intro, outro, custom).

**Implementation**

- `LyricsTab.tsx` `<textarea>` `onKeyDown` (line ~695): if `e.key === "/"`, `e.preventDefault()` and open a new local dialog state `slashDialog = { afterLineId: line.id }`.
- New `Dialog` reuses the existing `Select` over `SECTION_TYPES` (already defined at line 98) plus an optional custom name input(when type is `custom`).
- On accept: call `addSection(type, label?)` (already exists, line 1126 of `song.ts`) and add an empty first lyric line. The new section is appended after the current section by default; a follow-up enhancement could support insertion-at-position, but per the request just create the section.

**Edge cases**

- Always intercepts `/` even mid-word (per user choice). Users who actually want a slash character can paste it — acceptable trade-off.
- Composition-IME safety: skip when `e.isComposing` to avoid breaking IME input.

**Exit criteria**

- Type `/` in any lyric line → dialog opens, focus on selector.
- Pick "Chorus" → new chorus section appended; dialog closes; original lyric line unchanged (no `/` inserted).
- Cancel → no mutation.

---

## Item 6 — Landing page at `/` (editor moves to `/app`)

**Routes (`src/App.tsx`)**

- `/` → new `Landing.tsx`
- `/app` → existing `Index.tsx`
- `/defaults` and `*` unchanged.

**Landing page contents (`src/pages/Landing.tsx`)**

- Header: "SongNote" wordmark + tagline.
- Description block with three cards: **Lyrics** / **Chords** / **Progressions**, each with 1-line role + "Open" button → navigates to `/app` and pre-selects that tab via URL state (`/app?tab=lyrics`).
- "Set as default view" toggle next to each tab card (radio group: lyrics/chords/progressions/landing). Stored in:
  1. `useDefaultsStore` (new field `defaultLandingTab: "lyrics" | "chords" | "progressions" | null`), and
  2. mirrored into the song save-file JSON via `meta.defaultTab` so opening a project respects the song's preferred tab (project setting overrides global if present).
- Recent projects list: read from `localStorage` only.
  - New helper `src/lib/recent-projects.ts` exporting `pushRecent({ name, savedAt, snapshot })` and `listRecent(): RecentProject[]`.
  - Hook into the existing autosave path (`startAutosave` in `song.ts`) and into `loadProjectFromFile` to record entries.
  - Each entry: `{ id, name, savedAt, snapshot }` (full song JSON in localStorage; cap list at 10).
  - Click a recent → load snapshot into store → navigate to `/app`.
  - "No recent projects" empty state.

**Index.tsx changes**

- On mount, if URL has `?tab=…`, set initial tab from it.
- Continue writing to localStorage so the landing's recent list stays fresh.
- If `meta.defaultTab` (from loaded project) or `defaultLandingTab` is set, use it to initialize the tab.

**Backend?** Not needed — user picked "Local only". Leave a `// TODO: cloud sync` comment in `recent-projects.ts` as a clean integration point.

**Exit criteria**

- Visiting `/` shows landing with three tab cards, default-tab toggle, and recent projects (or empty state).
- "Open Lyrics" button → `/app?tab=lyrics` lands on the editor with Lyrics active.
- Default tab toggle persists across reloads.
- Loading a song-file with `meta.defaultTab` set opens that tab automatically.
- Direct navigation to `/app` still works.

---

## Phase order

```text
Item 1 (metronome)            ── isolated audio module
Item 2 (lyrics drag fix)      ── isolated, unblocks DnD QA
Item 3 (block reorder)        ── new droppable type, contained
Item 4 (cross-block move UX)  ── builds on Item 3 droppables
Item 5 (slash → new section)  ── single textarea handler + dialog
Item 6 (landing page)         ── new route, no risk to editor
```

Items 1–5 ship inside the existing editor. Item 6 changes routing — done last so any regression is obvious in isolation.

## Cross-cutting risks

- **Item 3 droppable types**: must use `type="patternblock"` distinct from chord drops, otherwise a dragged chord could land in the wrong droppable.
- **Item 5 IME**: skip `/` interception when `e.isComposing` to protect IME users.
- **Item 6 storage size**: cap recent projects list at 10 and store snapshots compressed-as-JSON only (no images/binary).