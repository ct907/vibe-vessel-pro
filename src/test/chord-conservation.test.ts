import { describe, it, expect } from "vitest";
import { useSongStore } from "@/store/song";
import dreamon from "./dreamon-song.json";

/**
 * Conservation invariants: store operations must never silently create
 * (duplicate) or lose chords, nor break the SectionChord <-> mirror linkage.
 * Regression for duplicateSection doubling its chords and for the lyric
 * edge-hop splitting a chord into a lyric-only + leftover progression-only one.
 */
function expectConsistent(label: string) {
  const s = useSongStore.getState();
  const allIds: string[] = [];
  for (const sec of s.sections) {
    for (const c of sec.chords) {
      allIds.push(c.id);
      expect(
        !!(c.lyricsPlacement || c.progressionPlacement),
        `${label}: ${sec.label}/${c.chord.display} has no placement`,
      ).toBe(true);
    }
    // line.chords mirror is a bijection of the lyric SSOT.
    const lyricSC = new Set(sec.chords.filter((c) => c.lyricsPlacement).map((c) => c.id));
    const anchorIds = sec.lines.flatMap((l) => l.chords.map((a) => a.id));
    expect(anchorIds.length, `${label}: ${sec.label} anchors vs lyric SSOT`).toBe(lyricSC.size);
    for (const id of anchorIds) expect(lyricSC.has(id), `${label}: ${sec.label} ghost anchor`).toBe(true);
    // pattern.chords mirror is a bijection of the progression SSOT.
    const progSC = new Set(sec.chords.filter((c) => c.progressionPlacement).map((c) => c.id));
    const pcIds = s.progression
      .filter((p) => (p.sectionId ?? p.id) === sec.id)
      .flatMap((p) => p.chords.map((c) => c.id));
    expect(pcIds.length, `${label}: ${sec.label} pattern chords vs prog SSOT`).toBe(progSC.size);
    for (const id of pcIds) expect(progSC.has(id), `${label}: ${sec.label} ghost pattern chord`).toBe(true);
  }
  expect(new Set(allIds).size, `${label}: duplicate SectionChord ids`).toBe(allIds.length);
}
const reload = () => useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(dreamon)));

describe("chord conservation", () => {
  it("duplicateSection copies, never doubles", () => {
    reload();
    const chorus = useSongStore.getState().sections.find((s) => s.type === "chorus")!;
    const before = chorus.chords.length;
    const newId = useSongStore.getState().duplicateSection(chorus.id)!;
    expectConsistent("duplicateSection");
    const dup = useSongStore.getState().sections.find((s) => s.id === newId)!;
    expect(dup.chords.length).toBe(before);
    // Every copied chord keeps BOTH placements where the source had them.
    expect(dup.chords.filter((c) => c.lyricsPlacement && c.progressionPlacement).length)
      .toBe(chorus.chords.filter((c) => c.lyricsPlacement && c.progressionPlacement).length);
  });

  it("hopping a chord to an adjacent row conserves it", () => {
    reload();
    const sec = useSongStore.getState().sections.find(
      (s) => s.lines.length >= 2 && s.chords.some((c) => c.lyricsPlacement && c.progressionPlacement),
    )!;
    const total = useSongStore.getState().sections.reduce((n, x) => n + x.chords.length, 0);
    const c = sec.chords.find((x) => x.lyricsPlacement && x.progressionPlacement)!;
    useSongStore.getState().moveChordsToAdjacentRow(sec.id, c.lyricsPlacement!.lineId, [c.id], 1);
    expectConsistent("hop");
    expect(useSongStore.getState().sections.reduce((n, x) => n + x.chords.length, 0)).toBe(total);
  });

  it("loading the project is already consistent", () => {
    reload();
    expectConsistent("load");
  });
});
