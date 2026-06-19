import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, withHistoryGroup, type PatternBlock } from "@/store/song";

/**
 * Deleting a pattern block in the Arrange tab is the documented exception where
 * the block and its lyric line share one identity: removing the block also
 * removes its corresponding lyric line (otherwise the 1:1 derivation would just
 * re-create the block). This mirrors ProgressionsTab's requestDeleteBlock.
 */
const C = { root: "C", quality: "maj", display: "C", octave: 3 } as const;
const G = { root: "G", quality: "maj", display: "G", octave: 3 } as const;

const song = {
  version: 3,
  meta: { beatsPerBar: 4, beatUnit: 4, title: "T", keyRoot: "C", keyMode: "maj", bpm: 100 },
  sections: [
    {
      id: "S1", type: "verse", label: "V", collapsed: false,
      chords: [
        { id: "c0", chord: C, lyricsPlacement: { lineId: "L1", slotIndex: 0 }, progressionPlacement: { patternId: "B1", startBeat: 0, lengthBeats: 4 } },
        { id: "c1", chord: G, lyricsPlacement: { lineId: "L2", slotIndex: 0 }, progressionPlacement: { patternId: "B2", startBeat: 0, lengthBeats: 4 } },
      ],
      lines: [
        { id: "L1", text: "one", chords: [{ id: "c0", offset: 0, slotIndex: 0, chord: C }] },
        { id: "L2", text: "two", chords: [{ id: "c1", offset: 0, slotIndex: 0, chord: G }] },
      ],
    },
  ],
  progression: [
    { id: "B1", sectionId: "S1", lineId: "L1", label: "V", bars: 1, beatsPerBar: 4, chords: [] },
    { id: "B2", sectionId: "S1", lineId: "L2", label: "V", bars: 1, beatsPerBar: 4, chords: [] },
  ],
};

const sectionBlocks = (): PatternBlock[] =>
  useSongStore.getState().progression.filter((p) => (p.sectionId ?? p.id) === "S1");
const section = () => useSongStore.getState().sections.find((s) => s.id === "S1")!;

describe("deleting a block removes its lyric line", () => {
  beforeEach(() => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(song)));
  });

  it("removes the block and its line, keeping the views 1:1", () => {
    expect(section().lines.length).toBe(2);
    expect(sectionBlocks().length).toBe(2);

    // What requestDeleteBlock does for block B2 (line L2).
    const store = useSongStore.getState();
    withHistoryGroup(() => {
      store.removeLine("S1", "L2");
      store.removePatternBlock("B2");
    });

    const sec = section();
    expect(sec.lines.some((l) => l.id === "L2")).toBe(false);
    expect(sec.lines.length).toBe(1);
    expect(sec.chords.some((c) => c.id === "c1")).toBe(false);
    const blocks = sectionBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0].lineId).toBe("L1");
    expect(blocks.length).toBe(sec.lines.filter((l) => !l._isChordOverflow).length);
  });

  it("is a single undo step", () => {
    const store = useSongStore.getState();
    withHistoryGroup(() => {
      store.removeLine("S1", "L2");
      store.removePatternBlock("B2");
    });
    expect(section().lines.length).toBe(1);

    useSongStore.getState().undo();
    expect(section().lines.length).toBe(2);
    expect(sectionBlocks().length).toBe(2);
  });
});
