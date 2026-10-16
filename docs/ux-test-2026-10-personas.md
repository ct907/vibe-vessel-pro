# UX Test — Persona Workflows (October 2026)

**Status: all eight recommended fixes are implemented** on this branch and each
was re-verified with the same Playwright scenarios that found the problem:

| Fix | Commit | Re-test result |
|---|---|---|
| 1–2, 7 Song library | `16dfa6b` | All three ideas found a week later, named by first line, with dates; search works; Continue keeps "…jacket"; a voice memo survives switching songs and a reload; legacy recents migrate without duplicates |
| 3 Chord picker | `d45b92e` | C Am F G stays in order, desktop and mobile, 1 or 2+ lines, 0–1200 ms pauses (was C F G Am / C Am); a chord tapped above "dancing" stays there; hand-placed chords survive later adds |
| 4 Audio plays alone | `1ffc318` | Play with only a 12 s clip plays all 12 s; with a 4-bar progression the loop grows to 2× so nothing is cut (was 10.43 s of 15 s) |
| 5 Overdub | `1ffc318` | One-bar count-in, then Track 1 plays while Track 2 records; take placed at the playhead (also from mid-timeline, 5.22 s) |
| 6 Takes grid | `79ebca3` | Take name 106 px wide at 1280 px (was 3 px) |
| 8 Flow polish | `296f776`, `19baa32` | Typing after Add Section / "/" lands in the new section; takes loop; detected C Am F G → song as 4-beat chords; first Arrange visit puts the take on Track 1 |

Found and fixed along the way: the one-line-section chord drop was a second bug
(the overflow resolver treated flexible blocks as full and stole focus);
"Play from this section" started recordings from the top while chords started at
the section; and the engine double-scheduled loops whenever Play didn't await
chords first. Not addressed (outside the eight fixes): duplicate makes "Verse
copy" with all lyrics, no line drag between sections, new sections start with
chords hidden.

Note for contributors: the root `tsconfig.json` is solution-style
(`"files": []`), so `npx tsc --noEmit` type-checks nothing. Use
`npx tsc --noEmit -p tsconfig.app.json`; on this branch it reports only two
pre-existing errors (a dead `onDuplicate` prop passed to `FloatingChordToolbar`
since `d912e8b`).

---

Three workflow-based tests of the current `main` (a9e8c14). The July audit covered
accessibility and polish; this one asks a different question: **can each kind of
songwriter get through their real job without losing work or losing their flow?**

Method: scripted Playwright sessions against the dev server (Chromium, 1280×800
and 390×844), with a fake microphone that plays a generated C–Am–F–G loop so
recording and chord detection run for real. Playwright's fake clock was used to
simulate a week passing between sessions. Web Audio `AudioBufferSourceNode.start`
and `HTMLMediaElement.play` were instrumented to record exactly what audio was
scheduled. Every finding below was reproduced in the running app; the
file:line pins point at the cause.

| Persona | Verdict | Blocking issues |
|---|---|---|
| 1. Scatter-brained idea finder | **Fails** — the idea from last week is gone | Untitled ideas overwrite each other; "Continue" rolls back edits |
| 2. Lyrics-first writer adding chords | **Breaks flow** on desktop/tablet | Typed chords get reordered or silently dropped; tap position ignored |
| 3. Audio-first jammer | **Can capture, can't jam** | Play needs chords; recordings cut to the chord loop; overdub is silent |

---

## Persona 1 — "Where's that idea I wrote last week?"

> Jots quick ideas, rarely titles them, comes back days later half-remembering a line.

**Scenario run:** Day 1 untitled idea *"Coffee rings on the windowsill"* → day 3
untitled idea *"Neon static in my head"* → day 5 titled idea *"Driftwood"* → a week
later, open the app and look for the coffee-rings idea. Typing was spread over two
minutes per idea, like a person thinking.

**Result:** the landing page lists **Driftwood** and an **empty** "Untitled Song".
Both untitled ideas are gone — not in Recents, not in Saved versions, not anywhere.

### 1A. Critical — Every untitled idea overwrites the previous one
`src/lib/recent-projects.ts:34`, `src/App.tsx:121`, `src/store/song.ts:4318-4323`

Recents are de-duplicated **by name**, and every untitled song is named
"Untitled Song". It's worse than one-at-a-time: `App.tsx` pushes a recents entry
on *any* state change (30 s throttle), including the `resetSong()` that starts a
new idea. So the act of tapping "Write Lyrics" first commits the old idea, then
immediately replaces it with an empty "Untitled Song". Measured recents after each
step:

```
after idea 1:  Untitled Song  "Coffee rings on the w…"
after idea 2:  Untitled Song  "Neon static in my h…"      ← idea 1 evicted
after idea 3:  Driftwood, Untitled Song ""                ← idea 2 evicted by the empty reset
```

