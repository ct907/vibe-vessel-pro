import { describe, it, expect } from "vitest";
import { detectChordsFromChannelData, type DetectedChord } from "@/lib/music/detect-chords";
import { parseChord, chordToMidi, midiToFreq, rootToPc, type ChordSymbol } from "@/lib/music/chords";

const SR = 11025;

/** Render a sustained chord as a sum of equal-amplitude sine partials. */
function synth(chord: ChordSymbol, seconds: number): Float32Array {
  const freqs = chordToMidi(chord, 4).map(midiToFreq);
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (const f of freqs) {
    for (let i = 0; i < n; i++) out[i] += Math.sin((2 * Math.PI * f * i) / SR);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}

function dominant(res: DetectedChord[]): DetectedChord {
  return res.reduce((a, b) => (b.endSec - b.startSec > a.endSec - a.startSec ? b : a));
}

describe("detectChordsFromChannelData", () => {
  it("identifies a sustained C major triad", () => {
    const res = detectChordsFromChannelData(synth(parseChord("C")!, 2), SR);
    expect(res.length).toBeGreaterThan(0);
    const top = dominant(res);
    expect(rootToPc(top.chord.root)).toBe(0);
    expect(top.chord.quality).toBe("maj");
    expect(top.confidence).toBeGreaterThan(0.8);
  });

  it("identifies a sustained A minor triad", () => {
    const top = dominant(detectChordsFromChannelData(synth(parseChord("Am")!, 2), SR));
    expect(rootToPc(top.chord.root)).toBe(rootToPc("A"));
    expect(top.chord.quality).toBe("min");
  });

  it("identifies a dominant 7th chord", () => {
    const top = dominant(detectChordsFromChannelData(synth(parseChord("G7")!, 2), SR));
    expect(rootToPc(top.chord.root)).toBe(rootToPc("G"));
    expect(top.chord.quality).toBe("7");
  });

  it("segments a two-chord sequence", () => {
    const c = synth(parseChord("C")!, 2);
    const f = synth(parseChord("F")!, 2);
    const seq = new Float32Array(c.length + f.length);
    seq.set(c, 0);
    seq.set(f, c.length);

    const res = detectChordsFromChannelData(seq, SR);
    expect(res.length).toBeGreaterThanOrEqual(2);
    const roots = res.map((r) => rootToPc(r.chord.root));
    expect(roots).toContain(rootToPc("C"));
    expect(roots).toContain(rootToPc("F"));
  });
});
