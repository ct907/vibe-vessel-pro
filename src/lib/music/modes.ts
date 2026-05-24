import type { Mode, Quality } from "./chords";

export type AdvancedMode =
  | "double-harmonic-major"
  | "phrygian-dominant"
  | "lydian-dominant"
  | "altered";

export type AnyMode = Mode | AdvancedMode;

export interface ScaleDef {
  intervals: number[];
  qualities: Quality[];
  numerals: string[];
}

export const ADVANCED_SCALE_DEFS: Record<AdvancedMode, ScaleDef> = {
  "double-harmonic-major": {
    intervals: [0, 1, 4, 5, 7, 8, 11],
    qualities: ["maj", "maj", "min", "min", "maj", "maj", "dim"],
    numerals: ["I", "♭II", "iii", "iv", "V", "♭VI", "vii°"],
  },
  "phrygian-dominant": {
    intervals: [0, 1, 4, 5, 7, 8, 10],
    qualities: ["maj", "maj", "dim", "min", "dim", "maj", "min"],
    numerals: ["I", "♭II", "iii°", "iv", "v°", "♭VI", "♭vii"],
  },
  "lydian-dominant": {
    intervals: [0, 2, 4, 6, 7, 9, 10],
    qualities: ["maj", "maj", "min", "dim", "min", "min", "maj"],
    numerals: ["I", "II", "iii", "#iv°", "v", "vi", "♭VII"],
  },
  altered: {
    intervals: [0, 1, 3, 4, 6, 8, 10],
    qualities: ["dim", "min", "min", "maj", "maj", "maj", "min"],
    numerals: ["i°", "♭ii", "♭iii", "III", "♭V", "♭VI", "♭vii"],
  },
};