The same collision hits two songs that share any title ("idea", "verse thing").
The two auto-checkpoint slots ("Saved versions") are global across all songs, so
they don't save the lost ideas either.

### 1B. Critical — "Continue where you left off" rolls back recent edits
`src/pages/Landing.tsx:150-153`, `src/components/header/TransportHeader.tsx:773-775`

The autosaved song held *"Salt in the seams of my jacket"*. After a reload, clicking
**Continue where you left off** showed *"Salt in the seams of my j"*. `openRecent`
commits the live song to recents, then loads the **stale snapshot object it captured
before that commit** (recents lag the live song by up to 30 s). The next throttled
push then overwrites the newer entry, so the lost words are unrecoverable.

### 1C. High — Recents can't support "find by fuzzy memory"
`src/pages/Landing.tsx:257-307`, `src/lib/recent-projects.ts:6`

- Entries show **name only**: no date, no first lyric, no "has recording" badge. Two
  untitled ideas would be indistinguishable even if both survived.
- No search. Capped at **10** entries — a prolific scribbler passes that in a week.
- Inside the editor, Recent projects is three levels deep at **Menu → Load → Recent
  projects** (`TransportHeader.tsx:1079`); "Load" reads as "import a file".
- Four overlapping stores answer "where is my song": Recents (10, by name, no
  audio), Saved versions (5 manual slots shared by *all* songs), Auto-checkpoints
  (2 slots shared by all songs), and .zip/Drive. None is a song library.

### 1D. High — Voice-memo ideas can't be kept without downloading a file
`src/store/song.ts:4308-4315`, `src/pages/Landing.tsx:154-158`

`songHasContent()` ignores recordings, and recents snapshots never include audio.
Recording a 6 s memo and then starting a new idea produced a blocking **"Leave this
song?"** dialog whose only options are *Save first* (downloads a .zip) or *Discard
& continue*. Recents kept only an empty "Untitled Song". Menu → **New** skips even
the recents commit (`TransportHeader.tsx:1504`).

**Worked well:** the live song autosaves reliably (the full text was always in the
main slot), and "Write Lyrics" lands the caret in the first line in one tap.

---

## Persona 2 — Lyrics-first writer adding chords, staying in flow

> Has a verse typed; wants chords on top and to shuffle sections around without
> stopping to think about the tool.

### 2A. Critical — On desktop/tablet, typed chords get reordered or dropped
`src/components/lyrics/LyricsTab.tsx:1834`, `:1885-1909`, `:2229-2234`

Opening the chord row and typing `C ↵ Am ↵ F ↵ G ↵` (the documented "keep typing"
flow) produced:

| Section | Pause between chords | Stored result |
|---|---|---|
| 1 lyric line | 0 / 300 / 600 / 1200 ms | **C Am** — picker closes, F and G lost |
| 2+ lyric lines | 0 ms | C Am F G ✓ |
| 2+ lyric lines | 300 / 600 / 1200 ms | **C F G Am** — order scrambled |
| any (mobile, 390px) | 0 / 600 ms | C Am F G ✓ |

