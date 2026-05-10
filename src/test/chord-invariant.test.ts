import { describe, it, expect } from "vitest";
import { parseChord, makeChordFromInput } from "@/lib/music/chords";
import { parseChordTextStrict } from "@/lib/music/chordClipboard";

describe("chord invariant: every persisted ChordSymbol round-trips through parseChord", () => {
  const samples = [
    "C", "Cm", "Cmaj7", "C7", "Cdim", "Caug", "Csus2", "Csus4",
    "F#m7", "Bbmaj9", "Db/F", "G7sus4", "Am9", "C6/9", "Em7b5",
    "F#minMaj7", "BbmM7",
  ];

  it("parseChord output re-parses to the same display", () => {
    for (const s of samples) {
      const c = parseChord(s);
      expect(c, `failed to parse ${s}`).not.toBeNull();
      const c2 = parseChord(c!.display);
      expect(c2?.display).toBe(c!.display);
    }
  });

  it("makeChordFromInput rejects garbage", () => {
    expect(makeChordFromInput("")).toBeNull();
    expect(makeChordFromInput("xyz")).toBeNull();
    expect(makeChordFromInput("Q#9")).toBeNull();
  });

  it("parseChordTextStrict surfaces invalid tokens", () => {
    const r = parseChordTextStrict("C G xyz Am Q#9");
    expect(r.clips.map((c) => c.chord.display)).toEqual(["C", "G", "Am"]);
    expect(r.invalidTokens).toEqual(["xyz", "Q#9"]);
    expect(r.totalTokens).toBe(5);
  });

  it("parseChordTextStrict accepts an all-valid input cleanly", () => {
    const r = parseChordTextStrict("C Am F G");
    expect(r.invalidTokens).toEqual([]);
    expect(r.clips).toHaveLength(4);
  });
});
