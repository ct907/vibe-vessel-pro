import { describe, expect, it } from "vitest";
import { DRUM_LANES, GROOVES, grooveLanes, stepsPerBar } from "@/lib/music/grooves";
import { bassNotes, drumDensity, drumHits, drumVelocity, laneOf, type SectionSpan } from "@/lib/music/arrangement";
import { DRUM_KITS, renderLane } from "@/lib/audio/drums";
import { parseChord } from "@/lib/music/chords";
import { DEFAULT_BASS, DEFAULT_DRUMS, type DrumSettings } from "@/store/sound";

const fourFour = { beatsPerBar: 4, beatUnit: 4 };
const span = (beats: number, blockBeats = [beats]): SectionSpan => {
  let at = 0;
  return {
    sectionId: "s", startBeat: 0, lengthBeats: beats,
    blocks: blockBeats.map((len) => { const b = { startBeat: at, lengthBeats: len, beatsPerBar: 4 }; at += len; return b; }),
  };
};
const drums = (p: Partial<DrumSettings>): DrumSettings => ({ ...DEFAULT_DRUMS, ...p });
const lane = (hits: ReturnType<typeof drumHits>, name: string) => hits.filter((h) => laneOf(h) === name);

describe("grooves", () => {
  it("every lane is a whole number of bars in its meter", () => {
    for (const g of GROOVES) {
      for (const m of g.meters) {
        const [bpb, unit] = m.split("/").map(Number);
        for (const [name, steps] of Object.entries(g.lanes)) {
          expect(steps!.length % stepsPerBar(bpb, unit), `${g.id}.${name}`).toBe(0);
          expect(/^[.1-4]+$/.test(steps!), `${g.id}.${name}`).toBe(true);
        }
      }
    }
  });

  it("builds a basic groove for meters no genre is written for", () => {
    const { lanes } = grooveLanes("popRock", 5, 4);
    expect(lanes.kick!.length).toBe(20);
    expect(lanes.kick![0]).toBe("1");
    expect(lanes.snare![16]).toBe("1");
  });

  it("has 12 steps a bar in 3/4 and 6/8", () => {
    expect(stepsPerBar(3, 4)).toBe(12);
    expect(stepsPerBar(6, 8)).toBe(12);
  });
});

