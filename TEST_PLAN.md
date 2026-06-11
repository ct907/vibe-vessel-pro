# Vibe Vessel — User Test Plan

A walkthrough of every implemented feature as **user stories** and **user flows**,
for manual verification. Each entry reads:

> **Feature / Surface**
> _User wants to…_
> _How they do it / what happens._

Status column for your run: ✅ works · ⚠️ partial · ❌ broken · — not tested

---

## 0. Landing / Home (`/`)

**Start a brand-new song by recording.** ☐
User wants to capture a melody idea immediately on opening the app.
On the Landing page, tapping **"Tap/Click to Start Recording"** resets to a clean
song and opens Write mode with recording armed (`?capture=record`).

**Start a brand-new song by writing.** ☐
User wants to jot down a lyric line first.
Tapping **"Tap/Click to Write Lyrics"** opens Write mode with the lyric editor
revealed and the first line focused (`?capture=lyrics`).

**Explore chords without committing to a song.** ☐
User wants to browse the chord encyclopedia.
Tapping **"Explore Chords"** opens the Explore Chords overlay (`?tab=chords`).

**Find their singing key and range.** ☐
User wants to discover their vocal key before writing.
Tapping **"Find Your Key & Range"** opens the Voice/Key tool (`?tab=voicekey`).

**Reopen a recent project.** ☐
User wants to continue a song they worked on earlier.
Under **Recent Projects**, tapping a project name loads its snapshot and navigates
into the app. Tapping the **⋮ → "Remove from recents"** deletes it from the list.

**Not lose unsaved audio when leaving the current song.** ☐
User has recordings in the current session and opens a recent/new song.
A **"Leave this song?"** dialog appears with **Cancel / Save first / Discard &
continue**. "Save first" downloads the project ZIP before proceeding.

---

## 1. Write & Record mode (Tab "1. Write and Record")

### 1a. Capture cards (empty state)

**Reveal the lyric editor with one tap.** ☐
User sees the empty workspace and wants to start typing.
Tapping the **"Write Lyrics"** card (hint: "Tap to start typing") reveals the
editor and focuses the first lyric line.

**Start recording with one tap.** ☐
User wants to record without hunting for a button.
Tapping the **"Add Recording"** card (hint: "Tap to start recording") reveals the
recordings strip and immediately begins recording (within the tap gesture so mic
permission is granted in-context).

### 1b. Lyrics

**Continue writing after the first line.** ☐
User wants a new lyric line.
In the lyric line, pressing **Enter/Return** creates a new line below and focuses it.

**Merge a line back up.** ☐
User wants to remove an accidental line break.
Pressing **Backspace** at the start of an empty line merges it into the previous line.

**Type without flooding undo history.** ☐
User types a burst of lyrics, then undoes.
**Ctrl/Cmd+Z** rolls back the whole burst (coalesced within a 3s idle window),
not one keystroke at a time. **Ctrl/Cmd+Shift+Z** / **Ctrl/Cmd+Y** redoes.

**Add a section from the keyboard.** ☐
User wants to start a chorus while typing.
On an empty line, pressing **"/"** opens a "New section" dialog (section-type
dropdown, optional custom name, **Add section**).

**Find a rhyme for a line's last word.** ☐
User is stuck on a rhyme.
Tapping the rhyme button on a focused line opens **"Find a Rhyme"**: pick a line
chip or type a word → see **Perfect Rhymes** / **Near Rhymes** with syllable counts
→ tap a word to replace the line's last word (**"Replaced!"** confirmation, **Undo**
available). Closing without keeping reverts replacements.

**Export the lyrics.** ☐
User wants the lyrics out of the app.
Open **Export Lyrics**, toggle **Plain text** / **ChordPro**, then **Copy** or
**Download** (`.txt` / `.cho`). ChordPro inlines `[Chord]` markers at the right
positions and emits `{title}`, `{key}`, `{tempo}`, section directives.

### 1c. Chords on lyrics

**Pin a chord above a word.** ☐
User wants to place a chord on a lyric.
Tapping an empty chord slot opens the focused chord editor; type a chord
(e.g. `Bbm9`, `Fmaj7`) and confirm. Slot shows the chord chip.

**Enter chords by Nashville numbers.** ☐
User thinks in scale degrees.
Typing e.g. `2 5 1` in the chord editor surfaces the matching chords with an
**"Add N"** confirm; Enter inserts them.

