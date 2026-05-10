import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, getLineChordsViaSSOT } from "@/store/song";
import { parseChord } from "@/lib/music/chords";

/**
 * Cross-tab SSOT sync tests.
 *
 * Regression cover for the "drag-reorder in ProgressionsTab doesn't sync
 * to the lyric chord row" bug. The contract this test pins down:
 *   1. Section.chords array order is the single source of truth.
 *   2. After any reorder mutation, getLineChordsViaSSOT returns chords in
 *      the new SSOT array order.
 *   3. The footprint of occupied slot positions on a line is preserved —
 *      only which chord sits at each slot is swapped (UX choice b1, see
 *      the planning notes).
 */

function chord(display: string) {
  const c = parseChord(display);
  if (!c) throw new Error(`unparseable chord: ${display}`);
  return c;
}

function reset() {
  // Fresh-song reset so each test starts from a known state.
  useSongStore.getState().resetSong();
}

describe("cross-tab SSOT sync", () => {
  beforeEach(() => {
    reset();
  });

  it("reordering a chord in the progressions tab updates the lyric row order", () => {
    const store = useSongStore.getState();
    // resetSong leaves us with one section + one (empty) line + one pattern.
    const section = store.sections[0];
    const line = section.lines[0];
    const pattern = store.progression[0];
    expect(pattern.sectionId ?? pattern.id).toBe(section.id);

    // Place three chords A, B, C at slots 0, 5, 10 via the lyric API
    // (which also assigns each chord a progressionPlacement on the
    // section's pattern block).
    const a = store.placeChordInSlot(section.id, line.id, 0, chord("A"));
    const b = store.placeChordInSlot(section.id, line.id, 5, chord("B"));
    const c = store.placeChordInSlot(section.id, line.id, 10, chord("C"));
    expect(a && b && c).toBeTruthy();

    // Sanity: lyric row is A, B, C in slots 0, 5, 10.
    {
      const sec0 = useSongStore.getState().sections.find((s) => s.id === section.id)!;
      const anchors = getLineChordsViaSSOT(sec0, line.id);
      expect(anchors.map((x) => x.chord.display)).toEqual(["A", "B", "C"]);
      expect(anchors.map((x) => x.slotIndex)).toEqual([0, 5, 10]);
    }

    // Drag-reorder in the progressions tab: move C (the last chord) to
    // the front. movePatternChordToSlot is what ProgressionsTab.onDragEnd
    // calls for an intra-block reorder.
    useSongStore.getState().movePatternChordToSlot(pattern.id, c!.id, 0);

    // Lyric row order now follows SSOT (C, A, B) but the SET of occupied
    // slot positions is unchanged ({0, 5, 10}).
    const sec1 = useSongStore.getState().sections.find((s) => s.id === section.id)!;
    const anchors = getLineChordsViaSSOT(sec1, line.id);
    expect(anchors.map((x) => x.chord.display)).toEqual(["C", "A", "B"]);
    expect(anchors.map((x) => x.slotIndex)).toEqual([0, 5, 10]);
  });

  it("lyric-row order is idempotent if SSOT already matches slot order", () => {
    const store = useSongStore.getState();
    const section = store.sections[0];
    const line = section.lines[0];

    const a = store.placeChordInSlot(section.id, line.id, 0, chord("A"));
    const b = store.placeChordInSlot(section.id, line.id, 3, chord("B"));
    expect(a && b).toBeTruthy();

    // No reorder; just re-trigger derivation by issuing a no-op move
    // (moving A to its current slot).
    useSongStore.getState().moveChordToSlot(section.id, line.id, a!.id, 0);

    const sec = useSongStore.getState().sections.find((s) => s.id === section.id)!;
    const anchors = getLineChordsViaSSOT(sec, line.id);
    expect(anchors.map((x) => x.chord.display)).toEqual(["A", "B"]);
    expect(anchors.map((x) => x.slotIndex)).toEqual([0, 3]);
  });
});
