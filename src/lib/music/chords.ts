// Chord parser, voicing resolver, and Nashville helpers.
// Symbol grammar: <root><accidental?><quality?><extension?>(/<bass>)?

export const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const NOTES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export type Quality =
  | "maj" | "min" | "dim" | "aug" | "sus2" | "sus4"
  | "maj7" | "min7" | "7" | "dim7" | "m7b5" | "minMaj7"
  | "maj9" | "min9" | "9" | "6" | "min6" | "add9";

export interface ChordSymbol {
  root: string;          // normalized: C, C#, Db, etc.
  quality: Quality;
  bass?: string;
  display: string;       // pretty form, e.g. "Fmaj7"
}

const QUALITY_MAP: Array<[RegExp, Quality]> = [
  [/^maj9|M9/i, "maj9"],
  [/^maj7|M7|Δ7?/i, "maj7"],
  [/^min9|m9/i, "min9"],
  [/^min7|m7/i, "min7"],
  [/^min6|m6/i, "min6"],
  [/^minMaj7|mMaj7|mM7/i, "minMaj7"],
  [/^min|m(?!aj)/i, "min"],
  [/^dim7|°7/i, "dim7"],
  [/^m7b5|ø/i, "m7b5"],
  [/^dim|°/i, "dim"],
  [/^aug|\+/i, "aug"],
  [/^sus2/i, "sus2"],
  [/^sus4|sus/i, "sus4"],
  [/^add9/i, "add9"],
  [/^9/i, "9"],
  [/^7/i, "7"],
  [/^6/i, "6"],
  [/^maj|M(?!7|9)/i, "maj"],
];

const QUALITY_INTERVALS: Record<Quality, number[]> = {
  maj:    [0, 4, 7],
  min:    [0, 3, 7],
  dim:    [0, 3, 6],
  aug:    [0, 4, 8],
  sus2:   [0, 2, 7],
  sus4:   [0, 5, 7],
  maj7:   [0, 4, 7, 11],
  min7:   [0, 3, 7, 10],
  "7":    [0, 4, 7, 10],
  dim7:   [0, 3, 6, 9],
  m7b5:   [0, 3, 6, 10],
  minMaj7:[0, 3, 7, 11],
  maj9:   [0, 4, 7, 11, 14],
  min9:   [0, 3, 7, 10, 14],
  "9":    [0, 4, 7, 10, 14],
  "6":    [0, 4, 7, 9],
  min6:   [0, 3, 7, 9],
  add9:   [0, 4, 7, 14],
};

const QUALITY_PRETTY: Record<Quality, string> = {
  maj: "", min: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
  maj7: "maj7", min7: "m7", "7": "7", dim7: "dim7", m7b5: "m7b5", minMaj7: "mMaj7",
  maj9: "maj9", min9: "m9", "9": "9", "6": "6", min6: "m6", add9: "add9",
};

// Roots that don't exist in standard practice — silently fold to their
// enharmonic equivalent (no double accidentals supported).
const INVALID_ROOT_FIXUPS: Record<string, string> = {
  "Fb": "E",
  "Cb": "B",
  "E#": "F",
  "B#": "C",
};

