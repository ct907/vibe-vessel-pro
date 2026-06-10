# Vibe Vessel — UX & Functionality Improvement Backlog

Living checklist from the codebase review. Target user: a songwriter **away from
their instrument** who needs to jot down inspiration fast; the app also supports
mocking up arrangements, with a roadmap toward chord-tab export (performance) and
DAW handoff (post-production).

Status legend: ⬜ todo · 🟡 in progress · ✅ done

---

## 1. Capture safety (data-loss prevention) — ✅ done

The product promise is "your idea is safe." These are the highest-priority fixes.

- ✅ **Persist recordings + takes across refresh.** Take/track metadata lived only
  in memory, so a page refresh wiped the recordings strip even though the audio
  blobs survived in IndexedDB. Now persisted to localStorage (reference-guarded so
  playback/level updates don't hammer it) and rehydrated on load.
  (`store/takes.ts`, `store/recordings.ts`, `App.tsx`)
- ✅ **Toast on mic-permission failure.** `RecordFab` no longer silently no-ops;
  it shows an actionable toast. (`components/write/RecordFab.tsx`)
- ✅ **Snapshot before "New Song".** `Landing.startWriting`, `Landing.openRecent`,
  and `VoiceKeyTab.applyKeyToNewSong` now call `commitCurrentSongToRecents()`
  before `resetSong()`/`loadFromJSON`, and clear takes/recordings for a clean
  slate. (`store/song.ts`, `pages/Landing.tsx`, `components/voicekey/VoiceKeyTab.tsx`)
- ✅ **Surface storage-quota failures.** Autosave catches now call a shared
  `notifyStorageQuota()` that warns the user once per session.
  (`store/song.ts`, `store/takes.ts`, `store/recordings.ts`, `lib/storage-quota.ts`)
- ✅ **Reclaim orphaned audio blobs.** `pruneOrphanBlobs` now runs on startup after
  hydration, referencing every blob still held by a take or clip.
  (`App.tsx`, `store/recordings.ts`, `lib/audio/blob-store.ts`)
- ✅ Updated the now-inaccurate "recordings are cleared on page refresh" notice in
  the recordings strip. (`components/write/RecordingsStrip.tsx`)

## 2. Capture speed — ✅ done

Per user decision: keep progressive disclosure (tap cards stay), but make each
card a one-tap action with helper text telegraphing it.

- ✅ "Write Lyrics" card reveals the editor **and focuses the first line** (caret
  ready); "Add Recording" card reveals the strip **and starts recording
  immediately** (via `requestStickyBarRecording()`, dispatched within the tap
  gesture so mic-permission rules apply). Cards show "Tap to start typing" /
  "Tap to start recording" hints. (`components/write/WriteMode.tsx`,
  `components/common/EmptyTapCard.tsx`, `components/write/WriteStickyBar.tsx`)
- ✅ Ungated "Add Section" / "Edit Chords" — always visible in the sticky bar.
  Using them notifies the parent (`onEditorAction`) to reveal the card-gated
  editor so a new section is never invisible. (`components/write/WriteStickyBar.tsx`,
  `components/arrange/ArrangeMode.tsx`)
- ✅ Transcription surfaced: visible ✨ "Detect chords" button on each take card
  (kept in ⋮ menu too) plus a persisted "Auto-detect" toggle in the strip header
  (off by default) that transcribes new takes as they land — covers record and
  import paths. (`components/write/RecordingsStrip.tsx`, `store/transcription.ts`)
- ✅ Lyric typing coalesces into one undo step per burst (3s idle window, broken
  by any other edit or undo/redo) instead of one step per keystroke.
  (`store/song.ts`)

## 3. Unify playback — ✅ done

- ✅ One transport plays synth progression AND recorded tracks together — was
  already wired in `handlePlay` (recordings engine starts at the same AC time as
  the chord scheduler). Confirmed no work needed.
- ✅ Per-section play button added to every section group header in Arrange/
  Progressions. Button is disabled when the section has no chords; lights amber
  while that section is the current playing section. Click sets the start-from
  anchor to the section's first chord and fires `lovable:request-play`.
  (`components/progressions/ProgressionsTab.tsx`)
- ✅ Tempo changes apply to running playback without stopping it.
  `updateScheduledBpm` adjusts `schedOriginAcTime` so the current beat position
  is preserved at the new BPM; `updateEngineBpm` updates the recordings loop
  duration, letting the current loop finish and rescheduing future iterations.
  (`lib/music/audio.ts`, `lib/audio/recordings-engine.ts`,
  `components/header/TransportHeader.tsx`)

## 4. Export roadmap — 🟡 in progress

- ✅ **ChordPro export** (chords-over-lyrics, the performance lingua franca).
  `exportLyricsAsChordPro()` inlines `[Chord]` markers at the correct lyric
  character positions from `lyricsPlacement.slotIndex`; emits `{title}`,
  `{key}`, `{tempo}`, `{start_of_verse/chorus/bridge}` / `{comment}` directives.
  Export sheet now offers a Plain text / ChordPro format toggle and a Download
  button (`.txt` or `.cho`). (`lib/lyrics/export.ts`,
  `components/lyrics/ExportLyricsSheet.tsx`)
- ⬜ **MIDI export** (chord track + tempo/time-sig meta, later a melody track).
- ⬜ Per-track WAV stem export via `OfflineAudioContext` for DAW handoff.

## 5. Polish — ✅ done

- ✅ **Melody-to-notes transcription.** New `detect-melody.ts` runs autocorrelation
  frame-by-frame over a downsampled take (16 kHz) in a Web Worker, applies a
  median filter to kill octave flickers, and segments voiced frames into discrete
  MIDI notes. `transcribeMelodyBlob()` added to `lib/music/transcribe.ts`.
  RecordingsStrip exposes a "Transcribe Melody" menu item and renders a scrollable
  note-strip with a one-tap Copy button below each take.
  (`lib/music/detect-melody.ts`, `lib/music/detect-melody.worker.ts`,
  `lib/music/transcribe.ts`, `store/transcription.ts`,
  `components/write/RecordingsStrip.tsx`)
- ✅ **Warn before destructive time-signature re-flow.** Changing time signature
  when sections have placed chords now shows an AlertDialog explaining that chords
  will be reset to the start of their section before applying. No dialog is shown
  for songs without placed chords. (`components/song/SongAttributesMenu.tsx`)
- ✅ **Arpeggiator toggle is already wired.** Confirmed: `sectionArpArmed()`
  is read per event in the chord scheduler, routing to `spawnArpForEvent` vs
  `spawnChord` based on the section's `arpArmed` flag. Both ProgressionsTab and
  LyricsTab expose the toggle. No changes needed.
- ✅ **Backgrounding/lock protection.** All three recording surfaces now listen for
  `visibilitychange` and call their respective stop/finalize path when the document
  is hidden, saving the in-progress take instead of letting the browser kill it.
  (`components/write/WriteStickyBar.tsx`,
  `components/arrange/TrackTimeline.tsx`,
  `components/recordings/RecordingsTab.tsx`)
- ✅ **Cross-tab edit protection.** `startCrossTabWarning()` listens for
  `storage` events on the song key; fires a persistent toast the first time
  another tab writes to the slot, warning that last-writer-wins. Wired in App.tsx.
  (`store/song.ts`, `App.tsx`)
