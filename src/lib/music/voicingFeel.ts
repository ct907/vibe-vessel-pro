// Voice-leading "feel" model + voicing suggestion engine for the Quick Pick panel.
// Inversions are expressed as slash chords (chord.bass); some feels also nudge
// the chord quality (7ths for jazzy, sus for dreamy). All scoring is voicing-aware
// (bass-sensitive), unlike frictionBetween() in analyzeChord.ts.

import {
  chordToMidi,
  pcToName,
  rootToPc,
  QUALITY_INTERVALS,
  QUALITY_PRETTY,
  type ChordSymbol,
  type Quality,
} from "@/lib/music/chords";

export type Feel = "calm" | "flowing" | "dreamy" | "jazzy" | "dramatic" | "tense";

export interface FeelDef {
  id: Feel;
  emoji: string;
  label: string;
  blurb: string;
}

export const FEELS: FeelDef[] = [
  { id: "calm", emoji: "😌", label: "Calm", blurb: "Calm and stable" },
  { id: "flowing", emoji: "🌊", label: "Flowing", blurb: "Smooth and connected" },
  { id: "dreamy", emoji: "✨", label: "Dreamy", blurb: "Light and floating" },
  { id: "jazzy", emoji: "🎷", label: "Jazzy", blurb: "Rich and sophisticated" },
  { id: "dramatic", emoji: "🎭", label: "Dramatic", blurb: "Bold and expressive" },
  { id: "tense", emoji: "⚡", label: "Tense", blurb: "Edgy and unresolved" },
];

const ORDINALS = ["Root position", "1st inversion", "2nd inversion", "3rd inversion", "4th inversion"];

// Sum of semitone distances voice-by-voice, plus crossing and leap penalties.
export function smoothScore(prev: number[], curr: number[]): number {
  const a = [...prev].sort((x, y) => x - y);
  const b = [...curr].sort((x, y) => x - y);
  const n = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    score += d;
    if (d > 5) score += 2; // leap penalty
  }
  for (let i = 0; i < n - 1; i++) {
    // A crossing: the lower prev voice ends up above the higher prev voice.
    if (a[i] < a[i + 1] && b[i] > b[i + 1]) score += 3;
  }
  return score;
}

export function progressionScore(chords: ChordSymbol[]): number {
  let total = 0;
  for (let i = 0; i < chords.length - 1; i++) {
    total += smoothScore(chordToMidi(chords[i], 4), chordToMidi(chords[i + 1], 4));
  }
  return total;
}

function makeDisplay(root: string, quality: Quality, bass?: string): string {
  return root + QUALITY_PRETTY[quality] + (bass ? `/${bass}` : "");
}

function withVoicing(chord: ChordSymbol, quality: Quality, bass?: string): ChordSymbol {
  return {
    root: chord.root,
    quality,
    bass,
    display: makeDisplay(chord.root, quality, bass),
    octave: chord.octave,
  };
}

// Light quality nudge per feel. Returns null if no sensible tweak applies.
function tweakQuality(quality: Quality, feel: Feel): Quality | null {
  if (feel === "jazzy") {
    const sevenths: Partial<Record<Quality, Quality>> = {
      maj: "maj7",
      min: "min7",
      dim: "m7b5",
      "6": "maj7",
      min6: "min7",
      sus4: "7",
      sus2: "7",
    };
    return sevenths[quality] ?? null;
  }
  if (feel === "dreamy") {
    if (quality === "maj" || quality === "min") return "sus2";
    if (quality === "7" || quality === "maj7") return "sus4";
    return null;
  }
  return null;
}

export interface VoicingOption {
  id: string;
  chord: ChordSymbol;
  label: string;
  score: number;
}

// All distinct chord tones (pitch classes) for a chord, in stacked order.
function chordTonePcs(chord: ChordSymbol): number[] {
  const rootPc = rootToPc(chord.root);
  const intervals = QUALITY_INTERVALS[chord.quality] ?? [0, 4, 7];
  const seen = new Set<number>();
  const pcs: number[] = [];
  for (const iv of intervals) {
    const pc = (rootPc + iv) % 12;
    if (!seen.has(pc)) {
      seen.add(pc);
      pcs.push(pc);
    }
  }
  return pcs;
}

