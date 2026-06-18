import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore } from "@/store/song";

/**
 * Phase 2.5: an instrumental section has chord rows but no lyric text. Under
 * the SSOT model these rows are still `lines` (with empty text), each owning
 * exactly one pattern block — which is how a section can hold more chord
 * blocks than it has words.
 */
const C = { root: "C", quality: "maj", display: "C", octave: 3 } as const;
const G = { root: "G", quality: "maj", display: "G", octave: 3 } as const;

const emptySong = {
  version: 3,
  meta: { beatsPerBar: 4, beatUnit: 4, title: "T", keyRoot: "C", keyMode: "maj", bpm: 100 },
  sections: [{ id: "S0", type: "verse", label: "V", collapsed: false, chords: [], lines: [{ id: "L0", text: "", chords: [] }] }],
  progression: [{ id: "S0", sectionId: "S0", lineId: "L0", label: "V", bars: 1, beatsPerBar: 4, chords: [] }],
};

describe("instrumental sections", () => {
  beforeEach(() => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(emptySong)));
  });

  it("creates an instrumental-typed section with rows that map 1:1 to blocks", () => {
    const id = useSongStore.getState().addSection("instrumental");
    const row1 = useSongStore.getState().sections.find((s) => s.id === id)!.lines[0].id;
    const row2 = useSongStore.getState().addLine(id);

    // Add a chord to each chord row (this runs the SSOT derivation).
    useSongStore.getState().placeChordInSlot(id, row1, 0, C);
    useSongStore.getState().placeChordInSlot(id, row2, 0, G);

    const st = useSongStore.getState();
    const sec = st.sections.find((s) => s.id === id)!;
    expect(sec.type).toBe("instrumental");
    // Rows carry no lyric text.
    expect(sec.lines.every((l) => l.text === "")).toBe(true);

    // One block per non-overflow row.
    const nonOverflow = sec.lines.filter((l) => !l._isChordOverflow);
    const blocks = st.progression.filter((p) => (p.sectionId ?? p.id) === id);
    expect(blocks.length).toBe(nonOverflow.length);
    expect(blocks.length).toBe(2);

    // Each row's chord lands in that row's own block.
    const b1 = blocks.find((b) => b.lineId === row1)!;
    const b2 = blocks.find((b) => b.lineId === row2)!;
    expect(b1.chords.map((c) => c.chord.display)).toEqual(["C"]);
    expect(b2.chords.map((c) => c.chord.display)).toEqual(["G"]);
  });

  it("converting a verse to instrumental keeps its chords", () => {
    // Seed section S0 already has a chord row; add a chord, then convert.
    useSongStore.getState().placeChordInSlot("S0", "L0", 0, C);
    useSongStore.getState().updateSection("S0", { type: "instrumental" });

    const st = useSongStore.getState();
    expect(st.sections.find((s) => s.id === "S0")!.type).toBe("instrumental");
    const block = st.progression.find((p) => (p.sectionId ?? p.id) === "S0")!;
    expect(block.chords.map((c) => c.chord.display)).toEqual(["C"]);
  });
});