const SCALE_DEFS_INTERNAL: Record<Mode, ScaleDef> = {
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
    numerals: ["i", "♭II", "III", "iv", "v°", "VI", "♭vii"],
  },
  lydian: {
    intervals: [0, 2, 4, 6, 7, 9, 11],
    qualities: ["maj", "maj", "min", "dim", "maj", "min", "min"],
    numerals: ["I", "II", "iii", "#iv°", "V", "vi", "vii"],
  },
  mixolydian: {
    intervals: [0, 2, 4, 5, 7, 9, 10],
    qualities: ["maj", "min", "dim", "maj", "min", "min", "maj"],
    numerals: ["I", "ii", "iii°", "IV", "v", "vi", "♭VII"],
  },
  locrian: {
    intervals: [0, 1, 3, 5, 6, 8, 10],
    qualities: ["dim", "maj", "min", "min", "maj", "maj", "min"],
    numerals: ["i°", "♭II", "♭iii", "iv", "♭V", "♭VI", "♭vii"],
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

const ALL_SCALES: Record<AnyMode, ScaleDef> = {
  ...SCALE_DEFS_INTERNAL,
  ...ADVANCED_SCALE_DEFS,
};

export interface ModeCharacter {
  mood: string;
  characteristicDegrees: number[];
  borrowLabel: string;
  parentFamily: "major" | "minor" | "exotic";
}

export const MODE_CHARACTER: Record<AnyMode, ModeCharacter> = {
  maj: {
    mood: "Bright, stable",
    characteristicDegrees: [3, 7],
    borrowLabel: "Pop/classical",
    parentFamily: "major",
  },
  min: {
    mood: "Sad, grounded",
    characteristicDegrees: [3, 6, 7],
    borrowLabel: "Pop/classical minor",
    parentFamily: "minor",
  },
  dorian: {
    mood: "Moody, cool",
    characteristicDegrees: [6],
    borrowLabel: "Folk/jazz",
    parentFamily: "minor",
  },
  phrygian: {
    mood: "Spanish, dark",
    characteristicDegrees: [2],
    borrowLabel: "Flamenco/metal",
    parentFamily: "minor",
  },
  lydian: {
    mood: "Dreamy, floating",
    characteristicDegrees: [4],
    borrowLabel: "Cinematic lift",
    parentFamily: "major",
  },
  mixolydian: {
    mood: "Rock, bluesy",
    characteristicDegrees: [7],
    borrowLabel: "Classic rock",
    parentFamily: "major",
  },
  locrian: {
    mood: "Unstable, tense",
    characteristicDegrees: [2, 5],
    borrowLabel: "Metal/dissonant",
    parentFamily: "minor",
  },
  "harmonic-minor": {
    mood: "Dramatic, exotic",
    characteristicDegrees: [6, 7],
    borrowLabel: "Classical/cinematic",
    parentFamily: "minor",
  },
  "melodic-minor": {
    mood: "Smooth, jazzy",
    characteristicDegrees: [6, 7],
    borrowLabel: "Jazz/modern",
    parentFamily: "minor",
  },
  "pentatonic-maj": {
    mood: "Open, folk",
    characteristicDegrees: [1, 5],
    borrowLabel: "Folk/pop",
    parentFamily: "major",
  },
  "pentatonic-min": {
    mood: "Bluesy, simple",
    characteristicDegrees: [3, 7],
    borrowLabel: "Blues/rock",
    parentFamily: "minor",
  },
  blues: {
    mood: "Soulful, gritty",
    characteristicDegrees: [3, 5, 7],
    borrowLabel: "Blues/R&B",
    parentFamily: "minor",
  },
  "double-harmonic-major": {
    mood: "Mysterious, ornate",
    characteristicDegrees: [2, 6],
    borrowLabel: "Byzantine/Arabic",
    parentFamily: "exotic",
  },
  "phrygian-dominant": {
    mood: "Exotic, Middle-Eastern",
    characteristicDegrees: [2, 3],
    borrowLabel: "Hijaz/flamenco",
    parentFamily: "exotic",
  },
  "lydian-dominant": {
    mood: "Bright, edgy",
    characteristicDegrees: [4, 7],
    borrowLabel: "Fusion/film",
    parentFamily: "exotic",
  },
  altered: {
    mood: "Tense, unresolved",
    characteristicDegrees: [2, 3, 5, 6],
    borrowLabel: "Jazz tension",
    parentFamily: "exotic",
  },
};

export const ADVANCED_MODE_LABEL: Record<AdvancedMode, string> = {
  "double-harmonic-major": "double harmonic major",
  "phrygian-dominant": "Phrygian dominant",
  "lydian-dominant": "Lydian dominant",
  altered: "altered (super-Locrian)",
};

/**
 * Quality at a semitone offset (0-11) from the key root in the given mode.
 * Returns null if that semitone is not a scale degree in that mode.
 */
export function getQualityAtDegree(
  mode: AnyMode,
  degreeFromKeyRoot: number,
): Quality | null {
  const def = ALL_SCALES[mode];
  if (!def) return null;
  const norm = ((degreeFromKeyRoot % 12) + 12) % 12;
  const idx = def.intervals.indexOf(norm);
  if (idx < 0) return null;
  return def.qualities[idx] ?? null;
}

/**
 * Return all 16 modes where `quality` appears at `degreeFromKeyRoot`
 * (semitone offset from key root). Useful for "what mode contains this
 * chord at this position?" lookups.
 */
export function findParallelModesContaining(
  degreeFromKeyRoot: number,
  quality: Quality,
): AnyMode[] {
  const out: AnyMode[] = [];
  for (const m of Object.keys(ALL_SCALES) as AnyMode[]) {
    if (getQualityAtDegree(m, degreeFromKeyRoot) === quality) out.push(m);
  }
  return out;
}

/** Numeral string for a chord at `degreeFromKeyRoot` in `mode`, or null. */
export function getNumeralAtDegree(
  mode: AnyMode,
  degreeFromKeyRoot: number,
): string | null {
  const def = ALL_SCALES[mode];
  if (!def) return null;
  const norm = ((degreeFromKeyRoot % 12) + 12) % 12;
  const idx = def.intervals.indexOf(norm);
  if (idx < 0) return null;
  return def.numerals[idx] ?? null;
}

export function modeDisplayName(mode: AnyMode): string {
  const map: Record<AnyMode, string> = {
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
    ...ADVANCED_MODE_LABEL,
  };
  return map[mode];
}
