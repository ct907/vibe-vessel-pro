import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, patternUsedBeats, type PatternBlock } from "@/store/song";

/**
 * Phase 4 invariants for the lyric-authoritative flex model:
 *  - a line's block GROWS to fit its chords (no overflow / continuation block),
 *  - line CRUD keeps blocks 1:1 with non-overflow lines,
 *  - editing lyric text leaves every chord on a unique, valid chord-row slot.
 */
const C = { root: "C", quality: "maj", display: "C", octave: 3 } as const;
const G = { root: "G", quality: "maj", display: "G", octave: 3 } as const;

const sectionBlocks = (sectionId: string): PatternBlock[] =>
  useSongStore.getState().progression.filter((p) => (p.sectionId ?? p.id) === sectionId);

// One section, one line carrying `n` chords (each the default 4 beats).
const songWithChords = (n: number) => {
  const chords = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    chord: C,
    lyricsPlacement: { lineId: "L1", slotIndex: i },
    progressionPlacement: { patternId: "B1", startBeat: i * 4, lengthBeats: 4 },
  }));
  return {
    version: 3,
    meta: { beatsPerBar: 4, beatUnit: 4, title: "T", keyRoot: "C", keyMode: "maj", bpm: 100 },
    sections: [
      {
        id: "S1", type: "verse", label: "V", collapsed: false,
        chords,
        lines: [
          {
            id: "L1", text: "one two three four five six",
            chords: chords.map((c, i) => ({ id: c.id, offset: i, slotIndex: i, wordIndex: i, chord: C })),
          },
        ],
      },
    ],
    progression: [{ id: "B1", sectionId: "S1", lineId: "L1", label: "V", bars: 4, beatsPerBar: 4, chords: [] }],
  };
};

describe("flexible blocks", () => {
  it("six 4-beat chords on one line flex into a single 24-beat block (no overflow)", () => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(songWithChords(6))));
    const blocks = sectionBlocks("S1");
    expect(blocks.length).toBe(1);
    expect(blocks[0].chords.length).toBe(6);
    expect(patternUsedBeats(blocks[0])).toBe(24);
    expect(blocks[0].bars).toBe(6);
  });
});

// The 1:1 line↔block invariant is enforced by the derivation, which runs on
// load and on every SSOT chord operation — so it holds after any chord edit
// that follows a line-CRUD change.
describe("line ↔ block 1:1 (derivation-enforced)", () => {
  beforeEach(() => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(songWithChords(2))));
  });

  const expect1to1 = () => {
    const sec = useSongStore.getState().sections.find((s) => s.id === "S1")!;
    const nonOverflow = sec.lines.filter((l) => !l._isChordOverflow);
    expect(sectionBlocks("S1").length).toBe(nonOverflow.length);
  };

  it("adding a line and placing a chord yields a matching new block", () => {
    expect(sectionBlocks("S1").length).toBe(1);
    const newLine = useSongStore.getState().addLine("S1");
    useSongStore.getState().placeChordInSlot("S1", newLine, 0, G);
    expect1to1();
    expect(sectionBlocks("S1").length).toBe(2);
  });

  it("splitting a line then editing chords keeps blocks 1:1 with the rows", () => {
    // Split "one two three four five six" into two rows.
    const res = useSongStore.getState().splitLine("S1", "L1", 7);
    expect(res?.newLineId).toBeTruthy();
    // A chord op runs the derivation, which materializes a block per row.
    useSongStore.getState().placeChordInSlot("S1", res!.newLineId, 6, G);
    expect1to1();
    expect(sectionBlocks("S1").length).toBe(2);
  });
});

describe("editing lyric text keeps chord-row slots valid", () => {
  it("every chord keeps a unique, defined slot after a text edit reflow", () => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(songWithChords(3))));
    // Insert a new leading word — chords reflow onto new word positions.
    useSongStore.getState().setLineText("S1", "L1", "zero one two three four five six");

    const line = useSongStore.getState().sections.find((s) => s.id === "S1")!.lines.find((l) => l.id === "L1")!;
    const slots = line.chords.map((c) => c.slotIndex);
    expect(slots.every((s) => typeof s === "number")).toBe(true);
    expect(new Set(slots).size).toBe(slots.length); // all unique
  });
});
