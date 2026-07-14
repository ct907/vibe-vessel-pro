import { describe, it, expect } from "vitest";
import { useSongStore, type PatternBlock } from "@/store/song";

/**
 * Growing the last chord in a block that's already at capacity, with a
 * smaller block following it in the same section, used to silently clamp
 * the chord's length back down instead of making room for it — the
 * continuation-block fallback sized the new block off an unrelated
 * reference block instead of the chord actually being placed.
 */
const E = { root: "E", quality: "maj", display: "E", octave: 3 } as const;
const FS = { root: "F#", quality: "maj", display: "F#", octave: 3 } as const;
const G = { root: "G", quality: "maj", display: "G", octave: 3 } as const;

const sectionBlocks = (sectionId: string): PatternBlock[] =>
  useSongStore.getState().progression.filter((p) => (p.sectionId ?? p.id) === sectionId);

describe("resizing the last chord in a full block, followed by a smaller block", () => {
  it("grows the chord instead of silently clamping it back to its old length", () => {
    useSongStore.getState().resetSong();
    const sectionId = useSongStore.getState().sections[0].id;
    const line1Id = useSongStore.getState().sections[0].lines[0].id;

    useSongStore.getState().setLineText(sectionId, line1Id, "one two");
    const e = useSongStore.getState().placeChordInSlot(sectionId, line1Id, 0, E)!;
    const fs = useSongStore.getState().placeChordInSlot(sectionId, line1Id, 1, FS)!;

    const line2Id = useSongStore.getState().addLine(sectionId, line1Id);
    useSongStore.getState().setLineText(sectionId, line2Id, "three");
    const g = useSongStore.getState().placeChordInSlot(sectionId, line2Id, 0, G)!;

    // Grow E from its default 4 beats to 8 — block1 (3 bars / 12 beats) is now
    // exactly at capacity: E(8) + F#(4, still default) = 12.
    const block1 = sectionBlocks(sectionId).find((p) => p.lineId === line1Id)!;
    useSongStore.getState().resizePatternChordsWithOverflow(block1.id, [e.id], 4);

    let sec = useSongStore.getState().sections.find((s) => s.id === sectionId)!;
    expect(sec.chords.find((c) => c.id === e.id)!.progressionPlacement!.lengthBeats).toBe(8);
    expect(sec.chords.find((c) => c.id === fs.id)!.progressionPlacement!.lengthBeats).toBe(4);
    expect(sectionBlocks(sectionId).find((p) => p.lineId === line1Id)!.bars).toBe(3);
    expect(sectionBlocks(sectionId).find((p) => p.lineId === line2Id)!.bars).toBe(1);

    // Now grow F# (the last chord in the now-full block1) by half a beat.
    const block1Again = sectionBlocks(sectionId).find((p) => p.lineId === line1Id)!;
    useSongStore.getState().resizePatternChordsWithOverflow(block1Again.id, [fs.id], 0.5);

    sec = useSongStore.getState().sections.find((s) => s.id === sectionId)!;
    expect(sec.chords.find((c) => c.id === fs.id)!.progressionPlacement!.lengthBeats).toBe(4.5);
    expect(sec.chords.find((c) => c.id === e.id)!.progressionPlacement!.lengthBeats).toBe(8);

    // block1 grows to hold both chords (8 + 4.5 = 12.5 beats -> 4 bars).
    expect(sectionBlocks(sectionId).find((p) => p.lineId === line1Id)!.bars).toBe(4);

    // The unrelated, smaller line2 block is untouched.
    expect(sectionBlocks(sectionId).find((p) => p.lineId === line2Id)!.bars).toBe(1);
    expect(sec.chords.find((c) => c.id === g.id)!.progressionPlacement!.lengthBeats).toBe(4);
  });
});
