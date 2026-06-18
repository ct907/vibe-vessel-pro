import { describe, it, expect } from "vitest";
import { useSongStore, getLineChordsViaSSOT } from "@/store/song";
import dreamon from "./dreamon-song.json";

/**
 * Regression for the Write-tab sync bug: a chord moved between pattern blocks
 * kept a stale lyric anchor on its old row, so two chords landed on the same
 * (line, slot) and rendered overlapping. The uploaded "Dream On" project has
 * two such collisions in its Chorus (A#m + G#m7 on line 0, slots 0 and 2).
 */
describe("lyric slot collision repair", () => {
  it("loads the project with no two chords sharing a line+slot", () => {
    useSongStore.getState().loadFromJSON(dreamon);
    const sections = useSongStore.getState().sections;

    for (const sec of sections) {
      const perLine = new Map<string, Set<number>>();
      for (const sc of sec.chords) {
        const lp = sc.lyricsPlacement;
        if (!lp) continue;
        const used = perLine.get(lp.lineId) ?? new Set<number>();
        expect(
          used.has(lp.slotIndex),
          `collision on ${sec.label} line ${lp.lineId} slot ${lp.slotIndex}`,
        ).toBe(false);
        used.add(lp.slotIndex);
        perLine.set(lp.lineId, used);
      }
      // The rendered lyric rows must also be collision-free.
      for (const line of sec.lines) {
        const anchors = getLineChordsViaSSOT(sec, line.id);
        const slots = anchors.map((a) => a.slotIndex ?? 0);
        expect(new Set(slots).size).toBe(slots.length);
      }
    }
  });

  it("keeps the displaced chorus chords alive in the progression view", () => {
    useSongStore.getState().loadFromJSON(dreamon);
    const sections = useSongStore.getState().sections;
    const chorus = sections.find((s) => s.type === "chorus")!;
    // The previously-colliding A#m and G#m7 are kept (not lost): they survive
    // in the SSOT, slid onto free slots so they no longer overlap.
    const displaced = chorus.chords.filter(
      (c) => c.chord.display === "A#m" || c.chord.display === "G#m7",
    );
    expect(displaced.length).toBeGreaterThan(0);
    for (const c of displaced) {
      expect(c.lyricsPlacement || c.progressionPlacement).toBeTruthy();
    }
  });

  it("auto-anchors a progression-only chord on load without collision", () => {
    // A section whose JSON has one word-anchored chord (C) and one
    // progression-only chord (G). Under lyrics-as-SSOT the loader re-homes G
    // onto the block's line so every chord is lyric-anchored.
    useSongStore.getState().loadFromJSON({
      version: 3,
      meta: { beatsPerBar: 4, beatUnit: 4, title: "T", keyRoot: "C", keyMode: "maj", bpm: 100 },
      sections: [{
        id: "S1", type: "verse", label: "V", collapsed: false,
        chords: [
          { id: "a0", chord: { root: "C", quality: "maj", display: "C", octave: 3 }, lyricsPlacement: { lineId: "L1", slotIndex: 0 }, progressionPlacement: { patternId: "B1", startBeat: 0, lengthBeats: 4 } },
          { id: "a1", chord: { root: "G", quality: "maj", display: "G", octave: 3 }, progressionPlacement: { patternId: "B1", startBeat: 4, lengthBeats: 4 } },
        ],
        lines: [{ id: "L1", text: "hi", chords: [{ id: "a0", offset: 0, slotIndex: 0, chord: { root: "C", quality: "maj", display: "C", octave: 3 }, mirrorId: "a0" }] }],
      }],
      progression: [{ id: "B1", sectionId: "S1", label: "V", bars: 2, beatsPerBar: 4, chords: [
        { id: "a0", chord: { root: "C", quality: "maj", display: "C", octave: 3 }, startBeat: 0, lengthBeats: 4, mirrorId: "a0" },
        { id: "a1", chord: { root: "G", quality: "maj", display: "G", octave: 3 }, startBeat: 4, lengthBeats: 4 },
      ] }],
    });

    const sec = useSongStore.getState().sections.find((s) => s.id === "S1")!;
    // Every chord is lyric-anchored — no progression-only leftovers.
    for (const c of sec.chords) {
      expect(c.lyricsPlacement, `chord ${c.chord.display} should be lyric-anchored`).toBeTruthy();
      expect(c.progressionPlacement, `chord ${c.chord.display} should keep its block placement`).toBeTruthy();
    }
    // The formerly progression-only G is anchored without colliding with C.
    const g = sec.chords.find((c) => c.chord.display === "G")!;
    const lp = g.lyricsPlacement!;
    const sameSlot = sec.chords.filter(
      (c) => c.id !== g.id && c.lyricsPlacement?.lineId === lp.lineId && c.lyricsPlacement?.slotIndex === lp.slotIndex,
    );
    expect(sameSlot).toEqual([]);
  });
});