// Build candidate voicings: every inversion of the chord (root position + each
// non-root chord tone as bass), optionally over a feel-tweaked quality.
export function candidatesFor(chord: ChordSymbol, feel: Feel): VoicingOption[] {
  const useFlat = chord.root.includes("b");
  const qualities: Quality[] = [chord.quality];
  const tweaked = tweakQuality(chord.quality, feel);
  if (tweaked && tweaked !== chord.quality) qualities.push(tweaked);

  const seen = new Set<string>();
  const options: VoicingOption[] = [];
  for (const quality of qualities) {
    const pcs = chordTonePcs({ ...chord, quality });
    pcs.forEach((pc, idx) => {
      const bass = idx === 0 ? undefined : pcToName(pc, useFlat);
      const cand = withVoicing(chord, quality, bass);
      if (seen.has(cand.display)) return;
      seen.add(cand.display);
      options.push({ id: cand.display, chord: cand, label: ORDINALS[idx] ?? `inversion`, score: 0 });
    });
  }
  return options;
}

function scoreAgainstNeighbors(
  cand: ChordSymbol,
  prev: ChordSymbol | null,
  next: ChordSymbol | null,
): number {
  const v = chordToMidi(cand, 4);
  let s = 0;
  if (prev) s += smoothScore(chordToMidi(prev, 4), v);
  if (next) s += smoothScore(v, chordToMidi(next, 4));
  return s;
}

// Rank candidates for the chosen feel and return the top 2–4 options.
export function suggestFor(
  chord: ChordSymbol,
  prev: ChordSymbol | null,
  next: ChordSymbol | null,
  feel: Feel,
): VoicingOption[] {
  const scored = candidatesFor(chord, feel).map((o) => ({
    ...o,
    score: scoreAgainstNeighbors(o.chord, prev, next),
  }));

  const smoothFirst = (a: VoicingOption, b: VoicingOption) => a.score - b.score;
  const wildFirst = (a: VoicingOption, b: VoicingOption) => b.score - a.score;

  let ranked: VoicingOption[];
  switch (feel) {
    case "calm":
      // Lowest movement; root position floats up via the smooth sort + tie order.
      ranked = scored.sort(smoothFirst);
      break;
    case "flowing":
      ranked = scored.sort(smoothFirst);
      break;
    case "dreamy":
      // Favor 2nd inversions and sus colors, then smoothness.
      ranked = scored.sort((a, b) => dreaminess(b) - dreaminess(a) || a.score - b.score);
      break;
    case "jazzy":
      // Favor 7th/slash candidates, then smoothness.
      ranked = scored.sort((a, b) => jazziness(b) - jazziness(a) || a.score - b.score);
      break;
    case "dramatic":
      ranked = scored.sort(wildFirst);
      break;
    case "tense":
      ranked = scored.sort(wildFirst);
      break;
  }

  return ranked.slice(0, 4);
}

function dreaminess(o: VoicingOption): number {
  let n = 0;
  if (o.label === "2nd inversion") n += 2;
  if (o.chord.quality === "sus2" || o.chord.quality === "sus4") n += 2;
  return n;
}

function jazziness(o: VoicingOption): number {
  let n = 0;
  if (/7|9|11|13/.test(QUALITY_PRETTY[o.chord.quality])) n += 2;
  if (o.chord.bass) n += 1;
  return n;
}

// Pick the feel that best matches the chord's current voicing in context, by
// mapping its smoothness score onto the calm↔tense spectrum.
export function bestFeelFor(
  chord: ChordSymbol,
  prev: ChordSymbol | null,
  next: ChordSymbol | null,
): Feel {
  const current = scoreAgainstNeighbors(chord, prev, next);
  const candidates = candidatesFor(chord, "calm").map((o) =>
    scoreAgainstNeighbors(o.chord, prev, next),
  );
  const min = Math.min(current, ...candidates);
  const max = Math.max(current, ...candidates);
  if (max === min) return "calm";
  const t = (current - min) / (max - min); // 0 = smoothest, 1 = roughest
  if (chord.quality === "sus2" || chord.quality === "sus4") return "dreamy";
  if (/7|9|11|13/.test(QUALITY_PRETTY[chord.quality])) return "jazzy";
  if (t < 0.2) return "calm";
  if (t < 0.45) return "flowing";
  if (t < 0.7) return "dramatic";
  return "tense";
}
