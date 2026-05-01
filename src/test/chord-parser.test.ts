import { describe, expect, it } from "vitest";
import { COMMON_QUALITIES, parseChord, QUALITY_FAMILY, commonQualitiesByFamily } from "@/lib/music/chords";

describe("parseChord — Phase 1.5 extended qualities", () => {
  it("parses power chord", () => {
    expect(parseChord("C5")?.quality).toBe("5");
  });
  it("parses altered dominants", () => {
    expect(parseChord("G7alt")?.quality).toBe("7alt");
    expect(parseChord("D7#5")?.quality).toBe("7#5");
    expect(parseChord("D7b9")?.quality).toBe("7b9");
    expect(parseChord("D7#9")?.quality).toBe("7#9");
  });
  it("parses extended majors and minors", () => {
    expect(parseChord("Fmaj11")?.quality).toBe("maj11");
    expect(parseChord("Fmaj13")?.quality).toBe("maj13");
    expect(parseChord("Bm11")?.quality).toBe("min11");
    expect(parseChord("Bm13")?.quality).toBe("min13");
    expect(parseChord("FM11")?.quality).toBe("maj11");
    expect(parseChord("FM13")?.quality).toBe("maj13");
  });
  it("parses add11 and 6/9", () => {
    expect(parseChord("Aadd11")?.quality).toBe("add11");
    expect(parseChord("C6/9")?.quality).toBe("6/9");
  });
});

describe("parseChord — regression guards (ordering invariant)", () => {
  it("does not let new entries shadow short prefixes", () => {
    expect(parseChord("C")?.quality).toBe("maj");
    expect(parseChord("Cm")?.quality).toBe("min");
    expect(parseChord("C7")?.quality).toBe("7");
    expect(parseChord("C9")?.quality).toBe("9");
    expect(parseChord("C6")?.quality).toBe("6");
    expect(parseChord("Cmaj7")?.quality).toBe("maj7");
    expect(parseChord("Cmaj9")?.quality).toBe("maj9");
    expect(parseChord("Cm7")?.quality).toBe("min7");
    expect(parseChord("Cm9")?.quality).toBe("min9");
    expect(parseChord("Cadd9")?.quality).toBe("add9");
    expect(parseChord("Cdim")?.quality).toBe("dim");
    expect(parseChord("Cdim7")?.quality).toBe("dim7");
    expect(parseChord("Csus2")?.quality).toBe("sus2");
    expect(parseChord("Csus4")?.quality).toBe("sus4");
    expect(parseChord("Csus")?.quality).toBe("sus4");
    expect(parseChord("CmMaj7")?.quality).toBe("minMaj7");
    expect(parseChord("Cm7b5")?.quality).toBe("m7b5");
    expect(parseChord("Caug")?.quality).toBe("aug");
  });
  it("preserves slash-bass parsing alongside extended qualities", () => {
    const c = parseChord("Fmaj13/A");
    expect(c?.quality).toBe("maj13");
    expect(c?.bass).toBe("A");
  });
});
