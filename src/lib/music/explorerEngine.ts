// Harmonic engine for the Chord Explorer — a next-chord suggestion model.
// Pure functions over ChordSymbol + MIDI voicings; no React, no audio.

import {
  ChordSymbol, Quality, chordToMidi, nashvilleLadder, pcToName, rootToPc,
} from "./chords";
import { secondaryDominantOf } from "./suggestions";

export type ExplorerMode = "maj" | "min";
export type ExplorerCategory = "linger" | "push" | "glide" | "drift";

export interface Trait {
  tag: string;
  note: string;
}

export interface VoiceLink {
  fromVoice: number;
  toVoice: number;
  dist: number;
  type: "direct" | "octave";
  fromNote: string;
  toNote: string;
}

export interface VoiceDistance {
  score: number;
  anchors: number;
}

export interface Candidate {
  chord: ChordSymbol;
  numeral: string;
  category: ExplorerCategory;
  isDiatonic: boolean;
  inKey: boolean;
  family: number;
  pitches: number[];
  voiceLinks: VoiceLink[];
  voiceDist: VoiceDistance;
  loopSmooth: boolean;
  trait: Trait | null;
}

export interface ExplorerStep {
  id: string;
  chord: ChordSymbol;
  category: ExplorerCategory | "starter" | "typed";
  trait: Trait | null;
  pitches: number[];
}

export const VOICE_COLORS = ["#C47A6E", "#6B94B0", "#7E9E82", "#C9A84C"];
export const VOICE_SHAPES = ["triangle", "square", "pentagon", "diamond"] as const;
export const VOICE_SYMBOLS = ["▲", "■", "⬢", "◆"];
export const VOICE_NAMES = ["Root", "3rd", "5th", "8ve"];

export const CATEGORY_META: Record<
  ExplorerCategory,
  { name: string; hint: string; tint: string; ink: string }
> = {
  linger: { name: "Linger & Rest", hint: "stay close to home", tint: "var(--section-tint-teal)", ink: "oklch(0.42 0.07 200)" },
  push: { name: "Push & Climb", hint: "build tension", tint: "var(--section-tint-amber)", ink: "oklch(0.45 0.11 70)" },
  glide: { name: "Glide & Morph", hint: "smooth voice leading", tint: "var(--section-tint-green)", ink: "oklch(0.43 0.09 155)" },
  drift: { name: "Drift & Sigh", hint: "borrowed color", tint: "var(--section-tint-violet)", ink: "oklch(0.45 0.1 300)" },
};

export const CATEGORY_ORDER: ExplorerCategory[] = ["linger", "push", "glide", "drift"];

const NUMERAL_UPPER = [
  "I", "♭II", "II", "♭III", "III", "IV",
  "♭V", "V", "♭VI", "VI", "♭VII", "VII",
];

// Tonic-family degrees → 0, subdominant → 1, dominant → 2.
const DEGREE_FAMILY = [0, 1, 0, 1, 2, 0, 2];

export function keyUsesFlat(keyRoot: string): boolean {
  return keyRoot.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(keyRoot);
}

function pitchName(midi: number, useFlat: boolean): string {
  return pcToName(((midi % 12) + 12) % 12, useFlat);
}

function baseQuality(q: Quality): Quality {
  switch (q) {
    case "maj": case "maj7": case "7": case "maj9": case "9":
    case "maj11": case "maj13": case "add9": case "6": case "6/9": case "add11":
      return "maj";
    case "min": case "min7": case "min9": case "min11": case "min13":
    case "min6": case "minMaj7":
      return "min";
    case "dim": case "dim7": case "m7b5":
      return "dim";
    default:
      return q;
  }
}

export function voiceChord(chord: ChordSymbol, octave = 4): number[] {
  return [...chordToMidi(chord, octave)].sort((a, b) => a - b);
}

export function voiceDistance(a: number[], b: number[]): VoiceDistance {
  const len = Math.max(a.length, b.length);
  let score = 0;
  let anchors = 0;
  for (let i = 0; i < len; i++) {
    const x = i < a.length ? a[i] : a[a.length - 1];
    const y = i < b.length ? b[i] : b[b.length - 1];
    const d = Math.abs(x - y);
    score += d;
    if (d === 0) anchors++;
  }
  return { score, anchors };
}

