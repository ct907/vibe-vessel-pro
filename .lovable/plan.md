# Songwriter's Notebook

A single-song workspace with three tabs (Lyrics, Chords, Progressions), a global transport header, and a chord "basket" that ferries selections between tabs. Warm paper-notebook aesthetic, Tone.js piano synth, JSON project save/load.

## Visual direction

To create editable tokens for colours used.

- Cream paper background (`#f5efe1`-ish), warm ink foreground, faint ruled lines on the lyrics page
- Headings: a serif display face (Fraunces); body: humanist sans (Inter); chord tokens & monospace bits: JetBrains Mono
- One warm accent (burnt amber) for active state, transport, and selected chips
- Subtle grain texture overlay on the main canvas; soft shadows, rounded-md corners
- All colors driven by HSL tokens in `index.css` (no hardcoded hex in components)

## Global header (sticky top)

```text
[ Notebook ▸ Untitled ]  [♭ Key: C maj ▾] [BPM 92 ─●──]  [⇩ ⇧ Transpose]  [▶ Stop ■]  [Save ▾ Load]
```

- Key selector (12 roots × maj/min)
- BPM number + slider (40–220)
- Transpose ± semitone buttons retune the song's key and shift every stored chord
- Play/Stop drives the Progressions timeline (Tone.Transport)
- Save → downloads `song.json`; Load → file picker reads JSON back into state
- Tabs: Lyrics · Chords · Progressions

## Tab 1 — Lyrics

- Document of "lines". Each line renders two stacked rows: a **chord row** (clickable slots above syllables) and the **lyric row** (editable text)
- Typing in the lyric and chord row behaves like a normal editor (Enter = new line, Backspace merges)
- Tap a position in the chord row → chord picker sheet opens at that caret offset; chosen chord is anchored to that character index and follows the text as it edits
- Tap a placed chord → preview sound; long-press (or right-click) → reopen sheet to change/delete
- Inline recognition: typing a chord token directly in the lyric row inside `[...]` (e.g. `[Fmaj7]`) auto-converts into a chord block at that position (Notion-style); the parser strips the brackets and inserts a chord chip
- The chord picker sheet (bottom Sheet on mobile, Popover on desktop):
  - Search input at top; empty state shows "Type a chord… e.g. Bbm9, Fmaj7"
  - Live parser interprets tokens: root (`A–G`, `#`/`b`), quality (`maj`, `m`, `dim`, `aug`, `sus2/4`), extensions (`6, 7, 9, 11, 13`, `maj7`, `add9`)
  - Single letter (e.g. `B`) → grid of all common qualities under that root
  - Each result row: chord name, voicing preview button (▶), tap to insert
  - Chord picker sheet should appear above keyboard in mobile.

## Tab 2 — Chords

- Header strip shows the current key and a Nashville-numbered diatonic ladder: `I ii iii IV V vi vii°` mapped to actual chord names in that key
- Below: a grid of chord cards grouped by function (Tonic / Subdominant / Dominant / Borrowed / Extensions)
- Card interactions:
  - Tap → audition (plays voicing)
  - Checkbox / long-press → multi-select; selected cards highlight in amber
- A "Quality" filter row: triads · 7ths · 9ths · sus · dim/aug
- Selected chords flow into the **Basket toolbar**

## Basket toolbar (persistent, bottom)

- Visible across all tabs once anything is selected
- Shows chord chips with × to remove, count, and two actions:
  - **Send to Lyrics** → chips become draggable into chord slots in the Lyrics tab
  - **Send to Progressions** → chips appear in the Progressions tab's tray
- "Clear" empties the basket

## Tab 3 — Progressions

- A song is a list of **Pattern blocks**. The song can be configured to have settings for all pattern blocks: bar count (1–16, editable), and a time signature (default 4/4, 3/4, 6/8, 4/8)
- Each block has:
  - A horizontal bar grid showing beats; chords sit on the grid with a duration in beats
- Interactions:
  - Drag chord chips from the basket tray (right side) into a block to drop on a beat.
  - Type in chords and place chords from modal sheet (similar to chord row typing interaction)
  - When chords are added, the default value is 2 beats. the length of the chord added in the pattern block appears as a percentage of the total length. E.g. if the chord is 2 beat, and the pattern block is 8 beats per bar, the chord takes up 25% of total pattern block space.
  - Click a placed chord → contextual menu **below the block**: change duration (½, 1, 2, 4 beats…), move left/right, delete, replace via picker
  - Press + and - buttons underneath chord to resize duration in 0.5 beat increments.
  - "+ Add pattern" button between/after blocks
- Playback: the global ▶ schedules every block in order via Tone.Transport at the current BPM, looping the section under the playhead; a moving playhead line traces the active block

## Audio engine

- Tone.js `PolySynth` (triangle/sine blend with gentle envelope = "soft piano")
- Single shared engine module exposes `playChord(symbol, durationBeats?)` and `scheduleProgression(blocks, bpm)`
- Chord symbols → notes via a chord-resolver utility (root + quality table → MIDI note set, voiced around C4)

## Save / Load (JSON)

- One project shape:

```text
{ version, meta:{title, key, bpm}, lyrics:[lines+chord anchors], chordsTabState:{filters}, progression:[blocks] }
```

- Save = `Blob` download `song.json`; Load = `FileReader` + zod-validated parse
- Auto-persist current project to `localStorage` on every change so a refresh never loses work
- (Future: zip with audio — out of scope now, structure leaves room)

## Technical breakdown

- **State**: a single `useSongStore` (zustand) holding meta, lyrics, basket, progression — keeps cross-tab handoffs simple
- **Routing**: stays on `/`; tabs via shadcn `Tabs`
- **New files**:
  - `src/lib/music/chords.ts` — parser + chord→notes resolver + nashville helpers
  - `src/lib/music/audio.ts` — Tone.js singleton + scheduling
  - `src/lib/persistence.ts` — JSON save/load + localStorage autosave + zod schema
  - `src/store/song.ts` — zustand store
  - `src/components/header/TransportHeader.tsx`
  - `src/components/basket/BasketBar.tsx`
  - `src/components/lyrics/LyricsTab.tsx`, `LyricLine.tsx`, `ChordPickerSheet.tsx`
  - `src/components/chords/ChordsTab.tsx`, `NashvilleLadder.tsx`, `ChordCard.tsx`
  - `src/components/progressions/ProgressionsTab.tsx`, `PatternBlock.tsx`, `ChordCellMenu.tsx`
  - `src/pages/Index.tsx` — composes header + tabs + basket
- **Design system updates**: extend `index.css` with paper/ink/amber HSL tokens + ruled-paper background utility; map Tailwind colors in `tailwind.config.ts`; add Google Fonts (Fraunces, Inter, JetBrains Mono) in `index.html`
- **Deps to add**: `tone`, `zustand`, `zod`, `@dnd-kit/core` (for drag into Progressions), `nanoid`
- **Out of scope this build**: audio recording, multi-song library, accounts, MIDI export

## Open assumption (proceeding unless you say otherwise)

- Multi-select in the Chords tab uses an explicit "Select" toggle on each card (clearer than long-press on desktop). Tap-to-audition stays the default.