export function normalizeRoot(input: string): string | null {
  const m = input.match(/^([A-Ga-g])([#b])?/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ?? "";
  const raw = letter + (acc === "#" ? "#" : acc === "b" ? "b" : "");
  return INVALID_ROOT_FIXUPS[raw] ?? raw;
}

/** Pitch class (0-11) of a chord's root, ignoring spelling. */
export function chordPitchClass(c: ChordSymbol): number {
  return rootToPc(c.root);
}

/** Two chord symbols are musically equal (same pitch class root, quality, bass). */
export function sameChord(a: ChordSymbol, b: ChordSymbol): boolean {
  if (a.quality !== b.quality) return false;
  if (rootToPc(a.root) !== rootToPc(b.root)) return false;
  const aBass = a.bass ? rootToPc(a.bass) : -1;
  const bBass = b.bass ? rootToPc(b.bass) : -1;
  return aBass === bBass;
}

export function rootToPc(root: string): number {
  const i = NOTES_SHARP.indexOf(root as typeof NOTES_SHARP[number]);
  if (i >= 0) return i;
  const j = NOTES_FLAT.indexOf(root as typeof NOTES_FLAT[number]);
  return j >= 0 ? j : 0;
}

export function pcToName(pc: number, useFlat = false): string {
  const arr = useFlat ? NOTES_FLAT : NOTES_SHARP;
  return arr[((pc % 12) + 12) % 12];
}

export function parseChord(input: string): ChordSymbol | null {
  if (!input) return null;
  const trimmed = input.trim();
  const root = normalizeRoot(trimmed);
  if (!root) return null;
  let rest = trimmed.slice(root.length);
  let bass: string | undefined;
  const slashIdx = rest.indexOf("/");
  if (slashIdx >= 0) {
    const b = normalizeRoot(rest.slice(slashIdx + 1));
    if (b) bass = b;
    rest = rest.slice(0, slashIdx);
  }
  let quality: Quality = "maj";
  for (const [re, q] of QUALITY_MAP) {
    if (re.test(rest)) { quality = q; break; }
  }
  const display = root + QUALITY_PRETTY[quality] + (bass ? `/${bass}` : "");
  return { root, quality, bass, display };
}

export function chordToMidi(chord: ChordSymbol, octave = 4): number[] {
  const rootPc = rootToPc(chord.root);
  const intervals = QUALITY_INTERVALS[chord.quality];
  const base = 12 * (octave + 1) + rootPc; // MIDI C4 = 60
  const notes = intervals.map((i) => base + i);
  if (chord.bass) {
    const bassPc = rootToPc(chord.bass);
    notes.unshift(12 * octave + bassPc);
  }
  return notes;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number, useFlat = false): string {
  const pc = midi % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${pcToName(pc, useFlat)}${oct}`;
}

// ---------- Nashville ladder ----------

export type Mode = "maj" | "min";

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const MAJOR_DEGREE_QUALITY: Quality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_DEGREE_QUALITY: Quality[] = ["min", "dim", "maj", "min", "min", "maj", "maj"];

const NUMERAL_MAJ = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const NUMERAL_MIN = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export interface DegreeChord {
  numeral: string;
  chord: ChordSymbol;
}

export function nashvilleLadder(keyRoot: string, mode: Mode): DegreeChord[] {
  const intervals = mode === "maj" ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
  const qualities = mode === "maj" ? MAJOR_DEGREE_QUALITY : MINOR_DEGREE_QUALITY;
  const numerals = mode === "maj" ? NUMERAL_MAJ : NUMERAL_MIN;
  const rootPc = rootToPc(keyRoot);
  const useFlat = keyRoot.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(keyRoot);
  return intervals.map((iv, i) => {
    const pc = (rootPc + iv) % 12;
    const root = pcToName(pc, useFlat);
    const quality = qualities[i];
    const display = root + QUALITY_PRETTY[quality];
    return {
      numeral: numerals[i],
      chord: { root, quality, display },
    };
  });
}

export function transposeChord(chord: ChordSymbol, semitones: number): ChordSymbol {
  const useFlat = chord.root.includes("b");
  const newRoot = pcToName(rootToPc(chord.root) + semitones, useFlat);
  const newBass = chord.bass ? pcToName(rootToPc(chord.bass) + semitones, useFlat) : undefined;
  return {
    root: newRoot,
    quality: chord.quality,
    bass: newBass,
    display: newRoot + QUALITY_PRETTY[chord.quality] + (newBass ? `/${newBass}` : ""),
  };
}

export function transposeKey(root: string, semitones: number): string {
  const useFlat = root.includes("b");
  return pcToName(rootToPc(root) + semitones, useFlat);
}

// ---------- Suggestions for the picker sheet ----------

export const COMMON_QUALITIES: Quality[] = [
  "maj", "min", "7", "maj7", "min7", "sus2", "sus4", "9", "maj9", "min9", "6", "min6", "dim", "aug", "add9", "m7b5",
];

export const ALL_ROOTS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

export interface ChordSuggestion {
  symbol: ChordSymbol;
  label: string;          // human readable e.g. "F major 7th"
}

const QUALITY_HUMAN: Record<Quality, string> = {
  maj: "major", min: "minor", dim: "diminished", aug: "augmented",
  sus2: "sus2", sus4: "sus4",
  maj7: "major 7th", min7: "minor 7th", "7": "dominant 7th",
  dim7: "diminished 7th", m7b5: "half-diminished", minMaj7: "minor-major 7th",
  maj9: "major 9th", min9: "minor 9th", "9": "dominant 9th",
  "6": "sixth", min6: "minor 6th", add9: "add 9",
};

const ACC_HUMAN = (r: string) => r.replace("#", "-sharp").replace("b", "-flat");

export function describeChord(c: ChordSymbol): string {
  const rootName = ACC_HUMAN(c.root[0]) + c.root.slice(1).replace(/[#b]/g, (a) => a === "#" ? "-sharp" : "-flat");
  // simpler: just root letter + accidental word
  const accidental = c.root.length > 1 ? (c.root[1] === "#" ? " sharp" : " flat") : "";
  return `${c.root[0]}${accidental} ${QUALITY_HUMAN[c.quality]}`;
}

export function suggestChords(query: string): ChordSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const root = normalizeRoot(q);
  if (!root) return [];
  // If the user typed more than just the root, parse strictly
  if (q.length > root.length) {
    const parsed = parseChord(q);
    return parsed ? [{ symbol: parsed, label: describeChord(parsed) }] : [];
  }
  // Just a root: surface every common quality on it
  return COMMON_QUALITIES.map((quality) => {
    const symbol: ChordSymbol = {
      root,
      quality,
      display: root + QUALITY_PRETTY[quality],
    };
    return { symbol, label: describeChord(symbol) };
  });
}
