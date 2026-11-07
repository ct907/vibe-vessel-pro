import { describe, expect, it } from "vitest";
import { nashvilleLadder, parseNashvilleInput, rootToPc, transposeChord } from "@/lib/music/chords";
import type { Mode } from "@/lib/music/chords";
import {
  buildJamChord,
  jamQuality,
  nextAccidental,
  nextExt,
  nextType,
  naturalType,
  normalizeStep,
  stepFromPrefix,
  type JamStep,
} from "@/lib/music/jam";

const step = (degree: number, over: Partial<JamStep> = {}): Omit<JamStep, "id"> => ({
  degree, accidental: 0, type: null, ext: 0, ...over,
});
const chord = (s: Omit<JamStep, "id">, key = "C", mode: Mode = "maj") => buildJamChord(s, key, mode).display;

describe("buildJamChord — plain degrees", () => {
  it("matches the diatonic ladder in C major", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => chord(step(d)))).toEqual(["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
  });
  it("follows the key's spelling", () => {
    expect(chord(step(4), "F")).toBe("Bb");
  });
});

describe("8 — accidental", () => {
  it("cycles natural → flat → sharp → natural", () => {
    expect(nextAccidental(0)).toBe(-1);
    expect(nextAccidental(-1)).toBe(1);
    expect(nextAccidental(1)).toBe(0);
  });
  it("borrows a major chord with flat spelling", () => {
    expect(chord(step(7, { accidental: -1 }))).toBe("Bb");
    expect(chord(step(3, { accidental: -1 }))).toBe("Eb");
    expect(chord(step(6, { accidental: -1 }))).toBe("Ab");
  });
  it("spells sharps with sharps", () => {
    expect(chord(step(4, { accidental: 1 }))).toBe("F#");
  });
  it("♯ on degree x is the same chord as Nashville x.5", () => {
    for (const [key, mode] of [["C", "maj"], ["G", "maj"], ["F", "maj"], ["A", "min"]] as const) {
      for (const d of [1, 2, 3, 4, 5, 6]) {
        const jam = buildJamChord(step(d, { accidental: 1 }), key, mode);
        const [legacy] = parseNashvilleInput(`${d}.5`, key, mode)!;
        expect(rootToPc(jam.root)).toBe(rootToPc(legacy.root));
        expect(jam.quality).toBe(legacy.quality);
      }
    }
  });
});

describe("0 — chord type", () => {
  it("cycles from the natural type and returns to null", () => {
    let t = nextType(null, "maj");
    const seen: (string | null)[] = [t];
    while (t !== null) { t = nextType(t, "maj"); seen.push(t); }
    expect(seen).toEqual(["min", "dim", "aug", "sus4", "sus2", null]);
  });
  it("starts after the natural type for minor degrees", () => {
    expect(nextType(null, "min")).toBe("dim");
    expect(nextType("maj", "min")).toBe(null);
  });
  it("gives iv in a major key", () => {
    expect(chord(step(4, { type: "min" }))).toBe("Fm");
  });
  it("treats borrowed roots as naturally major", () => {
    expect(naturalType(7, -1, "C", "maj")).toBe("maj");
    expect(naturalType(7, 0, "C", "maj")).toBe("dim");
  });
});

describe("9 — extensions", () => {
  const ext = (d: number, e: JamStep["ext"], over: Partial<JamStep> = {}, key = "C", mode: Mode = "maj") =>
    chord(step(d, { ext: e, ...over }), key, mode);

  it("uses the diatonic seventh on untouched degrees", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => ext(d, 7))).toEqual(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7b5"]);
  });
  it("is mode-aware", () => {
    expect(ext(4, 7, {}, "D", "dorian")).toBe("G7");
    expect(ext(1, 7, {}, "A", "harmonic-minor")).toBe("AmMaj7");
    expect(ext(7, 7, {}, "A", "harmonic-minor")).toBe("G#dim7");
  });
  it("extends by seventh type", () => {
    expect([9, 11, 13].map((e) => ext(1, e as JamStep["ext"]))).toEqual(["Cmaj9", "Cmaj11", "Cmaj13"]);
    expect([9, 11, 13].map((e) => ext(5, e as JamStep["ext"]))).toEqual(["G9", "G9#11", "G13"]);
    expect([9, 11, 13].map((e) => ext(2, e as JamStep["ext"]))).toEqual(["Dm9", "Dm11", "Dm13"]);
  });
  it("uses explicit types once a chord is overridden", () => {
    expect(ext(2, 7, { type: "maj" })).toBe("D7");
    expect(ext(7, 7, { accidental: -1 })).toBe("Bb7");
    expect(ext(1, 7, { type: "dim" })).toBe("Cdim7");
    expect(ext(1, 7, { type: "aug" })).toBe("C7#5");
  });
  it("falls back to the triad family in pentatonic and blues", () => {
    expect(ext(1, 7, {}, "C", "pentatonic-maj")).toBe("Cmaj7");
    expect(ext(1, 7, {}, "C", "blues")).toBe("Cm7");
    expect(ext(2, 7, {}, "C", "blues")).toBe("D#7");
  });
  it("skips extensions the chord can't take", () => {
    expect(jamQuality(step(7, { ext: 9 }), "C", "maj")).toBeNull();
    expect(nextExt(step(7, { ext: 7 }), "C", "maj")).toBe(0);
    expect(nextExt(step(1, { type: "sus4" }), "C", "maj")).toBe(0);
    expect(nextExt(step(1, { ext: 13 }), "C", "maj")).toBe(0);
    expect(nextExt(step(1), "C", "maj")).toBe(7);
  });
  it("drops an extension that disappears after a type change", () => {
    expect(normalizeStep(step(1, { ext: 9, type: "sus4" }), "C", "maj").ext).toBe(0);
    expect(normalizeStep(step(1, { ext: 9 }), "C", "maj").ext).toBe(9);
  });
});

describe("prefix (T9 press-before-number)", () => {
  it("applies an armed flat to the next number", () => {
    const s = stepFromPrefix("a", 7, { accidental: -1, type: null, ext: 7 }, "C", "maj");
    expect(buildJamChord(s, "C", "maj").display).toBe("Bb7");
  });
  it("stores a type that matches the natural one as null", () => {
    expect(stepFromPrefix("a", 2, { accidental: 0, type: "min", ext: 0 }, "C", "maj").type).toBeNull();
  });
});

describe("storage round-trip under a section key change", () => {
  it("resolves in the sounding key and stores relative to the song key", () => {
    const offset = 2;
    const sounding = buildJamChord(step(5, { ext: 7 }), "D", "maj");
    expect(sounding.display).toBe("A7");
    const stored = transposeChord(sounding, -offset);
    expect(stored.display).toBe("G7");
    expect(transposeChord(stored, offset).display).toBe("A7");
  });
});

describe("scale length", () => {
  it("has fewer degrees in pentatonic and blues", () => {
    expect(nashvilleLadder("C", "pentatonic-maj")).toHaveLength(5);
    expect(nashvilleLadder("C", "blues")).toHaveLength(6);
  });
});
