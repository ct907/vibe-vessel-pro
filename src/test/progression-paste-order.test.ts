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
 * Lyrics-as-SSOT model: the Write chord rows are authoritative, so EVERY chord
 * is lyric-anchored — there are no "lyricless" / progression-only chords. A
 * chord added in the Progressions tab therefore also gains a lyric anchor on the
 * block's line (1 block ⇔ 1 line), and that anchor survives paste/duplicate.
 */
describe("progression-tab chords are always lyric-anchored", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("duplicating a chord keeps both copies lyric-anchored", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const pattern = store.progression[0];

    store.addChordToPatternSlot(pattern.id, chord("A"), 0);
    {
      const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
      expect(sec.chords).toHaveLength(1);
      expect(sec.chords[0].progressionPlacement).toBeTruthy();
      expect(sec.chords[0].lyricsPlacement).toBeTruthy();
    }

    // Duplicate it as ProgressionsTab.onDuplicate does, then repack.
    {
      const s = useSongStore.getState();
      const sec = s.sections.find((x) => x.id === section.id)!;
      const pat = s.progression.find((p) => p.id === pattern.id)!;
      const chords = getPatternChordsViaSSOT(sec, pat);
      s.addChordToPatternSlot(pattern.id, chords[0].chord, 1, chords[0].lengthBeats);
      s.autoLayoutSection(section.id, SCREEN_W, SLOT_W);
    }

    const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
    expect(sec.chords).toHaveLength(2);
    for (const c of sec.chords) {
      expect(c.progressionPlacement, "lost progression placement").toBeTruthy();
      expect(c.lyricsPlacement, `chord ${c.chord.display} should be lyric-anchored`).toBeTruthy();
    }
  });

  it("pasting a chord into a block anchors it to the block's line", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const pattern = store.progression[0];

    store.addChordToPatternSlot(pattern.id, chord("G"), 0, 4);
    store.autoLayoutSection(section.id, SCREEN_W, SLOT_W);

    const sec = useSongStore.getState().sections.find((x) => x.id === section.id)!;
    expect(sec.chords).toHaveLength(1);
    expect(sec.chords[0].progressionPlacement).toBeTruthy();
    expect(sec.chords[0].lyricsPlacement).toBeTruthy();
  });
});
