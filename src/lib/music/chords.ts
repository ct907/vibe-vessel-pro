// Chord parser, voicing resolver, and Nashville helpers.
// Symbol grammar: <root><accidental?><quality?><extension?>(/<bass>)?

export const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const NOTES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export type Quality =
  | "maj" | "min" | "dim" | "aug" | "sus2" | "sus4"
  | "maj7" | "min7" | "7" | "dim7" | "m7b5" | "minMaj7"
  | "maj9" | "min9" | "9" | "6" | "min6" | "add9"
  // Phase 1.5 additions
  | "5" | "7alt" | "7#5" | "7b9" | "7#9"
  | "maj11" | "maj13" | "min11" | "min13"
  | "add11" | "6/9";

export interface ChordSymbol {
  root: string;          // normalized: C, C#, Db, etc.
  quality: Quality;
  bass?: string;
  display: string;       // pretty form, e.g. "Fmaj7"
}

// QUALITY_MAP ordering rule (Phase 1.5):
//   - Sorted by the longest literal alternative in each regex, DESCENDING.
//   - When ties, more-specific (more accidentals) wins.
//   - Shortest single-character qualities (9, 7, 6, 5) MUST be checked LAST.
//   - When adding a new quality, RE-SORT the entire array — never splice
//     into the middle. The chord-parser regression test enforces this.
const QUALITY_MAP: Array<[RegExp, Quality]> = [
  // 5+ chars
  [/^(?:minMaj7|mMaj7|mM7)/, "minMaj7"],
  [/^(?:maj13|M13)/,         "maj13"],
  [/^(?:maj11|M11)/,         "maj11"],
  [/^(?:min13|m13)/,         "min13"],
  [/^(?:min11|m11)/,         "min11"],
  [/^add11/i,                "add11"],
  // 4 chars
  [/^(?:dim7|°7)/i,          "dim7"],
  [/^(?:m7b5|ø)/,            "m7b5"],
  [/^(?:maj9|M9)/,           "maj9"],
  [/^(?:maj7|M7|Δ7?)/,       "maj7"],
  [/^(?:min9|m9)/,           "min9"],
  [/^(?:min7|m7)/,           "min7"],
  [/^(?:min6|m6)/,           "min6"],
  [/^7alt/i,                 "7alt"],
  [/^sus2/i,                 "sus2"],
  [/^sus4/i,                 "sus4"],
  [/^add9/i,                 "add9"],
  // 3 chars (altered dominants must precede bare ^7)
  [/^7#5/,                   "7#5"],
  [/^7b9/,                   "7b9"],
  [/^7#9/,                   "7#9"],
  [/^6\/9/,                  "6/9"],
  [/^(?:dim|°)/i,            "dim"],
  [/^(?:min|m(?!aj))/,       "min"],
  [/^(?:aug|\+)/i,           "aug"],
  [/^sus/i,                  "sus4"],
  [/^(?:maj|M(?!7|9|11|13))/,"maj"],
  // 1 char (must be last)
  [/^9/,                     "9"],
  [/^7/,                     "7"],
  [/^6/,                     "6"],
  [/^5(?!\d)/,               "5"],
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
  // Phase 1.5
  "5":     [0, 7],
  "7alt":  [0, 4, 8, 10],
  "7#5":   [0, 4, 8, 10],
  "7b9":   [0, 4, 7, 10, 13],
  "7#9":   [0, 4, 7, 10, 15],
  maj11:   [0, 4, 7, 11, 14, 17],
  maj13:   [0, 4, 7, 11, 14, 21],
  min11:   [0, 3, 7, 10, 14, 17],
  min13:   [0, 3, 7, 10, 14, 21],
  add11:   [0, 4, 7, 17],
  "6/9":   [0, 4, 7, 9, 14],
};

const QUALITY_PRETTY: Record<Quality, string> = {
  maj: "", min: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
  maj7: "maj7", min7: "m7", "7": "7", dim7: "dim7", m7b5: "m7b5", minMaj7: "mMaj7",
  maj9: "maj9", min9: "m9", "9": "9", "6": "6", min6: "m6", add9: "add9",
  "5": "5", "7alt": "7alt", "7#5": "7#5", "7b9": "7b9", "7#9": "7#9",
  maj11: "maj11", maj13: "maj13", min11: "m11", min13: "m13",
  add11: "add11", "6/9": "6/9",
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
  // Determine how many characters of `trimmed` form the root (1 or 2),
  // then normalize (which may fold invalid roots like Fb→E, B#→C).
  const rawMatch = trimmed.match(/^[A-Ga-g][#b]?/);
  if (!rawMatch) return null;
  const consumed = rawMatch[0].length;
  const root = normalizeRoot(trimmed);
  if (!root) return null;
  let rest = trimmed.slice(consumed);
  let bass: string | undefined;
  // Special case: "6/9" is a quality, not a slash-bass. Detect before splitting.
  const isSixNine = /^6\/9(?![A-Ga-g0-9])/.test(rest);
  if (!isSixNine) {
    const slashIdx = rest.indexOf("/");
    if (slashIdx >= 0) {
      const b = normalizeRoot(rest.slice(slashIdx + 1));
      if (b) bass = b;
      rest = rest.slice(0, slashIdx);
    }
  } else {
    // Allow "C6/9/E" → quality 6/9, bass E
    const tail = rest.slice(3); // after "6/9"
    if (tail.startsWith("/")) {
      const b = normalizeRoot(tail.slice(1));
      if (b) bass = b;
    }
    rest = "6/9";
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
    // Slash-chord inverted bass: always exactly one octave below the chord root.
    const bassPc = rootToPc(chord.bass);
    const bassSameOct = base + ((bassPc - rootPc + 12) % 12);
    notes.unshift(bassSameOct - 12);
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

// Mode/scale identifier used by the song meta and key selector.
export type Mode =
  | "maj" | "min"
  | "dorian" | "phrygian" | "lydian" | "mixolydian" | "locrian"
  | "harmonic-minor" | "melodic-minor"
  | "pentatonic-maj" | "pentatonic-min"
  | "blues";

export const MODE_LABEL: Record<Mode, string> = {
  maj: "major",
  min: "minor",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  locrian: "Locrian",
  "harmonic-minor": "harmonic minor",
  "melodic-minor": "melodic minor",
  "pentatonic-maj": "pentatonic major",
  "pentatonic-min": "pentatonic minor",
  blues: "blues",
};

/** Suffix appended to the key root for display (e.g. C + "m" = Cm). */
export const MODE_SUFFIX: Record<Mode, string> = {
  maj: "",
  min: "m",
  dorian: " dorian",
  phrygian: " phrygian",
  lydian: " lydian",
  mixolydian: " mixo",
  locrian: " locrian",
  "harmonic-minor": " harm-min",
  "melodic-minor": " mel-min",
  "pentatonic-maj": " pent",
  "pentatonic-min": "m pent",
  blues: " blues",
};

interface ScaleDef {
  intervals: number[];
  qualities: Quality[];
  numerals: string[];
}

const SCALE_DEFS: Record<Mode, ScaleDef> = {
  maj: {
    intervals: [0, 2, 4, 5, 7, 9, 11],
    qualities: ["maj", "min", "min", "maj", "maj", "min", "dim"],
    numerals: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  },
  min: {
    intervals: [0, 2, 3, 5, 7, 8, 10],
    qualities: ["min", "dim", "maj", "min", "min", "maj", "maj"],
    numerals: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
  },
  dorian: {
    intervals: [0, 2, 3, 5, 7, 9, 10],
    qualities: ["min", "min", "maj", "maj", "min", "dim", "maj"],
    numerals: ["i", "ii", "III", "IV", "v", "vi°", "VII"],
  },
  phrygian: {
    intervals: [0, 1, 3, 5, 7, 8, 10],
    qualities: ["min", "maj", "maj", "min", "dim", "maj", "min"],
    numerals: ["i", "II", "III", "iv", "v°", "VI", "vii"],
  },
  lydian: {
    intervals: [0, 2, 4, 6, 7, 9, 11],
    qualities: ["maj", "maj", "min", "dim", "maj", "min", "min"],
    numerals: ["I", "II", "iii", "iv°", "V", "vi", "vii"],
  },
  mixolydian: {
    intervals: [0, 2, 4, 5, 7, 9, 10],
    qualities: ["maj", "min", "dim", "maj", "min", "min", "maj"],
    numerals: ["I", "ii", "iii°", "IV", "v", "vi", "VII"],
  },
  locrian: {
    intervals: [0, 1, 3, 5, 6, 8, 10],
    qualities: ["dim", "maj", "min", "min", "maj", "maj", "min"],
    numerals: ["i°", "II", "iii", "iv", "V", "VI", "vii"],
  },
  "harmonic-minor": {
    intervals: [0, 2, 3, 5, 7, 8, 11],
    qualities: ["min", "dim", "aug", "min", "maj", "maj", "dim"],
    numerals: ["i", "ii°", "III+", "iv", "V", "VI", "vii°"],
  },
  "melodic-minor": {
    intervals: [0, 2, 3, 5, 7, 9, 11],
    qualities: ["min", "min", "aug", "maj", "maj", "dim", "dim"],
    numerals: ["i", "ii", "III+", "IV", "V", "vi°", "vii°"],
  },
  "pentatonic-maj": {
    intervals: [0, 2, 4, 7, 9],
    qualities: ["maj", "min", "min", "maj", "min"],
    numerals: ["I", "ii", "iii", "V", "vi"],
  },
  "pentatonic-min": {
    intervals: [0, 3, 5, 7, 10],
    qualities: ["min", "maj", "min", "min", "maj"],
    numerals: ["i", "III", "iv", "v", "VII"],
  },
  blues: {
    intervals: [0, 3, 5, 6, 7, 10],
    qualities: ["min", "maj", "maj", "dim", "maj", "maj"],
    numerals: ["i", "III", "IV", "♭V", "V", "VII"],
  },
};

/** True when a mode is essentially "minor" for naming purposes (lowercase i, etc.) */
export function isMinorMode(mode: Mode): boolean {
  return (
    mode === "min" ||
    mode === "dorian" ||
    mode === "phrygian" ||
    mode === "locrian" ||
    mode === "harmonic-minor" ||
    mode === "melodic-minor" ||
    mode === "pentatonic-min" ||
    mode === "blues"
  );
}

export interface DegreeChord {
  numeral: string;
  chord: ChordSymbol;
}

export function nashvilleLadder(keyRoot: string, mode: Mode): DegreeChord[] {
  const def = SCALE_DEFS[mode] ?? SCALE_DEFS.maj;
  const rootPc = rootToPc(keyRoot);
  const useFlat = keyRoot.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(keyRoot);
  return def.intervals.map((iv, i) => {
    const pc = (rootPc + iv) % 12;
    const root = pcToName(pc, useFlat);
    const quality = def.qualities[i];
    const display = root + QUALITY_PRETTY[quality];
    return {
      numeral: def.numerals[i],
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
  "maj", "min", "7", "maj7", "min7", "sus2", "sus4", "9", "maj9", "min9",
  "6", "min6", "dim", "aug", "add9", "m7b5",
  // Phase 1.5
  "5", "7alt", "7#5", "7b9", "7#9",
  "maj11", "maj13", "min11", "min13", "add11", "6/9",
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
  "5": "power", "7alt": "altered dominant",
  "7#5": "dominant 7 sharp 5", "7b9": "dominant 7 flat 9", "7#9": "dominant 7 sharp 9",
  maj11: "major 11th", maj13: "major 13th",
  min11: "minor 11th", min13: "minor 13th",
  add11: "add 11", "6/9": "six nine",
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
  const rawMatch = q.match(/^[A-Ga-g][#b]?/);
  if (!rawMatch) return [];
  const consumed = rawMatch[0].length;
  const root = normalizeRoot(q);
  if (!root) return [];
  const tail = q.slice(consumed);

  // Helper to build a suggestion for a quality on the resolved root.
  const make = (quality: Quality): ChordSuggestion => {
    const symbol: ChordSymbol = { root, quality, display: root + QUALITY_PRETTY[quality] };
    return { symbol, label: describeChord(symbol) };
  };

  // Just a root: surface every common quality.
  if (tail.length === 0) return COMMON_QUALITIES.map(make);

  // Partial-quality filter: any common quality whose pretty form is a prefix
  // of what the user typed (or vice versa). This lets "Cdim" → dim/dim7,
  // "Cm" → m/m7/m9/m6/…, "Cmaj" → maj/maj7/maj9.
  const lowerTail = tail.toLowerCase();
  const filtered = COMMON_QUALITIES.filter((quality) => {
    const pretty = QUALITY_PRETTY[quality].toLowerCase();
    if (!pretty) return false;
    return pretty.startsWith(lowerTail) || lowerTail.startsWith(pretty);
  }).map(make);

  // Always include a strict parse if we can produce one (e.g. slash chords,
  // exotic qualities, or fully-typed chords).
  const parsed = parseChord(q);
  if (parsed && !filtered.some((f) => f.symbol.display === parsed.display)) {
    return [{ symbol: parsed, label: describeChord(parsed) }, ...filtered];
  }
  return filtered;
}