export function findVoiceLinks(a: number[], b: number[], useFlat = false): VoiceLink[] {
  const links: VoiceLink[] = [];
  const la = Math.min(a.length, 4);
  const lb = Math.min(b.length, 4);
  for (let va = 0; va < la; va++) {
    for (let vb = 0; vb < lb; vb++) {
      const dd = Math.abs(a[va] - b[vb]);
      const pcA = ((a[va] % 12) + 12) % 12;
      const pcB = ((b[vb] % 12) + 12) % 12;
      const pcD = Math.abs(pcA - pcB);
      const pcDist = Math.min(pcD, 12 - pcD);
      if (dd <= 2) {
        links.push({
          fromVoice: va, toVoice: vb, dist: dd, type: "direct",
          fromNote: pitchName(a[va], useFlat), toNote: pitchName(b[vb], useFlat),
        });
      } else if (pcDist <= 2) {
        links.push({
          fromVoice: va, toVoice: vb, dist: pcDist, type: "octave",
          fromNote: pitchName(a[va], useFlat), toNote: pitchName(b[vb], useFlat),
        });
      }
    }
  }
  return links;
}

interface DiatonicChord {
  chord: ChordSymbol;
  numeral: string;
  family: number;
}

function diatonicChords(keyRoot: string, mode: ExplorerMode): DiatonicChord[] {
  return nashvilleLadder(keyRoot, mode).map((d, i) => ({
    chord: d.chord,
    numeral: d.numeral,
    family: DEGREE_FAMILY[i],
  }));
}

function isChordInKey(chord: ChordSymbol, keyRoot: string, mode: ExplorerMode): boolean {
  return diatonicChords(keyRoot, mode).some(
    (d) => rootToPc(d.chord.root) === rootToPc(chord.root) && d.chord.quality === chord.quality,
  );
}

export function activeKeyContext(
  chord: ChordSymbol,
  keyRoot: string,
  mode: ExplorerMode,
): { keyRoot: string; mode: ExplorerMode } {
  if (isChordInKey(chord, keyRoot, mode)) return { keyRoot, mode };
  const useFlat = keyUsesFlat(keyRoot);
  const q = chord.quality;
  if (q === "maj" || q === "7" || q === "maj7") {
    return { keyRoot: pcToName((rootToPc(chord.root) + 5) % 12, useFlat), mode: "maj" };
  }
  if (q === "min" || q === "min7") {
    return { keyRoot: chord.root, mode: "min" };
  }
  return { keyRoot, mode };
}

export function nashvilleNumeral(
  chord: ChordSymbol,
  keyRoot: string,
  mode: ExplorerMode,
): string {
  const iv = (((rootToPc(chord.root) - rootToPc(keyRoot)) % 12) + 12) % 12;
  for (const d of diatonicChords(keyRoot, mode)) {
    const di = (((rootToPc(d.chord.root) - rootToPc(keyRoot)) % 12) + 12) % 12;
    if (di === iv) return d.numeral;
  }
  let num = NUMERAL_UPPER[iv] || "?";
  const q = chord.quality;
  const isMin = q.startsWith("min") || q === "m7b5";
  const isDim = q === "dim" || q === "dim7";
  if (isMin || isDim) num = num.toLowerCase();
  if (isDim) num += "°";
  return num;
}

export function keyChangeLabel(
  chord: ChordSymbol,
  keyRoot: string,
  mode: ExplorerMode,
): string | null {
  if (isChordInKey(chord, keyRoot, mode)) return null;
  const base = baseQuality(chord.quality);
  if (base !== chord.quality && isChordInKey({ ...chord, quality: base }, keyRoot, mode)) {
    return null;
  }
  const ctx = activeKeyContext(chord, keyRoot, mode);
  if (rootToPc(ctx.keyRoot) === rootToPc(keyRoot) && ctx.mode === mode) return null;
  return `→ ${ctx.keyRoot} ${ctx.mode === "maj" ? "Maj" : "Min"}`;
}

export interface ExtensionOption {
  value: Quality;
  label: string;
}

export function extensionOptions(quality: Quality): ExtensionOption[] {
  const base = baseQuality(quality);
  if (base === "maj") {
    return [
      { value: "maj", label: "—" },
      { value: "maj7", label: "maj7" },
      { value: "7", label: "7" },
      { value: "maj9", label: "maj9" },
      { value: "9", label: "9" },
      { value: "maj11", label: "maj11" },
      { value: "maj13", label: "maj13" },
    ];
  }
  if (base === "min") {
    return [
      { value: "min", label: "—" },
      { value: "min7", label: "m7" },
      { value: "min9", label: "m9" },
      { value: "min11", label: "m11" },
      { value: "min13", label: "m13" },
    ];
  }
  if (base === "dim") {
    return [
      { value: "dim", label: "—" },
      { value: "m7b5", label: "m7♭5" },
      { value: "dim7", label: "°7" },
    ];
  }
  return [{ value: quality, label: "—" }];
}

