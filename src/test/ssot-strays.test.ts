import { describe, it, expect } from "vitest";
import { useSongStore } from "@/store/song";

const ch = (d: string) => ({
  root: d.replace(/m$/, ""),
  quality: d.endsWith("m") ? "min" : "maj",
  display: d,
  octave: 3,
});
const project = (chords: unknown[], lineChords: unknown[], patternChords: unknown[]) => ({
  version: 3,
  meta: { beatsPerBar: 4, beatUnit: 4, title: "T", keyRoot: "C", keyMode: "maj", bpm: 100 },
  sections: [{ id: "S1", type: "verse", label: "V", collapsed: false, chords, lines: [{ id: "L1", text: "hi there", chords: lineChords }] }],
  progression: [{ id: "B1", sectionId: "S1", label: "V", bars: 2, beatsPerBar: 4, chords: patternChords }],
});
const sec0 = () => useSongStore.getState().sections[0];
const ids = () => sec0().chords.map((c) => c.id);

describe("SSOT stray-element handling on load", () => {
  it("a duplicated anchor id collapses to one chord", () => {
    useSongStore.getState().loadFromJSON(project(
      [],
      [
        { id: "d1", offset: 0, slotIndex: 0, chord: ch("C") },
        { id: "d1", offset: 2, slotIndex: 2, chord: ch("C") },
      ],
      [],
    ));
    expect(ids().length).toBe(1);
    expect(new Set(ids()).size).toBe(1);
  });

  it("a chord pointing at a deleted block is dropped, not kept as a stray", () => {
    useSongStore.getState().loadFromJSON(project(
      [{ id: "c1", chord: ch("C"), progressionPlacement: { patternId: "DEAD", startBeat: 0, lengthBeats: 4 } }],
      [],
      [],
    ));
    const s = useSongStore.getState();
    const dangling = sec0().chords.filter(
      (c) => c.progressionPlacement && !s.progression.some((p) => p.id === c.progressionPlacement!.patternId),
    );
    expect(dangling).toEqual([]);
  });

  it("never leaves a chord with no placement, and never duplicates ids", () => {
    useSongStore.getState().loadFromJSON(project(
      [],
      [{ id: "a1", offset: 0, slotIndex: 0, chord: ch("C") }],
      [{ id: "p1", chord: ch("G"), startBeat: 0, lengthBeats: 4 }],
    ));
    for (const c of sec0().chords) expect(!!(c.lyricsPlacement || c.progressionPlacement)).toBe(true);
    expect(new Set(ids()).size).toBe(ids().length);
  });
});