**Reorder / nudge a placed chord.** ☐
User wants to move a chord left/right.
With a chord active, **Arrow Left/Right** (or **Alt+Arrow** in the editor) moves it
within the row; **Delete/Backspace** removes it.

**Manage chords in bulk on mobile.** ☐
User wants to shift several chords at once.
The floating chord toolbar appears with shift left/right, move up/down, octave,
**Select all**, **Clear all**, delete.

**Auto-fit chords that overflow the screen.** ☐
User places more chords than fit one row.
On editor close, chords auto-reflow onto continuation rows with a toast
("Auto-fit added N chord row(s)"). If still overflowing, a red toast advises
removing chords or rotating to landscape.

### 1d. Recordings strip (takes)

**Record a take.** ☐
User wants to capture audio.
Press **Record** (bottom sticky bar) → **"Stop · MM:SS"** with a live level meter →
**"Saving…"** → take card appears. Denied mic shows a toast with instructions.

**Not lose a take if the screen locks.** ☐
User's phone locks mid-recording.
On `visibilitychange` the in-progress take is finalized/saved rather than dropped.

**Play back a take.** ☐
User wants to hear a take.
Tap the play button on the take card; tap again to stop.

**Rename / star / delete a take.** ☐
User wants to organize takes.
**⋮ → Rename** (Enter commits, Esc cancels), star toggles "best take" (max 5),
**⋮ → Delete**.

**Import an existing audio file.** ☐
User has audio recorded elsewhere.
Tap **Import**, choose a WAV/MP3/M4A; the filename becomes the take name. Bad files
show a guidance toast.

**Detect chords from a take.** ☐
User wants the chords the recording implies.
Tap a take's **✨** button → "Transcribing chords…" → **"Detected — drag to lyrics"**
chip row. Low-confidence chords appear faded with a tooltip. Drag a chip onto a
lyric slot to place it.

**Auto-detect chords on every new take.** ☐
User doesn't want to press ✨ each time.
Toggle **Auto-detect** (strip header, off by default); new recorded/imported takes
transcribe automatically.

**Transcribe a melody to notes.** ☐
User wants the sung notes.
**⋮ → Transcribe Melody from Audio** renders a scrollable note strip with a
**Copy** button (space-separated note names).

**Back up recordings off-device.** ☐
User is reminded recordings are local-only.
A dismissible hint points to **Menu → Save** to back up; the X persists the dismissal.

---

## 2. Arrange mode (Tab "2. Arrange")

### 2a. View toggle

**Switch between the track timeline and the chord grid.** ☐
User wants to work on recordings vs. chords.
The **Track / Chords** toggle swaps between TrackTimeline and the Progressions grid.

### 2b. Track timeline

**Drag a take into a track.** ☐
User wants to place a captured take on the timeline.
From the **"Takes — drag into a track"** tray, drag a take into a lane; it lands at
the playhead. Empty lane reads "Drop a take or record".

**Record directly into a track.** ☐
User wants to overdub a new track.
Press a track's red record button (pulses while active); recording lands in the lane.

**Trim / move / loop a clip.** ☐
User wants to edit a placed clip.
Select a clip → drag left/right edges to trim, drag the middle to move (even to
another track), toggle the loop handle to repeat (shows "name · 2.5×"). Selection
card offers **Duplicate / Unloop / Delete**. **Delete/Backspace** removes; **Esc**
deselects.

**Fix recording latency.** ☐
User's overdub is slightly off.
Open **Delay compensation** and nudge a clip by ±1s / ±100ms / ±10ms; live offset shown.

**Add / clear tracks.** ☐
User wants more lanes or a clean lane.
**Add track** (dashed button) adds a lane; trash icon clears a track ("Track cleared"
with undo).

### 2c. Chord progressions grid

**Add a chord to a pattern block.** ☐
User wants to build a progression.
Tap an empty beat slot → chord picker → chord fills the slot and auditions. This also
pins the chord into the matching Lyrics section.

**Audition / edit / delete a chord.** ☐
User wants to hear or change a chord.
Tap a chord to play it; long-press / double-click / right-click opens the editor;
floating **play** and **✕** buttons appear above an active chord.

**Resize a chord's beat length.** ☐
User wants a chord to last longer.
Drag the chord's right edge in half-beat steps, or use the toolbar **−0.5b / +0.5b**,
or **Arrow Up/Down**.

**Adjust a block's bars/beats.** ☐
User wants a longer pattern block.
Tap the **"X/Y beats · N bars"** label → popover with −/+ and numeric input.

