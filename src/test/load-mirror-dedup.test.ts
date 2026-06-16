import { describe, it, expect } from "vitest";
import { useSongStore, getLineChordsViaSSOT } from "@/store/song";

/**
 * Regression for "saving a row with too many / overflowing chords duplicates
 * them on reload". loadFromJSON reconstructs the SSOT from the line.chords
 * mirror; if a chord's anchor sits on two rows, or several anchors collide on
 * the same (line, slot), the rebuild used to emit duplicate / overlapping
 * SectionChords. Load is now SSOT-authoritative + de-duplicated.
 */
function noDuplicateIds() {
  for (const sec of useSongStore.getState().sections) {
    const ids = sec.chords.map((c) => c.id);
    expect(new Set(ids).size, `duplicate SectionChord ids in ${sec.label}`).toBe(ids.length);
  }
}
function renderedMatchesSsot() {
  for (const sec of useSongStore.getState().sections) {
    const rendered = sec.lines.flatMap((l) => getLineChordsViaSSOT(sec, l.id));
    const lyricSsot = sec.chords.filter((c) => c.lyricsPlacement);
    expect(rendered.length, `rendered anchors vs SSOT in ${sec.label}`).toBe(lyricSsot.length);
    // No two rendered anchors share a (line, slot).
    const seen = new Set<string>();
    for (const l of sec.lines)
      for (const a of getLineChordsViaSSOT(sec, l.id)) {
        const k = `${l.id}:${a.slotIndex}`;
        expect(seen.has(k), `overlap at ${k}`).toBe(false);
        seen.add(k);
      }
  }
}

describe("load mirror dedup", () => {
  it("a chord mirrored onto two rows is not duplicated", () => {
    useSongStore.getState().loadFromJSON({
      version: 3, meta: { beatsPerBar: 4, beatUnit: 4, title: "D", keyRoot: "C", keyMode: "maj", bpm: 100 },
      sections: [{
        id: "S1", type: "verse", label: "V", collapsed: false,
        chords: [{ id: "c0", chord: { root: "C", quality: "maj", display: "C", octave: 3 }, lyricsPlacement: { lineId: "L1", slotIndex: 0 } }],
        lines: [
          { id: "L1", text: "a", chords: [{ id: "c0", offset: 0, slotIndex: 0, chord: { root: "C", quality: "maj", display: "C", octave: 3 } }] },
          { id: "L2", text: "b", chords: [{ id: "c0", offset: 0, slotIndex: 0, chord: { root: "C", quality: "maj", display: "C", octave: 3 } }] },
        ],
      }],
      progression: [{ id: "B1", sectionId: "S1", label: "V", bars: 1, beatsPerBar: 4, chords: [] }],
    });
    noDuplicateIds();
    renderedMatchesSsot();
    expect(useSongStore.getState().sections[0].chords.length).toBe(1);
  });

  it("8 chords whose last 4 collide with the first 4 reload without overlap", () => {
    const mk = (d: string, slot: number) => ({
      id: `c${slot}_${d}`, offset: slot, slotIndex: slot,
      chord: { root: d.replace(/m$/, ""), quality: d.endsWith("m") ? "min" : "maj", display: d, octave: 3 },
    });
    // last four share slots 0,2,4,6 with the first four (the corrupt mirror).
    const anchors = [
      mk("C", 0), mk("F", 2), mk("G", 4), mk("Am", 6),
      mk("C", 0), mk("F", 2), mk("G", 4), mk("Am", 6),
    ].map((a, i) => ({ ...a, id: `id${i}` }));
    useSongStore.getState().loadFromJSON({
      version: 3, meta: { beatsPerBar: 4, beatUnit: 4, title: "O", keyRoot: "C", keyMode: "maj", bpm: 100 },
      sections: [{ id: "S1", type: "verse", label: "V", collapsed: false, chords: [], lines: [{ id: "L1", text: "la la la la", chords: anchors }] }],
      progression: [{ id: "B1", sectionId: "S1", label: "V", bars: 4, beatsPerBar: 4, chords: [] }],
    });
    noDuplicateIds();
    renderedMatchesSsot();
    // All eight chords survive.
    expect(useSongStore.getState().sections[0].chords.filter((c) => c.lyricsPlacement).length).toBe(8);
  });
});
