// Voice-leading "feel" model + voicing suggestion engine for the Quick Pick panel.
// Suggestions are whole-progression re-voicings: a feel re-voices every chord in
// the pattern block. Inversions are expressed as slash chords (chord.bass); some
// feels also nudge the chord quality (7ths for jazzy, sus for dreamy). All scoring
// is voicing-aware (bass-sensitive), unlike frictionBetween() in analyzeChord.ts.

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

interface VoicingOption {
  chord: ChordSymbol;
  label: string; // "Root position" | "1st inversion" | ...
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

// Candidate voicings for a single chord under a feel: every inversion of the
// chord, plus the feel-tweaked quality where one applies.
function candidatesFor(chord: ChordSymbol, feel: Feel): VoicingOption[] {
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
      options.push({ chord: cand, label: ORDINALS[idx] ?? "inversion" });
    });
  }
  return options;
}

const isSus = (o: VoicingOption) => o.chord.quality === "sus2" || o.chord.quality === "sus4";
const hasSeventh = (o: VoicingOption) => /7|9|11|13/.test(QUALITY_PRETTY[o.chord.quality]);

type Pick = (cands: VoicingOption[], prev: number[] | null) => VoicingOption;

// Build a per-chord picker: rank by `primary` (signature preference), tie-broken
// by smoothness toward the previously chosen voicing (smoothSign -1 = prefer
// smooth, +1 = prefer wild/large motion, 0 = ignore motion).
function makePick(primary: (o: VoicingOption) => number, smoothSign: number): Pick {
  return (cands, prev) => {
    let best = cands[0];
    let bestVal = -Infinity;
    for (const c of cands) {
      const motion = prev ? smoothScore(prev, chordToMidi(c.chord, 4)) : 0;
      const val = primary(c) * 1000 + smoothSign * motion;
      if (val > bestVal) {
        bestVal = val;
        best = c;
      }
    }
    return best;
  };
}

function buildArrangement(chords: ChordSymbol[], feel: Feel, pick: Pick): ChordSymbol[] {
  const out: ChordSymbol[] = [];
  let prevVoicing: number[] | null = null;
  for (const ch of chords) {
    const chosen = pick(candidatesFor(ch, feel), prevVoicing);
    out.push(chosen.chord);
    prevVoicing = chordToMidi(chosen.chord, 4);
  }
  return out;
}

const ROOT = (o: VoicingOption) => (o.label === "Root position" ? 1 : 0);
const FIRST = (o: VoicingOption) => (o.label === "1st inversion" ? 1 : 0);
const SECOND = (o: VoicingOption) => (o.label === "2nd inversion" ? 1 : 0) + (isSus(o) ? 1 : 0);
const SEVENTH = (o: VoicingOption) => (hasSeventh(o) ? 2 : 0) + (o.chord.bass ? 1 : 0);
const SLASH = (o: VoicingOption) => (o.chord.bass ? 1 : 0);
const NOTROOT = (o: VoicingOption) => (o.label === "Root position" ? 0 : 1);
const ZERO = () => 0;

// Per-feel arrangement strategies: each yields one whole-progression re-voicing.
const STRATEGIES: Record<Feel, Array<{ label: string; pick: Pick }>> = {
  calm: [
    { label: "Root position", pick: makePick(ROOT, -1) },
    { label: "Minimal movement", pick: makePick(ZERO, -1) },
  ],
  flowing: [
    { label: "Smooth voice leading", pick: makePick(ZERO, -1) },
    { label: "First inversions", pick: makePick(FIRST, -1) },
  ],
  dreamy: [
    { label: "Floating inversions", pick: makePick(SECOND, -1) },
    { label: "Gentle motion", pick: makePick(ZERO, -1) },
  ],
  jazzy: [
    { label: "Rich 7ths", pick: makePick(SEVENTH, -1) },
    { label: "Chromatic bass", pick: makePick(SLASH, 1) },
  ],
  dramatic: [
    { label: "Wide leaps", pick: makePick(ZERO, 1) },
    { label: "Bold inversions", pick: makePick(NOTROOT, 1) },
  ],
  tense: [
    { label: "Maximum tension", pick: makePick(ZERO, 1) },
    { label: "Edgy voicings", pick: makePick(SLASH, 1) },
  ],
};

export interface ProgressionVoicing {
  id: string;
  chords: ChordSymbol[];
  label: string;
}

const arrangementKey = (chords: ChordSymbol[]) => chords.map((c) => c.display).join(" ");

// Whole-progression voicing suggestions for the chosen feel (2–4, deduped).
export function suggestProgressionVoicings(chords: ChordSymbol[], feel: Feel): ProgressionVoicing[] {
  const seen = new Set<string>();
  const out: ProgressionVoicing[] = [];
  for (const { label, pick } of STRATEGIES[feel]) {
    const voiced = buildArrangement(chords, feel, pick);
    const key = arrangementKey(voiced);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: key, chords: voiced, label });
  }
  // Always offer the untouched original as a fallback so the list is never empty.
  const originalKey = arrangementKey(chords);
  if (out.length === 0 && !seen.has(originalKey)) {
    out.push({ id: originalKey, chords, label: "Original" });
  }
  return out.slice(0, 4);
}

// Pick the feel that best matches the progression's current voicing, by mapping
// its overall smoothness onto the calm↔tense spectrum.
export function bestFeelForProgression(chords: ChordSymbol[]): Feel {
  if (chords.length < 2) return "calm";
  const current = progressionScore(chords);
  const smoothest = progressionScore(buildArrangement(chords, "flowing", makePick(ZERO, -1)));
  const roughest = progressionScore(buildArrangement(chords, "tense", makePick(ZERO, 1)));
  if (roughest <= smoothest) return "calm";
  const t = (current - smoothest) / (roughest - smoothest);
  if (t < 0.2) return "calm";
  if (t < 0.45) return "flowing";
  if (t < 0.7) return "dramatic";
  return "tense";
}