describe("drum energy", () => {
  it("energy sets density from half notes to sixteenths, and velocity", () => {
    expect(drumDensity(drums({ energy: 0 }))).toBe(1);
    expect(drumDensity(drums({ energy: 0.5 }))).toBe(3);
    expect(drumDensity(drums({ energy: 1 }))).toBe(4);
    expect(drumVelocity(drums({ energy: 0.3 }))).toBe(0.3);
    expect(drumDensity(drums({ energy: 1, density: 2 }))).toBe(2);
    expect(drumVelocity(drums({ energy: 1, velocity: 0.2 }))).toBe(0.2);
  });

  it("more energy means closer hats and harder hits", () => {
    const calm = lane(drumHits(span(4), drums({ energy: 0 }), fourFour), "hatClosed");
    const busy = lane(drumHits(span(4), drums({ energy: 1 }), fourFour), "hatClosed");
    expect(calm.map((h) => h.startBeat)).toEqual([0, 2]);
    expect(busy.length).toBe(16);
    expect(Math.max(...busy.map((h) => h.velocity))).toBeGreaterThan(Math.max(...calm.map((h) => h.velocity)));
  });

  it("stops at a cropped block's end and restarts the bar at each block", () => {
    const hits = drumHits(span(10, [6, 4]), drums({ energy: 0.5, genre: "popRock" }), fourFour);
    // The 6-beat block plays a bar and a half of the groove; the next block starts it again.
    expect(lane(hits, "kick").map((h) => h.startBeat)).toEqual([0, 1.5, 2, 2.5, 4, 5.5, 6, 7.5, 8, 8.5]);
    expect(hits.every((h) => h.startBeat < 10)).toBe(true);
  });

  it("a lane offset makes that drum busier or sparser than the rest", () => {
    const base = drums({ energy: 0.3 });
    const hatsUp = drumHits(span(4), { ...base, lanes: { hatClosed: { offset: 1, shape: "flat" } } }, fourFour);
    const hatsDown = drumHits(span(4), { ...base, lanes: { hatClosed: { offset: -1, shape: "flat" } } }, fourFour);
    const plain = drumHits(span(4), base, fourFour);
    expect(lane(hatsUp, "hatClosed").length).toBeGreaterThan(lane(plain, "hatClosed").length);
    expect(lane(hatsDown, "hatClosed").length).toBeLessThan(lane(plain, "hatClosed").length);
    expect(lane(hatsUp, "kick")).toEqual(lane(plain, "kick"));
  });

  it("a build gets busier across the section and a fade thins out", () => {
    const build = lane(drumHits(span(16), drums({ energy: 0.5, lanes: { hatClosed: { offset: 0, shape: "build" } } }), fourFour), "hatClosed");
    const firstBar = build.filter((h) => h.startBeat < 4).length;
    const lastBar = build.filter((h) => h.startBeat >= 12).length;
    expect(lastBar).toBeGreaterThan(firstBar);
    const fade = lane(drumHits(span(16), drums({ energy: 0.5, lanes: { hatClosed: { offset: 0, shape: "fade" } } }), fourFour), "hatClosed");
    expect(fade.filter((h) => h.startBeat >= 12).length).toBeLessThan(fade.filter((h) => h.startBeat < 4).length);
  });

  it("swings the shuffle's off-beat eighths", () => {
    const ride = lane(drumHits(span(4), drums({ energy: 0.6, genre: "shuffle" }), fourFour), "ride").map((h) => h.startBeat);
    expect(ride[1]).toBeCloseTo(0.5 + 1 / 6, 6);
  });

  it("crashes into a section once the groove is busy, not when it's calm", () => {
    expect(lane(drumHits(span(8), drums({ energy: 0.8 }), fourFour), "crash").map((h) => h.startBeat)).toEqual([0]);
    expect(lane(drumHits(span(8), drums({ energy: 0.2 }), fourFour), "crash")).toEqual([]);
  });
});

describe("follow the kick", () => {
  it("the bass plays where the kick does, always landing on the chord change", () => {
    const chord = { chord: parseChord("C")!, startBeat: 0, lengthBeats: 4 };
    const kicks = lane(drumHits(span(4), drums({ energy: 0.5, genre: "popRock" }), fourFour), "kick").map((h) => h.startBeat);
    const line = bassNotes(chord, undefined, { ...DEFAULT_BASS, pattern: "followKick" }, kicks);
    expect(line.map((n) => n.startBeat)).toEqual(kicks.filter((k) => k < 4));
    expect(line.reduce((s, n) => s + n.lengthBeats, 0)).toBeCloseTo(4, 6);
  });
});

describe("drum kits", () => {
  it("render clean, bounded, decaying samples for every lane", () => {
    for (const { value: kit } of DRUM_KITS) {
      for (const name of DRUM_LANES) {
        const d = renderLane(kit, name, 11025);
        let peak = 0, tail = 0;
        for (let i = 0; i < d.length; i++) {
          expect(Number.isFinite(d[i])).toBe(true);
          peak = Math.max(peak, Math.abs(d[i]));
          if (i > d.length * 0.9) tail = Math.max(tail, Math.abs(d[i]));
        }
        expect(peak, `${kit}.${name}`).toBeLessThanOrEqual(1);
        expect(peak, `${kit}.${name}`).toBeGreaterThan(0.1);
        expect(tail, `${kit}.${name} tail`).toBeLessThan(peak * 0.25);
      }
    }
  }, 30000);

  it("is deterministic", () => {
    expect(renderLane("808", "snare", 22050)).toEqual(renderLane("808", "snare", 22050));
  });
});