function traitFor(
  c: Candidate,
  focus: ChordSymbol,
  cat: ExplorerCategory,
): Trait {
  const vd = c.voiceDist;
  const ri = (((rootToPc(c.chord.root) - rootToPc(focus.root)) % 12) + 12) % 12;
  if (cat === "glide") {
    if (vd.anchors >= 2) {
      return { tag: "Common-Tone Anchor", note: `${vd.anchors} notes hold still as the chord changes.` };
    }
    return { tag: "Smooth Glide", note: "Voices slide by the smallest possible steps." };
  }
  if (cat === "push") {
    if (ri === 5) return { tag: "Strong Fourth Leap", note: "The root jumps a perfect fourth — a firm forward stride." };
    if (ri >= 1 && ri <= 2) return { tag: "Step-Up Climb", note: "The root rises by step, gathering momentum." };
    if (c.family === 2) return { tag: "Dominant Pull", note: "Tritone tension leaning hard toward home." };
    return { tag: "Tension Rise", note: "Moving off tonic stability into open ground." };
  }
  if (cat === "drift") {
    if (c.numeral.startsWith("V/")) {
      return { tag: "Applied Dominant", note: `A secondary dominant aimed at ${c.numeral.slice(2)}.` };
    }
    return { tag: "Modal Color", note: "A borrowed chord — outside the key, adding shade." };
  }
  return { tag: "Tonic Rest", note: "Settled in tonic territory, in no hurry to move." };
}

export interface CandidateOptions {
  firstChord?: { chord: ChordSymbol; pitches: number[] } | null;
}

export function getCandidates(
  focusChord: ChordSymbol,
  focusPitches: number[],
  keyRoot: string,
  mode: ExplorerMode,
  opts: CandidateOptions = {},
): Record<ExplorerCategory, Candidate[]> {
  const useFlat = keyUsesFlat(keyRoot);
  const diatonic = diatonicChords(keyRoot, mode);
  const seen = new Set<string>();

  interface Raw {
    chord: ChordSymbol;
    isDiatonic: boolean;
    family: number;
    numeral: string;
  }
  const all: Raw[] = [];
  const add = (chord: ChordSymbol, isDiatonic: boolean, family: number, numeral: string) => {
    const id = `${rootToPc(chord.root)}-${chord.quality}`;
    if (seen.has(id)) return;
    seen.add(id);
    all.push({ chord, isDiatonic, family, numeral });
  };

  for (const d of diatonic) add(d.chord, true, d.family, "");
  for (const d of diatonicChords(keyRoot, mode === "maj" ? "min" : "maj")) {
    add(d.chord, false, -1, "");
  }
  for (const d of diatonic) {
    if (d.chord.quality === "dim") continue;
    add(secondaryDominantOf(d.chord, useFlat), false, -1, `V/${d.numeral}`);
  }
  for (const iv of [3, 4, 8, 9]) {
    const pc = (rootToPc(focusChord.root) + iv) % 12;
    for (const q of ["maj", "min"] as Quality[]) {
      const root = pcToName(pc, useFlat);
      add({ root, quality: q, display: root + (q === "min" ? "m" : "") }, false, -1, "");
    }
  }

  const focusPc = rootToPc(focusChord.root);
  const cats: Record<ExplorerCategory, Candidate[]> = { linger: [], push: [], glide: [], drift: [] };
  for (const raw of all) {
    if (rootToPc(raw.chord.root) === focusPc && raw.chord.quality === focusChord.quality) continue;
    const pitches = voiceChord(raw.chord);
    const voiceDist = voiceDistance(focusPitches, pitches);
    const voiceLinks = findVoiceLinks(focusPitches, pitches, useFlat);
    let category: ExplorerCategory;
    if (voiceDist.score <= 4 || voiceDist.anchors >= 2) category = "glide";
    else if (raw.isDiatonic) category = raw.family === 0 ? "linger" : "push";
    else category = "drift";
    let loopSmooth = false;
    if (opts.firstChord) {
      loopSmooth = voiceDistance(pitches, opts.firstChord.pitches).score <= 4;
    }
    cats[category].push({
      chord: raw.chord,
      numeral: raw.numeral,
      category,
      isDiatonic: raw.isDiatonic,
      inKey: isChordInKey(raw.chord, keyRoot, mode),
      family: raw.family,
      pitches,
      voiceLinks,
      voiceDist,
      loopSmooth,
      trait: null,
    });
  }
  for (const cat of CATEGORY_ORDER) {
    cats[cat].sort((a, b) => {
      if (a.inKey !== b.inKey) return a.inKey ? -1 : 1;
      return a.voiceDist.score - b.voiceDist.score;
    });
    cats[cat] = cats[cat].slice(0, 8);
    for (const c of cats[cat]) c.trait = traitFor(c, focusChord, cat);
  }
  return cats;
}
