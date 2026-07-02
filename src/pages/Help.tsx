import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import lyricsImg from "@/assets/help/lyrics-tab.png";
import chordsImg from "@/assets/help/chords-tab.png";
import progressionsImg from "@/assets/help/progressions-tab.png";
import menuImg from "@/assets/help/menu.png";

interface Section {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  tip?: string;
  image?: string;
  imageAlt?: string;
}

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "1. Write and Record, then Arrange",
    intro:
      "felt. has two modes, toggled at the top of the app. Write and Record is where a song starts — lyrics, chords on top of them, and voice memos. Arrange is where you build looping chord patterns and multitrack your takes.",
    steps: [
      "Write and Record — write lyric lines and pin chords to the syllables you sing them on; capture voice memos alongside them.",
      "Arrange — switch between a Track view (multitrack timeline for your recordings) and a Chords view (bar-by-bar pattern blocks per section).",
      "A chord you add in either mode appears in the other automatically — they share the same song.",
    ],
    tip: "Explore Chords and Find Your Key & Range on the home screen open standalone tools that don't require a song in progress.",
    image: lyricsImg,
    imageAlt: "Write and Record mode: a song titled Harbor Lights with an Fmaj7 chord pinned above the first lyric line.",
  },
  {
    id: "add-chord-lyrics",
    title: "2. Adding a chord to a lyric line",
    intro:
      "Chords sit on a row above your lyrics so you know exactly when to play each one.",
    steps: [
      "Tap the row above a lyric line (it says \"add your chords here\").",
      "A bottom sheet opens. Type a chord directly — e.g. Fmaj7, Bbm9, Csus4 — or use the type / variant / altered-dominant / slash-bass dropdowns.",
      "Tap a suggested chord to add it and keep typing; the sheet stays open so you can add several chords in a row.",
      "Typing Nashville numbers (e.g. 2 5 1) resolves them to chords in your song's key and adds the whole sequence at once.",
      "Tap a placed chord chip to select it — a small toolbar lets you change its quality, move it, or delete it.",
    ],
    tip: "The chord picker also has an Octave selector and a preview button on every chord so you can hear it before committing.",
  },
  {
    id: "write-lyrics",
    title: "3. Writing lyrics & creating new lines",
    intro: "Each section holds as many lyric lines as you need.",
    steps: [
      "Click the line that says \"Write your lyric line…\" and start typing.",
      "Press Enter to start a new line below; press Backspace at the start of a line to merge it into the one above.",
      "Type / on an empty line to open the new-section dialog directly from the keyboard.",
      "Use the \"Add Section\" button in the sticky bottom bar to add a Verse, Chorus, Bridge, Intro, or a custom section.",
    ],
    tip: "Lyrics autosave to your browser as you type — there's no Save button to remember for that.",
  },
  {
    id: "browse-chords",
    title: "4. Browsing chords — Explore Chords",
    intro:
      "Explore Chords is a chord encyclopedia for your song's key. Every chord is grouped by scale degree (I, ii, iii, IV, V, vi, vii°).",
    steps: [
      "Open it from the home screen (\"Explore Chords\") or from Arrange mode's Chords sub-view.",
      "Use the Roman-numeral chips at the top to jump to a scale degree, and the Octave selector to change the audition pitch.",
      "Tap any chord to hear it; tap again to open a detail sheet showing what the chord does in your key and classic progressions that use it.",
      "From the detail sheet, audition a progression or send it straight to your song's Arrange view.",
    ],
    image: chordsImg,
    imageAlt: "The Explore Chords encyclopedia showing scale-degree filters and chord chips grouped by degree.",
  },
  {
    id: "arrange-progressions",
    title: "5. Arrange mode — building progressions",
    intro:
      "In Arrange mode, switch to the Chords sub-view to build looping chord patterns section by section.",
    steps: [
      "Each section can hold one or more pattern blocks; tap \"Add Block\" to give it another.",
      "Tap an empty cell inside a block to open the chord picker, exactly like in Write mode.",
      "A chord added here appears in the block immediately and plays when you press Play.",
      "Adding it here also pins it into the matching line in Write mode automatically — the two views share one song.",
    ],
    tip: "Switch to the Track sub-view in Arrange mode to see your recordings on a 4-track timeline instead.",
    image: progressionsImg,
    imageAlt: "Arrange mode's Chords view showing a Verse 1 pattern block with an Fmaj7 chord.",
  },
  {
    id: "presets-and-spice",
    title: "6. Browse progressions & Add Spice",
    intro:
      "Two shortcuts inside every pattern block — start from a curated progression, then remix it with mood-based harmony moves.",
    steps: [
      "Open the preset gallery from a block header to browse curated progressions — Royal Road, Doo-Wop, Axis, and more — realized in your current key.",
      "Preview a preset, then \"Use\" it to drop it into the block.",
      "On a block with at least two chords, open Add Spice to see categorized variations: dramatic shifts, bittersweet colors, tension gateways, smooth bridges, and more.",
      "Preview a Spice suggestion — a voice-leading ribbon shows how the inner voices move — then apply it.",
      "Every commit shows an Undo toast for a few seconds, so nothing here is irreversible.",
    ],
    tip: "Select a single chord first to scope Spice to just that chord instead of the whole progression.",
  },
  {
    id: "pattern-blocks",
    title: "7. How pattern blocks work",
    intro:
      "A pattern block is one looping chord pattern. A section can hold several blocks that play one after another.",
    steps: [
      "Each block shows its length in bars and how many beats are filled.",
      "Blocks play top-to-bottom in order when you press Play.",
      "Use the color-swatch icon on a section header to color-code verses, choruses, and bridges.",
    ],
  },
  {
    id: "chord-bar-length",
    title: "8. Adjusting the length of a chord",
    intro:
      "Each chord in a pattern takes up a number of beats. You can stretch or shrink it.",
    steps: [
      "Tap a chord chip inside a pattern block to select it — a floating toolbar appears.",
      "Use the toolbar's beat-length controls to extend or shrink the chord.",
      "The toolbar also has copy, cut, paste, move, and delete for the selected chord (or a multi-selection).",
    ],
  },
  {
    id: "block-bar-length",
    title: "9. Adjusting the length of a pattern block",
    intro: "Each block can be any number of bars — short loops or long phrases.",
    steps: [
      "Open a block's length control in its header.",
      "Type a new value or use the +/- controls.",
      "The block resizes and the beat count updates to match your time signature.",
    ],
  },
  {
    id: "recording",
    title: "10. Recording your voice",
    intro:
      "Write mode's recordings strip captures quick voice memos; Arrange mode's Track view multitracks up to 4 of them together.",
    steps: [
      "Tap \"Add Recording\" (or the Record button in the sticky bottom bar) to start capturing.",
      "Each take is saved to a takes library — mark up to three as \"best\" to keep them handy.",
      "The app can auto-transcribe a take's chords and melody in the background as you record.",
      "In Arrange mode's Track view, drag a take onto a track to place it on the multitrack timeline, then trim, loop, or adjust its gain and pan.",
    ],
    tip: "Export Stems from the menu renders your tracks as WAV files if you want to finish the mix elsewhere.",
  },
  {
    id: "sounds",
    title: "11. Adjusting sounds",
    intro:
      "felt. has several built-in instrument presets so playback never sounds the same twice.",
    steps: [
      "Open the menu (top-right) and pick a preset from the Sound Settings dropdown — Classic Rhodes, '80s DX Keys, Juno Poly, String Machine, Vocal Choir, Piano, or Organ.",
      "Open the full Sound panel for Volume, Timbre, ADSR envelope, EQ, and FX (delay, reverb, chorus).",
      "Use the Tempo section in the same menu to change the BPM, or tap Tap Tempo to set it by feel.",
    ],
    tip: "Sound settings are part of your song and save with it.",
    image: menuImg,
    imageAlt: "The header menu, split into Project Settings and App Settings, with the sound and tempo sections below.",
  },
  {
    id: "save",
    title: "12. Saving your progress",
    intro:
      "Your song autosaves to this browser. For backups, to move it to another device, or to share it, use the menu's export options.",
    steps: [
      "Autosave: every change is stored in this browser automatically — close the tab and come back later.",
      "Save / Load: save a named version (kept locally, or to Google Drive if connected) and load it back later.",
      "Export Lyrics, Export MIDI, or Export Stems (WAV) to take parts of your song elsewhere.",
      "Export Backup (.zip) bundles the full project — lyrics, chords, and audio — into one file.",
      "New: starts a fresh project; your current song is kept in Recent Projects on the home screen.",
    ],
    tip: "Export a backup before clearing your browser data — autosave and local versions only live on this device.",
  },
];

