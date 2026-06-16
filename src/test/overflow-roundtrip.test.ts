import { describe, it, expect } from "vitest";
import { useSongStore } from "@/store/song";
import dreamon from "./dreamon-song.json";

/**
 * Repro for the "duplicate / missing / ghost chord after save + reload" report.
 *
 * autoLayoutSection splits a long chord row into a visible row + device-specific
 * `_isChordOverflow` continuation rows, each packed from slot 0. toJSON strips
 * those rows and re-homes their chords onto the parent line — and must NOT reuse
 * the per-row slot indices, or the parent ends up with two chords on one slot
 * (overlap on reload) and the layout drifts.
 */
function lyricAnchoredIds(): Set<string> {
  const s = useSongStore.getState();
  const ids = new Set<string>();
  for (const sec of s.sections)
    for (const sc of sec.chords) if (sc.lyricsPlacement) ids.add(sc.id);
  return ids;
}

function serializedCollisions(saved: unknown): number {
  let n = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const sec of (saved as any).sections) {
    const per = new Map<string, Set<number>>();
    for (const sc of sec.chords) {
      const lp = sc.lyricsPlacement;
      if (!lp) continue;
      let set = per.get(lp.lineId);
      if (!set) { set = new Set(); per.set(lp.lineId, set); }
      if (set.has(lp.slotIndex)) n++;
      else set.add(lp.slotIndex);
    }
  }
  return n;
}

describe("overflow row save/reload roundtrip", () => {
  it("merging overflow rows on save never collides or loses chords", () => {
    useSongStore.getState().loadFromJSON(dreamon);
    // Force overflow rows on a narrow viewport.
    for (const sec of useSongStore.getState().sections) {
      useSongStore.getState().autoLayoutSection(sec.id, 200, 28);
    }
    const hadOverflow = useSongStore
      .getState()
      .sections.some((sec) => sec.lines.some((l) => l._isChordOverflow));
    expect(hadOverflow, "expected the narrow layout to spawn overflow rows").toBe(true);

    const before = lyricAnchoredIds();
    const saved = useSongStore.getState().toJSON();

    // The serialized file itself must be collision-free…
    expect(serializedCollisions(saved), "collisions written to disk").toBe(0);

    // …and reloading must neither lose nor duplicate any lyric-anchored chord.
    useSongStore.getState().loadFromJSON(saved);
    const after = lyricAnchoredIds();
    expect([...after].sort(), "lyric-anchored chords changed across roundtrip").toEqual(
      [...before].sort(),
    );
  });
});