**Add / delete pattern blocks.** ☐
User wants another block in a section.
Block header trash deletes (disabled if it's the only block); blocks are labeled
"Block 1, 2…".

**Browse preset progressions.** ☐
User wants a proven progression.
Open **Popular Progressions**; filter by band (Dark/Neutral/Bright), spectrum, and
genre; **Play** to audition, **Use** to drop it into a block.

**Spice up a progression.** ☐
User wants a more interesting variation.
Tap the **✧ Add Spice** / sparkles button (needs 2+ chords); browse categories
(Cinematic, Espionage, etc.), **Play** to audition, **✓** to apply ("Applied …" toast
with **Undo**). Scope to one chord by selecting it first.

**See the voice leading.** ☐
User wants to understand how voices move.
Toggle the activity/lines icon to show the **Voice Leading Lines** overlay (per-voice
markers, smooth vs. jump lines); Spice sheet shows an **Original → Spiced** ribbon.

### 2d. Section management (both Lyrics & Progressions)

**Change a section's type/name.** ☐
User wants to label a section.
Section header dropdown picks Verse/Chorus/Pre-Chorus/Bridge/Intro/Outro/Custom;
Custom reveals a rename pencil.

**Color-code a section.** ☐
User wants visual organization.
Section color picker (16 swatches + Clear) tints the section.

**Add a key change to a section.** ☐
User wants a modulation.
**⋮ → Add Key Change** (disabled on the first section) → set semitones (−11…+11);
sticker shows e.g. "↑ 3"; **Remove / Confirm**.

**Toggle the arpeggiator per section.** ☐
User wants the section to arpeggiate.
**⋮ → Arpeggiator** switch (armed by default) routes that section's chords through
the arpeggiator on playback.

**Duplicate / reorder / delete sections.** ☐
User wants to restructure the song.
**⋮ → Duplicate / Move up / Move down**; **Delete section** confirms with a dialog
("removes from BOTH Lyrics and Progressions…", "Don't ask again").

**Play a single section.** ☐
User wants to hear just the chorus.
The section header **play** button plays from that section's first chord (disabled if
the section has no chords; lights amber while playing).

**Reorder sections by drag.** ☐
User wants to rearrange the song.
Enter **Sort sections** (title header / menu) → drag handles reorder; **Done sorting** exits.

---

## 3. Explore Chords (`?tab=chords`)

**Audition diatonic chords in the song's key.** ☐
User wants to hear chords that fit.
Roman-numeral filters (I, ii, iii…) narrow the grid; **tap** a chord to play,
**hold** to sustain, change the **Octave** selector. "Clear filter" resets.

**Understand why a chord works.** ☐
User wants the theory behind a chord.
**Long-press** a chord → **"Why This Chord?"**: role in key, transition feel, borrowed
origin, presets that use it, "Heard in" song references, and related chords.

**Send a chord or progression into the song.** ☐
User likes what they hear.
**"Add to song"** drops the chord into the next free slot; **"Send to Progressions"**
sends a whole preset into the first block, then returns to the editor.

---

## 4. Find Your Key & Range (`?tab=voicekey`)

**Detect a comfortable song key by humming.** ☐
User wants a key that suits their voice.
**Start Listening** → hum a steady note ~3s → stability bar fills → **"Key of X Major
detected"**. Tuner shows note, Hz, and cents needle. **Try Again** re-detects.

**Play / transpose the detected scale.** ☐
User wants to check the scale.
**Play Scale** plays the seven notes; scale chips play individually; **− / +** transposes.

**Start a new song in the detected key.** ☐
User wants to commit the key.
**"Use [Root] Major for New Song"** snapshots the current song, resets, sets the key,
and opens the app.

**Measure vocal range.** ☐
User wants to know their range/voice type.
**Record Highest Note** then **Record Lowest Note** (3s holds) → range bar + voice-type
badge (Soprano…Bass) with typical range, subcategories, and famous singers.
**Redo** / **Test Again** re-measure.

---

## 5. Transport & header

**Play the whole arrangement.** ☐
User wants to hear synth chords and recorded tracks together.
**Play** starts unified playback (chord scheduler + recordings engine in sync);
**Stop** halts and clears the playhead. Empty song shows "Nothing to play yet".

**Change tempo, live.** ☐
User wants a different BPM mid-playback.
−/+ around the BPM (40–220), or **Tap Tempo** (2+ taps) → **"Set N BPM"**. Tempo
changes apply without stopping playback.

