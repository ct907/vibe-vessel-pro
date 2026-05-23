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
    title: "1. The Lyrics, Chords & Progressions tabs",
    intro:
      "SongNote has three tabs that work together. Pick chords in the Chords tab, attach them to lyrics in the Lyrics tab, then arrange them into looping patterns in the Progressions tab.",
    steps: [
      "Lyrics — write words and pin chords to the syllables you sing them on.",
      "Chords — browse every chord in your song's key, tap to audition, and tap again to see which classic progressions use it.",
      "Progressions — build looping bar-by-bar chord patterns for each section (verse, chorus, etc.) and remix them with Add Spice.",
    ],
    tip: "Anything you do in one tab updates the others instantly. They share the same song.",
    image: lyricsImg,
    imageAlt: "The three main tabs at the top of SongNote: Lyrics, Chords, and Progressions.",
  },
  {
    id: "add-chord-lyrics",
    title: "2. Adding a chord in the Lyrics tab",
    intro:
      "Chords sit on top of your lyric words so you know exactly when to play each one.",
    steps: [
      "In a section, tap the chord row above any lyric line (the row labelled \"add your chords here\").",
      "Tap the word or position you want the chord to land on. A picker opens.",
      "Choose a root note (C, D, E…) and a quality (major, minor, 7, sus…).",
      "Pick an octave (3, 4 or 5). Tap the chord to hear it.",
      "Press Close. The chord is saved and appears above your lyric.",
    ],
    tip: "Open a section's three-dot menu in the Progressions tab to copy or paste chord sequences between sections.",
  },
  {
    id: "write-lyrics",
    title: "3. Writing lyrics & creating new lines",
    intro: "Each section holds as many lyric lines as you need.",
    steps: [
      "Click the line that says \"Write your lyric line…\" and start typing.",
      "Press Enter (or Return) to start a new line below.",
      "Press Backspace at the start of an empty line to remove it.",
      "Use the section buttons (Verse, Chorus, Bridge, Intro, Custom) at the bottom to add more sections.",
    ],
    tip: "Lyrics autosave to your browser as you type — there's no Save button to remember.",
  },
  {
    id: "browse-chords",
    title: "4. Browsing chords — the Chord Encyclopedia",
    intro:
      "The Chords tab is an encyclopedia. Every chord in your key is grouped by scale degree (I, ii, iii, IV, V, vi, vii°).",
    steps: [
      "Tap the Roman numeral chips at the top to filter the rows.",
      "Tap any chord to audition it (hold to sustain) — a detail sheet slides up with what the chord does in your key.",
      "Inside the sheet, see two or three classic progressions that use this chord, audition them, and send any to the Progressions tab.",
      "Tap \"Add to song\" to drop the chord straight into the first pattern block with space.",
    ],
    tip: "Use the Octave selector in the toolbar to change which octave the audition plays in.",
    image: chordsImg,
    imageAlt: "The Chords tab showing scale-degree filters, chord cards, and the audition octave selector.",
  },
  {
    id: "add-chord-progression",
    title: "5. Adding a chord in the Progressions tab",
    intro:
      "Progressions are built inside pattern blocks — each block is a row of bars you can fill with chords.",
    steps: [
      "Open the Progressions tab and find a section (e.g. VERSE 1).",
      "Tap an empty cell inside a Block. The chord picker opens.",
      "Pick a root, quality and octave, then press Close.",
      "The chord appears in the cell and will play when you press Play.",
    ],
    tip: "Adding a chord here also pins it into the matching section in the Lyrics tab automatically.",
    image: progressionsImg,
    imageAlt: "A pattern block in the Progressions tab with empty bar cells ready to receive chords.",
  },
  {
    id: "presets-and-spice",
    title: "6. Browse progressions & Add Spice",
    intro:
      "Two shortcuts inside every pattern block — start from a curated progression, then remix it with mood-based harmony moves.",
    steps: [
      "Tap the music-note icon on a block header (or \"Browse progressions\" in an empty block) to open the preset gallery — Royal Road, Doo-Wop, Axis, etc., realised in your current key.",
      "Tap ▷ on a preset to loop it, then \"Use\" to drop it into the block.",
      "Tap \"✧ Add Spice\" on any block with at least two chords to see categorised variations: Dramatic shift, Bittersweet color, Tension gateway, Smooth bridge, and more.",
      "Click ▷ on a Spice card to audition; the voice-leading ribbon above the panel shows how the inner voices move. Click ✓ to commit.",
      "Every commit shows an Undo toast for five seconds so nothing's irreversible.",
    ],
    tip: "Tap a single chord first to scope Spice to just that chord; tap the background again to spice the whole chain.",
  },
  {
    id: "pattern-blocks",
    title: "7. How pattern blocks work",
    intro:
      "A pattern block is one looping chord pattern. A section can hold several blocks that play one after another.",
    steps: [
      "Each block has a Bars number (e.g. 4) and shows X / Y beats used.",
      "Press \"+ Add pattern block\" to give a section a second pattern (e.g. a B part).",
      "Blocks play top-to-bottom in order when you press Play.",
      "Use the colour swatch on the section header to colour-code each section.",
    ],
  },
  {
    id: "chord-bar-length",
    title: "8. Adjusting the bar length of a chord",
    intro:
      "Each chord in a pattern takes up a number of beats. You can stretch or shrink it.",
    steps: [
      "Tap a chord chip inside a pattern block to open the focused editor.",
      "Use the duration controls to extend the chord across more beats, or shrink it.",
      "You can also drag the right edge of the chord chip to resize it directly inside the block.",
    ],
    tip: "The \"X / Y beats\" counter on the block header tells you how many beats are filled vs. available.",
  },
  {
    id: "block-bar-length",
    title: "9. Adjusting the bar length of a pattern block",
    intro: "Each block can be any number of bars — short loops or long phrases.",
    steps: [
      "Click the number in the \"Bars\" field on the block header.",
      "Type a new value (e.g. 8) or use the up/down arrows.",
      "The block resizes and the beat count updates to match your time signature.",
    ],
  },
  {
    id: "sounds",
    title: "10. Adjusting sounds",
    intro:
      "SongNote has several built-in instrument presets so playback never sounds the same twice.",
    steps: [
      "Open the menu (top-right) and pick a preset from the dropdown — Classic Rhodes, '80s DX Keys, Juno Poly, String Machine, Vocal Choir, Piano or Organ.",
      "Tap \"Sound\" in the menu to open the full Sound panel.",
      "Adjust Volume, Timbre (the per-preset macro), ADSR envelope, EQ and FX (delay, reverb, chorus).",
      "Use the Tempo (BPM) and Time signature controls in the same menu to change the feel of playback.",
    ],
    tip: "Sound settings are part of your song and save with it.",
    image: menuImg,
    imageAlt: "The header menu showing the sound preset dropdown, Sound panel button, and project settings.",
  },
  {
    id: "save",
    title: "11. Saving your progress",
    intro:
      "Your song saves to this browser automatically. For backups or to move it to another device, export the project file.",
    steps: [
      "Autosave: every change you make is stored in this browser — close the tab and come back later.",
      "Save: open the menu and tap \"Save\" to download your song as a .json file.",
      "Load: tap \"Load\" in the menu to open a previously saved .json file.",
      "Export Lyrics: tap \"Export Lyrics\" to share your lyrics as plain text.",
      "New Song: starts a fresh project (your current song stays in the file you saved).",
    ],
    tip: "Export your song as JSON before clearing your browser data — autosave only lives on this device.",
  },
];

const QUICK_TIPS = [
  "Change key or mode from the menu (top-right) — every chord re-labels itself instantly.",
  "Use the colour palette icon on a section to colour-code verses, choruses and bridges.",
  "Switch to sort mode from the title header to drag sections into a new order.",
  "Toggle dark mode from the menu.",
];

export default function Help() {
  useEffect(() => {
    document.title = "Help & User Manual · SongNote";
    const desc = document.querySelector('meta[name="description"]');
    const content = "Beginner's guide to SongNote — write lyrics, build chord progressions, and save your songs.";
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
          <h1 className="font-display text-4xl mb-3">SongNote — User Manual</h1>
          <p className="text-base text-muted-foreground mb-10 max-w-2xl">
            A short, friendly walkthrough for writing songs in SongNote. No music theory required —
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
