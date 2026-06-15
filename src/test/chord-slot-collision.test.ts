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
    // A#m and G#m7 lose their stale line-0 anchor but remain block-anchored.
    const displaced = chorus.chords.filter(
      (c) => c.chord.display === "A#m" || c.chord.display === "G#m7",
    );
    expect(displaced.length).toBeGreaterThan(0);
    for (const c of displaced) {
      expect(c.progressionPlacement).toBeTruthy();
      expect(c.lyricsPlacement).toBeUndefined();
    }
  });
});