**Use a metronome.** ☐
User wants a click track.
Toggle **Metronome** (off by default) and set its volume; click follows the time
signature.

**Set key / mode.** ☐
User wants to change the song's key.
Song-attributes pill ("C Major | 4/4 | 120 bpm") → key root + mode dropdowns →
chords relabel instantly.

**Change the time signature.** ☐
User wants a different meter.
Time-signature dropdown (2/4…12/8). If chords are placed, a **"Change time signature?"**
dialog warns chords re-flow to the start of their section.

**Transpose the whole song.** ☐
User wants to move everything up/down.
Transpose −/+ shows the offset; the checkmark confirms with a "Confirm Transposed Key"
dialog and resets the counter.

**Undo / redo across lyrics, chords, and recordings.** ☐
User wants to revert a mistake.
Header **Undo/Redo** buttons (or **Ctrl/Cmd+Z** / **+Shift+Z** / **+Y**); falls through
from the song store to the recordings store. Disabled when nothing to undo.

**Add inspiration photos.** ☐
User wants visual mood references.
Header image button → upload up to 3 photos (converted to WebP); they float above the
workspace; lightbox to navigate/remove. Save to persist.

---

## 6. Menu, export & project management

**Save the project to a file.** ☐
User wants a portable backup (incl. audio).
**Menu → Save** downloads `<title>.zip` with sections, chords, metadata, and recordings.

**Load a project.** ☐
User wants to restore a saved project.
**Menu → Load** accepts `.zip`/`.json`; replaces the current song. Bad files toast an error.

**Start a new song safely.** ☐
User wants a clean slate.
**Menu → New** → "Start a new song?" dialog (**Cancel / Save first / Start new song**).

**Export to ChordPro / MIDI / WAV stems.** ☐
User wants to hand off to other tools.
**Export Lyrics** (Plain/ChordPro), **Export MIDI** (chord track + tempo/time-sig),
**Export Stems** (per-track WAV ZIP, only when tracks have clips; shows progress).

**Tune the synth sound.** ☐
User wants a different instrument tone.
**Menu → Sound** (or preset dropdown): preset, timbre, master volume, ADSR, arpeggio,
3-band EQ, chorus, delay, reverb; **Preview** plays Cmaj7; **Reset to defaults**.

**Customize the background & theme.** ☐
User wants a different look.
Menu offers pattern picker (None/Checkerboard/Dot/Lined/Quarters), mask (None/Bottom/Top),
tint color, and a **Dark mode** switch.

**Set app-wide defaults (`/defaults`).** ☐
User wants new chords/blocks created a certain way.
Defaults page edits default chord length (beats), block length (bars), octave;
**Reset** restores factory values. Persists across all songs.

**Read the manual (`/help`).** ☐
User wants guidance.
**Menu → Help & User Manual** opens the 11-section manual with screenshots and a sticky TOC.

---

## 7. Onboarding

**Get guided on first run.** ☐
A new user wants to learn the app.
Coach marks step 1/7 ("Write lyrics or build progressions? Tap a tab to begin") →
2/7 (set key/timing → Save Settings) → tab-specific steps for adding chords/lines.

**Skip the tutorial.** ☐
User already knows the app.
The fixed **Skip Tutorial** button (bottom-left during onboarding) disables it; can be
re-enabled from the menu's tutorial toggle.

---

## 8. Data safety (background guarantees to verify)

**Recordings survive a refresh.** ☐
User refreshes the page.
Take/track metadata is restored from localStorage and audio blobs from IndexedDB.

**Storage-quota failures are surfaced.** ☐
Device storage is full.
Autosave failures raise a once-per-session quota warning toast.

**Concurrent edits in another tab are flagged.** ☐
User opens the same song in two tabs.
A persistent toast warns of last-writer-wins the first time another tab writes.

**Orphaned audio is reclaimed.** ☐
Leftover blobs from old sessions exist.
On startup, blobs not referenced by any take/clip are pruned from IndexedDB.

---

### Suggested test order
1. Landing → start writing → lyrics + Enter/Backspace/undo
2. Record a take → detect chords → drag to lyrics
3. Arrange: presets → spice → voice leading → per-section play
4. Transport: tempo/key/time-sig/transpose
5. Export: ChordPro, MIDI, Stems, Save/Load ZIP
6. Voice/Key + Explore Chords
7. Data safety: refresh, second tab, storage
