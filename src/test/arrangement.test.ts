import { describe, expect, it } from "vitest";
import { parseChord } from "@/lib/music/chords";
import {
  buildArrangement,
  padNotes,
  renderTrack,
  windowEvents,
  type ChordEvent,
  type PadSettings,
  type Track,
} from "@/lib/music/arrangement";
import { DEFAULT_ARP, type ArpSettings } from "@/store/sound";
import type { PatternBlock, Section } from "@/store/song";

const c = (s: string) => parseChord(s)!;
const ev = (chord: string, startBeat: number, lengthBeats: number): ChordEvent => ({ chord: c(chord), startBeat, lengthBeats });
const pad = (arp: Partial<ArpSettings>, armed = true): PadSettings => ({ arp: { ...DEFAULT_ARP, ...arp }, armed, octave: 4 });
const fourFour = { beatsPerBar: 4, beatUnit: 4 };

describe("padNotes", () => {
  it("holds the chord when the section's arp is off", () => {
    const notes = padNotes(ev("C", 0, 4), pad({}, false), fourFour);
    expect(notes.every((n) => n.startBeat === 0 && n.lengthBeats === 4)).toBe(true);
    expect(notes.length).toBeGreaterThanOrEqual(3);
  });

  it("re-strikes the block chord at the pattern rate", () => {
    const notes = padNotes(ev("C", 0, 4), pad({ pattern: "all", repeat: "1/4" }), fourFour);
    expect([...new Set(notes.map((n) => n.startBeat))]).toEqual([0, 1, 2, 3]);
    expect(notes.every((n) => n.lengthBeats === 1)).toBe(true);
  });

  it("arpeggiates one note per step, low to high", () => {
    const notes = padNotes(ev("C", 0, 2), pad({ pattern: "asc", repeat: "1/8" }), fourFour);
    expect(notes.map((n) => n.startBeat)).toEqual([0, 0.5, 1, 1.5]);
    expect(notes[0].midi).toBeLessThan(notes[1].midi);
  });

  it("clips the last step to the chord's end", () => {
    const notes = padNotes(ev("C", 0, 1.25), pad({ pattern: "asc", repeat: "1/8" }), fourFour);
    expect(notes.map((n) => [n.startBeat, n.lengthBeats])).toEqual([[0, 0.5], [0.5, 0.5], [1, 0.25]]);
  });

  it("uses triplet steps in 3/4 and 6/8", () => {
    const notes = padNotes(ev("C", 0, 2), pad({ pattern: "asc", repeat: "1/8" }), { beatsPerBar: 3, beatUnit: 4 });
    expect(notes.length).toBe(6);
    expect(notes[1].startBeat).toBeCloseTo(1 / 3, 6);
  });

  it("swings the off-beat steps", () => {
    const notes = padNotes(ev("C", 0, 2), pad({ pattern: "asc", repeat: "1/8", swing: 0.75 }), fourFour);
    expect(notes[1].startBeat).toBeGreaterThan(0.5);
    expect(notes[2].startBeat).toBe(1);
  });

  it("gives the same random arp every time it is rendered", () => {
    const a = padNotes(ev("Cmaj7", 8, 4), pad({ pattern: "random", repeat: "1/16" }), fourFour).map((n) => n.midi);
    const b = padNotes(ev("Cmaj7", 8, 4), pad({ pattern: "random", repeat: "1/16" }), fourFour).map((n) => n.midi);
    expect(a).toEqual(b);
    expect(a.some((m, i) => i > 0 && m === a[i - 1])).toBe(false);
  });

  it("plays the bass note an octave below the root and drops the root in Bass mode", () => {
    const notes = padNotes(ev("C", 0, 4), pad({ pattern: "asc", repeat: "1/4", bassMode: "bass", bassRepeat: "1/2" }), fourFour);
    const bass = notes.filter((n) => n.velocity === 0.95);
    expect(bass.map((n) => n.startBeat)).toEqual([0, 2]);
    expect(bass[0].midi).toBe(48);
    expect(notes.filter((n) => n.velocity !== 0.95).some((n) => n.midi === 60)).toBe(false);
  });
});

describe("windowEvents", () => {
  const track: Track = renderTrack(
    { chords: [ev("C", 0, 4), ev("F", 4, 2), ev("G", 6, 2)], refs: [], sections: [], loopBeats: 8 },
    8,
    { pad: () => pad({ pattern: "asc", repeat: "1/8" }), meter: fourFour, click: false },
  );
  const collect = (cuts: number[], epoch = { abs: 0, local: 0 }, loop = true) => {
    const out: string[] = [];
    for (let i = 1; i < cuts.length; i++) {
      for (const { note, abs } of windowEvents(track, cuts[i - 1], cuts[i], epoch, loop).notes) out.push(`${abs.toFixed(4)}:${note.midi}`);
    }
    return out;
  };

  it("gives the same notes however the time is sliced, across loop wraps", () => {
    const whole = collect([0, 32]);
    expect(whole.length).toBe(track.notes.length * 4);
    expect(collect([0, 0.3, 7.99, 8, 8.01, 15.5, 16, 22.7, 32])).toEqual(whole);
    expect(new Set(whole).size).toBe(whole.length);
  });

  it("starts mid-loop from the epoch", () => {
    const fromG = collect([0, 2], { abs: 0, local: 6 });
    expect(fromG[0]).toBe(`0.0000:${track.notes.find((n) => n.startBeat === 6)!.midi}`);
    expect(fromG.length).toBe(track.notes.filter((n) => n.startBeat >= 6).length);
  });

  it("stops at the end without looping and reports where", () => {
    const w = windowEvents(track, 0, 20, { abs: 0, local: 0 }, false);
    expect(w.notes.length).toBe(track.notes.length);
    expect(w.endAbs).toBe(8);
  });

  it("lists chord starts with their index", () => {
    const w = windowEvents(track, 0, 16, { abs: 0, local: 0 }, true);
    expect(w.chords.map((x) => `${x.index}@${x.abs}`)).toEqual(["0@0", "1@4", "2@6", "0@8", "1@12", "2@14"]);
  });
});

describe("buildArrangement", () => {
  const section = (id: string, chords: [string, string, number, number][]): Section => ({
    id, label: id, type: "verse", collapsed: false, lines: [],
    chords: chords.map(([sid, name, startBeat, lengthBeats]) => ({
      id: sid, chord: c(name), progressionPlacement: { patternId: id, startBeat, lengthBeats },
    })),
  }) as unknown as Section;
  const block = (id: string, bars: number, playBeats?: number): PatternBlock =>
    ({ id, sectionId: id, label: id, bars, beatsPerBar: 4, chords: [], lockedBeats: bars * 4, playBeats }) as PatternBlock;

  it("lays sections end to end with block spans, honouring cropped blocks", () => {
    const arr = buildArrangement(
      [section("a", [["x", "C", 0, 4], ["y", "G", 4, 2]]), section("b", [["z", "F", 0, 4]])],
      [block("a", 2, 6), block("b", 1)],
    )!;
    expect(arr.loopBeats).toBe(10);
    expect(arr.chords.map((e) => `${e.chord.display}@${e.startBeat}`)).toEqual(["C@0", "G@4", "F@6"]);
    expect(arr.sections.map((s) => [s.startBeat, s.lengthBeats])).toEqual([[0, 6], [6, 4]]);
    expect(arr.refs[2].patternChordId).toBe("z");
  });

  it("still lays out blocks when there are no chords", () => {
    const arr = buildArrangement([section("a", [])], [block("a", 4)])!;
    expect(arr.chords).toEqual([]);
    expect(arr.loopBeats).toBe(16);
  });
});
