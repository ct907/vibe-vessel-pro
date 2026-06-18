import { describe, it, expect } from "vitest";
import { useSongStore, getLineChordsViaSSOT, type PatternBlock } from "@/store/song";
import tester from "./tester-jun26-song.json";

/**
 * Regression for the reported "Write and Arrange show the same chord in
 * different positions / groupings" bug (user's "Tester Jun 26" song).
 *
 * Chords used to carry two independently-stored positions; the reconciliation
 * let them drift. The fix makes the lyric rows the single source of truth and
 * derives every block (and every `progressionPlacement`) from them, so the two
 * tabs can no longer disagree. This loads the real song through the load path
 * and asserts the two views read back identically — per section:
 *   - one pattern block per non-overflow lyric line (1:1), and
 *   - the chord-id sequence from the Write rows (line render order, slot order)
 *     equals the sequence from the Arrange blocks (block order, startBeat order).
 */
const sectionBlocks = (sectionId: string): PatternBlock[] =>
  useSongStore.getState().progression.filter((p) => (p.sectionId ?? p.id) === sectionId);

describe("Write/Arrange parity on load", () => {
  it("the Tester Jun 26 song reads identically across both tabs", () => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(tester)));

    const { sections } = useSongStore.getState();
    expect(sections.length).toBeGreaterThan(0);
    let totalChords = 0;

    for (const sec of sections) {
      const nonOverflowLines = sec.lines.filter((l) => !l._isChordOverflow);
      const blocks = sectionBlocks(sec.id);

      // 1:1 — exactly one block per non-overflow lyric line.
      expect(blocks.length, `block count in ${sec.label}`).toBe(nonOverflowLines.length);

      // Write order: every line in render order, chords in SSOT/slot order.
      const writeSeq = sec.lines.flatMap((l) =>
        getLineChordsViaSSOT(sec, l.id).map((a) => a.id),
      );
      // Arrange order: every block in render order, chords by beat position.
      const arrangeSeq = blocks.flatMap((b) =>
        [...b.chords].sort((x, y) => x.startBeat - y.startBeat).map((pc) => pc.id),
      );

      expect(arrangeSeq, `chord order mismatch in ${sec.label}`).toEqual(writeSeq);

      // Every chord is anchored in both views (no orphans on either side).
      const lyricCount = sec.chords.filter((c) => c.lyricsPlacement).length;
      const progCount = sec.chords.filter((c) => c.progressionPlacement).length;
      expect(lyricCount, `lyric anchor count in ${sec.label}`).toBe(sec.chords.length);
      expect(progCount, `progression anchor count in ${sec.label}`).toBe(sec.chords.length);

      // startBeat is the running cumulative of chord lengths within each block.
      for (const b of blocks) {
        const ordered = [...b.chords].sort((x, y) => x.startBeat - y.startBeat);
        let cursor = 0;
        for (const pc of ordered) {
          expect(pc.startBeat, `non-cumulative startBeat in ${sec.label}/${b.id}`).toBe(cursor);
          cursor += pc.lengthBeats;
        }
      }

      totalChords += sec.chords.length;
    }

    // The song is non-trivial — the assertions above actually exercised chords.
    expect(totalChords).toBeGreaterThan(0);
  });
});
