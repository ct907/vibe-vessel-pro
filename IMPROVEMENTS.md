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

## 2. Capture speed — ⬜ todo

- ⬜ Open straight into the lyric editor on a fresh song (remove the extra "Write
  Lyrics" reveal tap). (`components/write/WriteMode.tsx`)
- ⬜ Ungate "Add Section" / "Edit Chords" so chords can be sketched before lyrics.
  (`components/write/WriteStickyBar.tsx`)
- ⬜ Optional "auto-transcribe after recording" to collapse the record→menu→drag
  flow. (`components/write/RecordingsStrip.tsx`)
- ⬜ Group lyric text edits into one undo step per focus/blur cycle. (`store/song.ts`)

## 3. Unify playback — ⬜ todo

- ⬜ One transport plays the synth progression **and** recorded tracks together,
  mixed. (`components/header/TransportHeader.tsx`, `lib/music/audio.ts`,
  `lib/audio/recordings-engine.ts`)
- ⬜ Per-block "play this progression" audition button. (`components/progressions/ProgressionsTab.tsx`)
- ⬜ Apply tempo changes mid-playback. (`components/header/TransportHeader.tsx`)

## 4. Export roadmap — ⬜ todo

- ⬜ **ChordPro export** (chords-over-lyrics, the performance lingua franca). All
  the data exists in `SectionChord`. (`lib/lyrics/export.ts`)
- ⬜ **MIDI export** (chord track + tempo/time-sig meta, later a melody track).
- ⬜ Per-track WAV stem export via `OfflineAudioContext` for DAW handoff.

## 5. Polish — ⬜ todo

- ⬜ Melody-to-notes transcription using the existing pitch detector
  (`lib/audio/pitch-detector.ts`), not chords-only.
- ⬜ Warn before destructive time-signature re-flow. (`store/song.ts setTimeSignature`)
- ⬜ Wire or remove the per-section arpeggiator toggle. (`components/progressions/ProgressionsTab.tsx`)
- ⬜ Backgrounding/lock protection: finalize + save a recording on `visibilitychange`.
- ⬜ Cross-tab edit protection (single localStorage slot is last-write-wins).
</content>
</invoke>