const QUICK_TIPS = [
  "Change key, mode, or time signature from the pill under the song title — every chord re-labels itself instantly.",
  "Use the color-palette icon on a section to color-code verses, choruses, and bridges.",
  "Switch to sort mode from the title header to drag sections into a new order.",
  "Toggle dark mode, or tune chord/pattern-block defaults, from the App Settings group in the menu.",
  "Turn the guided tutorial back on any time from the same menu.",
];

export default function Help() {
  useEffect(() => {
    document.title = "Help & User Manual · felt.";
    const desc = document.querySelector('meta[name="description"]');
    const content = "Beginner's guide to felt. — write lyrics, build chord progressions, record takes, and save your songs.";
    if (desc) desc.setAttribute("content", content);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = content;
      document.head.appendChild(m);
    }
  }, []);

  return (
    <div className="min-h-screen bg-paper text-foreground">
      <header className="border-b border-border bg-paper-card">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <Link
            to="/app"
            className="btn-sculpt-cream inline-flex items-center gap-1.5 rounded-lg h-9 px-3 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-display text-lg">User Manual</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 grid gap-10 lg:grid-cols-[220px_1fr]">
        {/* TOC */}
        <nav aria-label="Table of contents" className="lg:sticky lg:top-6 self-start">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3 font-mono">
            Contents
          </p>
          <ol className="space-y-1.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-md px-2 py-1 hover:bg-paper-shade transition-colors text-ink-soft hover:text-ink"
                >
                  {s.title}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#quick-tips"
                className="block rounded-md px-2 py-1 hover:bg-paper-shade transition-colors text-ink-soft hover:text-ink"
              >
                Quick tips
              </a>
            </li>
          </ol>
        </nav>

        {/* Body */}
        <article className="min-w-0">
          <h1 className="font-display text-4xl mb-3">felt. — User Manual</h1>
          <p className="text-base text-muted-foreground mb-10 max-w-2xl">
            A short, friendly walkthrough for writing songs in felt. No music theory required —
            if you can hum a melody, you can use this app.
          </p>

          <div className="space-y-12">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-6">
                <h2 className="font-display text-2xl mb-2">{s.title}</h2>
                <p className="text-base text-ink-soft mb-4">{s.intro}</p>

                <ol className="list-decimal pl-5 space-y-1.5 text-base mb-4 marker:text-primary marker:font-semibold">
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>

                {s.tip && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm mb-4">
                    <span className="font-semibold text-primary mr-1">Tip ·</span>
                    {s.tip}
                  </div>
                )}

                {s.image && (
                  <figure className="rounded-xl overflow-hidden bg-paper-card shadow-card border border-border">
                    <img src={s.image} alt={s.imageAlt ?? ""} className="w-full h-auto block" loading="lazy" />
                  </figure>
                )}
              </section>
            ))}

            <section id="quick-tips" className="scroll-mt-6">
              <h2 className="font-display text-2xl mb-2">Quick tips</h2>
              <p className="text-base text-ink-soft mb-4">
                Small features that are easy to learn and worth knowing about.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-base marker:text-primary">
                {QUICK_TIPS.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          </div>

          <footer className="mt-16 pt-6 border-t border-border text-sm text-muted-foreground">
            Need something explained that isn't here? Let us know — this manual grows with the app.
          </footer>
        </article>
      </main>
    </div>
  );
}