Cause (traced with the app's own `LV_DEBUG_LAYOUT` logs): each chord add schedules
`autoLayoutSection()` 350 ms later, which repacks the line's chords. That reflow is
supposed to wait while the editor is open, but the gate reads `focusedEditorOpen`,
which only the mobile `FocusedChordEditor` sets — the desktop/tablet
`ChordPickerSheet` (≥768px, so iPads too) never does. The reflow moves Am from slot 1
to slot 2 while the picker's "next slot" cursor still says 2, so F is inserted
*before* Am. In one-line sections the reflow also steals focus from the picker input
and the sheet closes. Any natural pause — auditioning, thinking — triggers it.

### 2B. High — Tapping above a word doesn't put the chord there
Same reflow: the tapped slot is honored by `placeChordInSlot`, then repacked
left-to-right. Tapping above *"dancing"* (slot 3) stored the chord at slot 0, above
*"Moths"*; tapping slot 6 also gave slot 0. The writer has to place every chord twice
(add, then move it). On desktop the picker sheet also covers the line being edited
(the mobile editor shows a preview of the line — that's the better pattern).

### 2C. Medium — Structure experiments cost a click more than they should
- **Add Section → Chorus** leaves focus on `<body>`; you must click into the new
  chorus before typing (`src/components/write/WriteStickyBar.tsx:173`).
- **Duplicate section** creates "Verse copy" (`src/store/song.ts:1649`) directly
  under the original with all its lyrics — good for a repeated chorus, but a
  "Verse 2 with the same chords" means deleting every line by hand.
- Moving a section is **⋮ → Move Section → Down**, once per position, or Sort mode
  (collapses everything). No drag on section headers in normal view.
- A great line can't be moved to another section (no line drag; cut/paste text only).
- Each new section starts with chords hidden, so "Add Chords" is needed again per
  section.

**Worked well:** Enter/Backspace line splitting is solid at human typing speeds
(30 ms gaps, 4× CPU throttle, zero misrouted keys); `/` on an empty line opens the
new-section dialog; presets and Nashville numbers in the picker are great
inspiration; the mobile chord editor keeps order and shows the line.

---

## Persona 3 — Audio-first jammer

> Hums or strums an idea into the phone, then wants to loop it and play along.

### 3A. Critical — Play does nothing unless the song has chords
`src/components/header/TransportHeader.tsx:636-640`

With a 15 s clip on Track 1 and no chords, **Play** shows *"Nothing to play yet —
Add chords to a pattern in Progressions."* and schedules no audio. ("Progressions"
is no longer a name anywhere in the UI.) The audio-first user's entire song is
unplayable from the transport.

### 3B. Critical — Recordings are cut to the chord loop's length
`src/lib/audio/recordings-engine.ts:157-158`, `:210`

After adding a 4-chord preset (4 bars @ 92 bpm), Play scheduled the 15 s recording as
`offset 0, duration 10.43s of 15s buffer`, restarting it every 10.43 s. The last 4.6 s
of the idea is never heard. The timeline still draws the clip running past the
"VERSE" marker, so nothing explains why the end is missing.

### 3C. High — Overdub is silent
`src/components/arrange/TrackTimeline.tsx:734-776`, `src/components/lyrics/LyricsTab.tsx:1132-1140`

Recording on Track 2 opened the mic but scheduled **no** playback of Track 1 — you
can't hear what you're jamming to. "Overdub this section" in Write mode does the same
(switches to Arrange and records in silence). There's no count-in either:
`lovable:request-play-at` is listened for but never dispatched.

### 3D. High — Take cards are unreadable on desktop
`src/components/write/RecordingsStrip.tsx:298`

The takes grid is `grid-cols-2 lg:grid-cols-4`, but it lives in Write mode's 2/5
column (`WriteMode.tsx:110`). Measured card / take-name widths: 390px viewport → 159 /
68 px; 768 → 120 / 29; **1024 → 82 / 0; 1280 → 94 / 3**. On a laptop the take name is
invisible ("-"), the date wraps over four lines, and detected-chord chips are clipped
(C Am F visible of C Am F G C).

### 3E. Medium — Takes, tracks and chords don't connect
- Write's **Record** files a take; Arrange's identical **Record** button puts audio on
  Track 1. Takes never reach the timeline unless dragged — on a phone, a small chip
  into a ~236px lane.
- A take can't loop in Write mode (plain `<audio>`, plays once), so "loop it and
  jam" isn't possible there. Jamming over a take *does* work crudely (it kept playing
  while take 2 recorded), but the two end up as unrelated memos.
- In Arrange the timeline gets the narrow column while an empty "Add Chords" card
  takes the wide one; about three bars of audio are visible.
- **Detect chords** is fast and accurate (C Am F G C in ~2 s from the fake mic) but
  the only next step is "drag to lyrics". There's no "use these as the song's
  progression", which is exactly the bridge from audio-first to the rest of the app.

**Worked well:** one tap from the landing page starts recording immediately; the
elapsed timer and level meter are clear; the leave-song guard prevents silent audio
loss; chord detection is genuinely impressive.

---

## Recommended fixes, in order

1. **Give songs a stable id and key recents by it** (not name). Skip recents pushes
   when `!songHasContent()`, and auto-title untitled songs from their first lyric
   ("Coffee rings on the windowsill"). Fixes 1A. *(small)*
2. **Make "Continue" load the newest data**: re-read the entry after
   `commitCurrentSongToRecents()`, or skip the load entirely when the entry is the
   live song. Fixes 1B. *(small)*
3. **Gate the lyric reflow while `ChordPickerSheet` is open** (set
   `focusedEditorOpen` from the sheet too, as `FocusedChordEditor.tsx:126` does), and
   don't repack a chord the user explicitly placed. Fixes 2A and most of 2B.
   *(small–medium)*
4. **Let audio play on its own**: allow Play with no chords (loop = longest clip, or no
   loop), and make the loop `max(progression length, last clip end)` so clips are
   never cut. Fixes 3A/3B. *(medium)*
5. **Play other tracks while a track records**, with an optional one-bar count-in.
   Fixes 3C. *(medium)*
6. **Takes grid**: `grid-cols-[repeat(auto-fill,minmax(140px,1fr))]` instead of
   `lg:grid-cols-4`. Fixes 3D. *(one line)*
7. **A real song library**: date, first line, recording badge, search; no 10-item cap
   (IndexedDB); keep each song's takes with it instead of clearing them. Fixes 1C/1D.
   *(larger)*
8. Flow polish: focus the new section's first line; "Use as progression" on detected
   chords; a loop toggle on takes; place Write takes on the timeline automatically;
   fix the "Progressions" toast copy. *(small each)*
