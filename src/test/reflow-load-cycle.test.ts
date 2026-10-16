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

/**
 * The reflow runs after every chord add. It used to left-pack each line from
 * slot 0, so a chord tapped above a word jumped to the start of the line and
 * any hand-placed chord snapped back the next time a chord was added.
 */
describe("reflow keeps chords where the writer put them", () => {
  const C = { root: "C", quality: "maj", display: "C", octave: 3 } as const;
  const AM = { root: "A", quality: "min", display: "Am", octave: 3 } as const;
  const CMAJ7 = { root: "C", quality: "maj7", display: "Cmaj7", octave: 3 } as const;
  const slots = () => {
    const sec = useSongStore.getState().sections[0];
    return sec.chords.map((c) => c.lyricsPlacement!.slotIndex);
  };
  const setup = () => {
    useSongStore.getState().resetSong();
    const sec = useSongStore.getState().sections[0];
    useSongStore.getState().setLineText(sec.id, sec.lines[0].id, "Moths are dancing where you used to stand");
    return { sectionId: sec.id, lineId: sec.lines[0].id };
  };

  it("leaves a tapped chord on its slot", () => {
    const { sectionId, lineId } = setup();
    useSongStore.getState().placeChordInSlot(sectionId, lineId, 6, AM);
    useSongStore.getState().autoLayoutSection(sectionId, 1280, 28);
    expect(slots()).toEqual([6]);
  });

  it("only nudges a chord right as far as needed to clear the one before it", () => {
    const { sectionId, lineId } = setup();
    useSongStore.getState().placeChordInSlot(sectionId, lineId, 3, CMAJ7);
    useSongStore.getState().placeChordInSlot(sectionId, lineId, 6, C);
    useSongStore.getState().placeChordInSlot(sectionId, lineId, 7, AM);
    useSongStore.getState().autoLayoutSection(sectionId, 1280, 28);
    // Cmaj7 is 2 slots wide; C keeps 6; Am moves from 7 to 8 to leave one slot of spacing.
    expect(slots()).toEqual([3, 6, 8]);
  });

  it("pulls chords left when they would run past the row's capacity", () => {
    const { sectionId, lineId } = setup();
    useSongStore.getState().placeChordInSlot(sectionId, lineId, 40, C);
    useSongStore.getState().placeChordInSlot(sectionId, lineId, 45, AM);
    // 360px phone: 0.8 * 360 / 28 = 10 slots per line.
    useSongStore.getState().autoLayoutSection(sectionId, 360, 28);
    const [c, am] = slots();
    expect(am).toBeLessThanOrEqual(9);
    expect(am - c).toBeGreaterThanOrEqual(2);
  });
});
