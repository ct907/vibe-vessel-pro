import { describe, it, expect } from "vitest";
import { useSongStore } from "@/store/song";
import dreamon from "./dreamon-song.json";

/**
 * The overflow split is device-specific, so it is recomputed on load (and on
 * width change) rather than persisted. That reflow used to corrupt the data —
 * the user saw the last chords duplicate the first. This guards that the
 * load -> reflow -> save cycle stays lossless and duplicate-free across device
 * widths.
 */
function assertClean(label: string) {
  const s = useSongStore.getState();
  const ids: string[] = [];
  for (const sec of s.sections) {
    for (const c of sec.chords) ids.push(c.id);
    const per = new Map<string, Set<number>>();
    for (const c of sec.chords) {
      const lp = c.lyricsPlacement;
      if (!lp) continue;
      const used = per.get(lp.lineId) ?? new Set<number>();
      expect(used.has(lp.slotIndex), `${label}: collision in ${sec.label}`).toBe(false);
      used.add(lp.slotIndex);
      per.set(lp.lineId, used);
    }
    const lyric = new Set(sec.chords.filter((c) => c.lyricsPlacement).map((c) => c.id));
    const anchors = sec.lines.flatMap((l) => l.chords.map((a) => a.id));
    expect(anchors.length, `${label}: anchor mirror in ${sec.label}`).toBe(lyric.size);
  }
  expect(new Set(ids).size, `${label}: duplicate ids`).toBe(ids.length);
  return ids.length;
}
const reflowAll = (w: number) =>
  useSongStore.getState().sections.forEach((s) => useSongStore.getState().autoLayoutSection(s.id, w, 28));

describe("reflow-on-load is lossless across devices", () => {
  it("phone -> desktop -> phone through save cycles keeps every chord once", () => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(dreamon)));
    const n = assertClean("load");

    reflowAll(360);
    expect(assertClean("reflow-phone")).toBe(n);
    useSongStore.getState().loadFromJSON(useSongStore.getState().toJSON());
    expect(assertClean("reload")).toBe(n);

    reflowAll(1280);
    expect(assertClean("reflow-desktop")).toBe(n);
    useSongStore.getState().loadFromJSON(useSongStore.getState().toJSON());
    expect(assertClean("reload2")).toBe(n);

    reflowAll(360);
    expect(assertClean("reflow-phone-again")).toBe(n);
  });
});
