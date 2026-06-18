import { describe, it, expect, beforeEach } from "vitest";
import {
  useSongStore,
  getLineChordsViaSSOT,
  getPatternChordsViaSSOT,
} from "@/store/song";
import { parseChord } from "@/lib/music/chords";

/**
 * Regression cover for the "paste/duplicate in the Progressions tab leaves the
 * Write row out of order" bug (review findings F1/F2).
 *
 * addChordToPatternSlot lands each new chord's lyric anchor on the leftmost
 * free slot, independent of its beat position — so a chord inserted in the
 * middle of a block (duplicate) or appended (paste) used to render in the wrong
 * left-to-right order in Write, and could even be demoted to progression-only
 * (vanishing from Write) when the line's slots were exhausted. The fix routes
 * both handlers through autoLayoutSection, which repacks the lyric row in SSOT
 * (= progression) order, and guarantees the lyric mirror is never dropped.
 *
 * These tests pin the store-level contract those handlers rely on:
 *   1. After addChordToPatternSlot + autoLayoutSection, the Write row order
 *      matches the progression order and the slot positions are monotonic.
 *   2. Every SectionChord keeps BOTH a lyricsPlacement and a progressionPlacement
 *      (no lyricless leak).
 */

function chord(display: string) {
  const c = parseChord(display);
  if (!c) throw new Error(`unparseable chord: ${display}`);
  return c;
}

const SCREEN_W = 1200;
const SLOT_W = 28;

function expectFullyMirrored(sectionId: string) {
  const sec = useSongStore.getState().sections.find((s) => s.id === sectionId)!;
  for (const sc of sec.chords) {
    expect(sc.lyricsPlacement, `chord ${sc.chord.display} lost its lyric mirror`).toBeTruthy();
    expect(sc.progressionPlacement, `chord ${sc.chord.display} lost its progression mirror`).toBeTruthy();
  }
}

describe("progression paste/duplicate keeps the Write row in order", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("duplicating a middle chord keeps the Write row in progression order", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const line = section.lines[0];
    const pattern = store.progression[0];

    // A, B, C at spread-out slots so the duplicate's leftmost-free slot would
    // otherwise land out of order.
    store.placeChordInSlot(section.id, line.id, 0, chord("A"));
    store.placeChordInSlot(section.id, line.id, 5, chord("B"));
    store.placeChordInSlot(section.id, line.id, 10, chord("C"));

    // Duplicate B exactly as ProgressionsTab.onDuplicate does: insert a copy
    // right after B in the block, then repack the lyric mirror.
    {
      const s = useSongStore.getState();
      const sec = s.sections.find((x) => x.id === section.id)!;
      const pat = s.progression.find((p) => p.id === pattern.id)!;
      const chords = getPatternChordsViaSSOT(sec, pat);
      const idx = chords.findIndex((c) => c.chord.display === "B");
      s.addChordToPatternSlot(pattern.id, chords[idx].chord, idx + 1, chords[idx].lengthBeats);
      s.autoLayoutSection(section.id, SCREEN_W, SLOT_W);
    }

    const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
    const pat = useSongStore.getState().progression.find((p) => p.id === pattern.id)!;
    const progOrder = getPatternChordsViaSSOT(sec, pat).map((c) => c.chord.display);
    expect(progOrder).toEqual(["A", "B", "B", "C"]);

    const anchors = getLineChordsViaSSOT(sec, line.id);
    // Write row order matches the progression order...
    expect(anchors.map((c) => c.chord.display)).toEqual(progOrder);
    // ...and slot positions are monotonic, so they actually render in order.
    const slots = anchors.map((c) => c.slotIndex ?? 0);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));

    expectFullyMirrored(section.id);
  });

  it("pasting multiple chords into a block mirrors all of them, in order", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const line = section.lines[0];
    const pattern = store.progression[0];

    store.placeChordInSlot(section.id, line.id, 0, chord("A"));
    store.placeChordInSlot(section.id, line.id, 6, chord("B"));

    // Paste [D, E] appended at the end of the block, as handlePasteIntoBlock
    // does (addChordToPatternSlot per clipboard chord), then repack.
    {
      const s = useSongStore.getState();
      const sec = s.sections.find((x) => x.id === section.id)!;
      const pat = s.progression.find((p) => p.id === pattern.id)!;
      const insertIdx = getPatternChordsViaSSOT(sec, pat).length;
      [chord("D"), chord("E")].forEach((c, i) => {
        useSongStore.getState().addChordToPatternSlot(pattern.id, c, insertIdx + i);
      });
      useSongStore.getState().autoLayoutSection(section.id, SCREEN_W, SLOT_W);
    }

    const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
    const pat = useSongStore.getState().progression.find((p) => p.id === pattern.id)!;
    const progOrder = getPatternChordsViaSSOT(sec, pat).map((c) => c.chord.display);
    expect(progOrder).toEqual(["A", "B", "D", "E"]);

    const anchors = getLineChordsViaSSOT(sec, line.id);
    expect(anchors.map((c) => c.chord.display)).toEqual(progOrder);
    const slots = anchors.map((c) => c.slotIndex ?? 0);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));

    // Every pasted chord landed in BOTH views — none demoted to lyricless.
    expectFullyMirrored(section.id);
  });
});

/**
 * Review finding F3: a progression-only ("lyricless") chord must keep its lack
 * of a lyric anchor through copy/paste/duplicate in the Progressions tab, so the
 * user's choice to add lyrics later is respected.
 */
describe("progression lyricless chords stay lyricless through paste/duplicate", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("duplicating a lyricless chord keeps the copy lyricless", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const pattern = store.progression[0];

    // A progression-only chord — the user hasn't added lyrics yet.
    store.addChordToPatternSlot(pattern.id, chord("A"), 0, undefined, true);
    {
      const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
      expect(sec.chords).toHaveLength(1);
      expect(sec.chords[0].progressionPlacement).toBeTruthy();
      expect(sec.chords[0].lyricsPlacement).toBeUndefined();
    }

    // Duplicate it as ProgressionsTab.onDuplicate does for a lyricless source:
    // carry the lyricless flag through, then repack.
    {
      const s = useSongStore.getState();
      const sec = s.sections.find((x) => x.id === section.id)!;
      const pat = s.progression.find((p) => p.id === pattern.id)!;
      const chords = getPatternChordsViaSSOT(sec, pat);
      const srcLyricless = !sec.chords.find((x) => x.id === chords[0].id)?.lyricsPlacement;
      s.addChordToPatternSlot(pattern.id, chords[0].chord, 1, chords[0].lengthBeats, srcLyricless);
      s.autoLayoutSection(section.id, SCREEN_W, SLOT_W);
    }

    const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
    expect(sec.chords).toHaveLength(2);
    for (const c of sec.chords) {
      expect(c.progressionPlacement, "lost progression placement").toBeTruthy();
      expect(c.lyricsPlacement, `chord ${c.chord.display} should stay lyricless`).toBeUndefined();
    }
  });

  it("pasting a lyricless chord into a block keeps it lyricless", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const pattern = store.progression[0];

    // Simulate handlePasteIntoBlock for a clipboard chord copied from a
    // progression-only source ({ lyricless: true }).
    store.addChordToPatternSlot(pattern.id, chord("G"), 0, 4, true);
    store.autoLayoutSection(section.id, SCREEN_W, SLOT_W);

    const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
    expect(sec.chords).toHaveLength(1);
    expect(sec.chords[0].progressionPlacement).toBeTruthy();
    expect(sec.chords[0].lyricsPlacement).toBeUndefined();
  });
});
