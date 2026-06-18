import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, patternUsedBeats } from "@/store/song";

/**
 * Phase 2: a pattern block can be LOCKED to a fixed length. A locked, full
 * block rejects further chords (in both the Write tap path and the Arrange
 * paths) instead of overflowing — keeping the no-orphan invariant. A flexible
 * block always grows. A locked block whose content already exceeds its lock
 * auto-unlocks on load so nothing is dropped.
 */
const C = { root: "C", quality: "maj", display: "C", octave: 3 } as const;
const F = { root: "F", quality: "maj", display: "F", octave: 3 } as const;
const G = { root: "G", quality: "maj", display: "G", octave: 3 } as const;

const mkSong = (lockedBeats?: number) => ({
  version: 3,
  meta: { beatsPerBar: 4, beatUnit: 4, title: "Lock", keyRoot: "C", keyMode: "maj", bpm: 100 },
  sections: [
    {
      id: "S1", type: "verse", label: "V", collapsed: false,
      chords: [
        { id: "c0", chord: C, lyricsPlacement: { lineId: "L1", slotIndex: 0 } },
        { id: "c1", chord: F, lyricsPlacement: { lineId: "L1", slotIndex: 1 } },
      ],
      lines: [
        {
          id: "L1", text: "la la",
          chords: [
            { id: "c0", offset: 0, slotIndex: 0, chord: C },
            { id: "c1", offset: 1, slotIndex: 1, chord: F },
          ],
        },
      ],
    },
  ],
  progression: [{ id: "B1", sectionId: "S1", lineId: "L1", label: "V", bars: 2, beatsPerBar: 4, lockedBeats, chords: [] }],
});

const block = () => useSongStore.getState().progression.find((p) => p.id === "B1")!;

describe("block locking", () => {
  beforeEach(() => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(mkSong())));
  });

  it("a locked, full block rejects adds from both the Arrange and Write paths", () => {
    // Two 4-beat chords = 8 beats. Lock to exactly that.
    useSongStore.getState().setPatternLock("B1", 8);
    expect(block().lockedBeats).toBe(8);
    expect(patternUsedBeats(block())).toBe(8);

    // Arrange slot add — rejected.
    useSongStore.getState().addChordToPatternSlot("B1", G, 2);
    expect(block().chords.length).toBe(2);

    // Write tap add — rejected.
    const res = useSongStore.getState().placeChordInSlot("S1", "L1", 4, G);
    expect(res).toBeNull();
    expect(block().chords.length).toBe(2);
  });

  it("a locked block with room accepts adds until it is full", () => {
    useSongStore.getState().setPatternLock("B1", 12); // 3 bars, room for one more.
    useSongStore.getState().addChordToPatternSlot("B1", G, 2);
    expect(block().chords.length).toBe(3);
    expect(patternUsedBeats(block())).toBe(12);

    // Now full — the next add is rejected.
    useSongStore.getState().addChordToPatternSlot("B1", G, 3);
    expect(block().chords.length).toBe(3);
  });

  it("unlocking lets the block grow again", () => {
    useSongStore.getState().setPatternLock("B1", 8);
    useSongStore.getState().addChordToPatternSlot("B1", G, 2);
    expect(block().chords.length).toBe(2); // rejected while locked

    useSongStore.getState().setPatternLock("B1", null);
    expect(block().lockedBeats).toBeUndefined();
    useSongStore.getState().addChordToPatternSlot("B1", G, 2);
    expect(block().chords.length).toBe(3);
    expect(patternUsedBeats(block())).toBe(12);
  });

  it("a block locked shorter than its content auto-unlocks on load (nothing dropped)", () => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(mkSong(4))));
    // 8 beats of chords don't fit a 4-beat lock — the lock is dropped.
    expect(block().lockedBeats).toBeUndefined();
    expect(block().chords.length).toBe(2);
    expect(patternUsedBeats(block())).toBe(8);
  });
});
