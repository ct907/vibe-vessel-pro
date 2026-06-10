import {
  ChordSymbol, Mode, Quality, ChordFamily, QUALITY_FAMILY, rootToPc, isMinorMode,
} from "./chords";
import {
  MODE_CHARACTER, findParallelModesContaining, getNumeralAtDegree, type AnyMode,
} from "./modes";
import { QUALITY_GENRE_TAGS, type GenreTag } from "./genreColor";
import { getCR, type CRSpectrum } from "./chordRelationships";
import { detectPatterns, type ProgressionPattern } from "./harmony";

const SCALE_INTERVALS: Record<Mode, number[]> = {
  maj: [0, 2, 4, 5, 7, 9, 11],
  min: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11],
  "pentatonic-maj": [0, 2, 4, 7, 9],
  "pentatonic-min": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

const SCALE_QUALITIES: Record<Mode, Quality[]> = {
  maj: ["maj", "min", "min", "maj", "maj", "min", "dim"],
  min: ["min", "dim", "maj", "min", "min", "maj", "maj"],
  dorian: ["min", "min", "maj", "maj", "min", "dim", "maj"],
  phrygian: ["min", "maj", "maj", "min", "dim", "maj", "min"],
  lydian: ["maj", "maj", "min", "dim", "maj", "min", "min"],
  mixolydian: ["maj", "min", "dim", "maj", "min", "min", "maj"],
  locrian: ["dim", "maj", "min", "min", "maj", "maj", "min"],
  "harmonic-minor": ["min", "dim", "aug", "min", "maj", "maj", "dim"],
  "melodic-minor": ["min", "min", "aug", "maj", "maj", "dim", "dim"],
  "pentatonic-maj": ["maj", "min", "min", "maj", "min"],
  "pentatonic-min": ["min", "maj", "min", "min", "maj"],
  blues: ["min", "maj", "maj", "dim", "maj", "maj"],
};

const SCALE_NUMERALS: Record<Mode, string[]> = {
  maj: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  min: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
  dorian: ["i", "ii", "III", "IV", "v", "vi°", "VII"],
  phrygian: ["i", "♭II", "III", "iv", "v°", "VI", "♭vii"],
  lydian: ["I", "II", "iii", "#iv°", "V", "vi", "vii"],
  mixolydian: ["I", "ii", "iii°", "IV", "v", "vi", "♭VII"],
  locrian: ["i°", "♭II", "♭iii", "iv", "♭V", "♭VI", "♭vii"],
  "harmonic-minor": ["i", "ii°", "III+", "iv", "V", "VI", "vii°"],
  "melodic-minor": ["i", "ii", "III+", "IV", "V", "vi°", "vii°"],
  "pentatonic-maj": ["I", "ii", "iii", "V", "vi"],
  "pentatonic-min": ["i", "III", "iv", "v", "VII"],
  blues: ["i", "III", "IV", "♭V", "V", "VII"],
};

const QUALITY_INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  minMaj7: [0, 3, 7, 11],
  maj9: [0, 4, 7, 11],
  min9: [0, 3, 7, 10],
  "9": [0, 4, 7, 10],
  "6": [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  add9: [0, 4, 7],
  "5": [0, 7],
  "7alt": [0, 4, 8, 10],
  "7#5": [0, 4, 8, 10],
  "7b9": [0, 4, 7, 10],
  "7#9": [0, 4, 7, 10],
  maj11: [0, 4, 7, 11],
  maj13: [0, 4, 7, 11],
  min11: [0, 3, 7, 10],
  min13: [0, 3, 7, 10],
  add11: [0, 4, 7],
  "6/9": [0, 4, 7, 9],
  "13":      [0, 4, 7, 10],
  "13b9":    [0, 4, 7, 10],
  "9#11":    [0, 4, 7, 10],
  "maj9#11": [0, 4, 7, 11],
};

const CHROMATIC_FLAT_NAMES: Record<number, string> = {
  1: "♭II", 3: "♭III", 6: "♭V", 8: "♭VI", 10: "♭VII",
};
const CHROMATIC_SHARP_NAMES: Record<number, string> = {
  1: "♯I", 6: "♯IV", 8: "♯V",
};
const BASE_NUMERAL_BY_INTERVAL: Record<number, string> = {
  0: "I", 1: "II", 2: "II", 3: "III", 4: "III", 5: "IV", 6: "IV",
  7: "V", 8: "VI", 9: "VI", 10: "VII", 11: "VII",
};

function chromaticNumeral(interval: number, family: ChordFamily): string {
  let base = CHROMATIC_FLAT_NAMES[interval]
    ?? CHROMATIC_SHARP_NAMES[interval]
    ?? BASE_NUMERAL_BY_INTERVAL[interval]
    ?? `?${interval}`;
  if (family === "minor") base = base.toLowerCase();
  if (family === "diminished") base = base.toLowerCase() + "°";
  if (family === "special") {
    // aug
    base = base + "+";
  }
  return base;
}

function familyForSimpleCompare(q: Quality): "maj" | "min" | "dim" | "aug" | "other" {
  const fam = QUALITY_FAMILY[q];
  if (fam === "major" || fam === "dominant" || fam === "altered") return "maj";
  if (fam === "minor") return "min";
  if (fam === "diminished") return "dim";
  if (q === "aug") return "aug";
  return "other";
}

function diatonicNumeral(baseNumeral: string, expected: Quality, actual: Quality): string {
  let n = baseNumeral;
  const expFam = familyForSimpleCompare(expected);
  const actFam = familyForSimpleCompare(actual);
  if (expFam !== actFam) {
    const upper = actFam === "maj";
    n = upper ? n.toUpperCase().replace("°", "") : n.toLowerCase();
    if (actFam === "dim" && !n.endsWith("°")) n = n + "°";
    if (actFam === "aug" && !n.endsWith("+")) n = n + "+";
  }
  if (actual === "7" || actual === "9" || actual === "7alt" ||
      actual === "7#5" || actual === "7b9" || actual === "7#9") {
    n = n + "7";
  } else if (actual === "maj7" || actual === "maj9" || actual === "maj11" || actual === "maj13") {
    n = n + "maj7";
  } else if (actual === "min7" || actual === "min9" || actual === "min11" || actual === "min13") {
    n = n + "7";
  } else if (actual === "dim7") {
    n = n.replace("°", "") + "°7";
  } else if (actual === "m7b5") {
    n = n + "ø";
  }
  return n;
}

function effectiveMode(mode: Mode): "maj" | "min" {
  return isMinorMode(mode) ? "min" : "maj";
}

export interface ChordAnalysis {
  chord: ChordSymbol;
  rootPc: number;
  keyRootPc: number;
  keyMode: Mode;
  degreeOffset: number;
  degreeIndex: number;
  romanNumeral: string;
  expectedQuality: Quality | null;
  isDiatonic: boolean;
  isInScale: boolean;
  isBorrowed: boolean;
  isChromatic: boolean;
  function: "tonic" | "subdominant" | "dominant" | "predominant" | "ambiguous";
  borrowedFrom: AnyMode[];
  parentFamily: "major" | "minor" | "exotic" | null;
  moodLabel: string | null;
  chordFamily: ChordFamily;
  genreTags: GenreTag[];
  primaryGenre: GenreTag | null;
  isExtended: boolean;
  isAltered: boolean;
  isSuspended: boolean;
  isPower: boolean;
  hasSlashBass: boolean;
}

export interface FrictionResult {
  frictionScore: number;
  sharedAnchors: number;
  isSmooth: boolean;
}

export interface ChordTransition {
  from: ChordAnalysis;
  to: ChordAnalysis;
  intervalSemitones: number;
  motionType: "static" | "step" | "leap" | "fifth" | "fourth" | "tritone" | "chromatic";
  crEmotion: string | null;
  crSpectrum: CRSpectrum | null;
  frictionDelta: number;
}

export function voicingFor(chord: ChordSymbol): number[] {
  const intervals = (QUALITY_INTERVALS[chord.quality] ?? [0, 4, 7]).slice(0, 4);
  const rootPc = rootToPc(chord.root);
  const base = 60 + rootPc - 6;
  return intervals.map((iv) => base + iv);
}

export function frictionBetween(a: ChordSymbol, b: ChordSymbol): FrictionResult {
  const va = voicingFor(a).sort((x, y) => x - y);
  const vb = voicingFor(b).sort((x, y) => x - y);
  const n = Math.min(va.length, vb.length);
  let score = 0;
  let anchors = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(va[i] - vb[i]);
    score += d;
    if (d === 0) anchors++;
  }
  return { frictionScore: score, sharedAnchors: anchors, isSmooth: score <= 4 || anchors >= 2 };
}

export function analyzeChord(
  chord: ChordSymbol,
  keyRoot: string,
  keyMode: Mode,
): ChordAnalysis {
  const rootPc = rootToPc(chord.root);
  const keyRootPc = rootToPc(keyRoot);
  const degreeOffset = (rootPc - keyRootPc + 12) % 12;

  const scaleIntervals = SCALE_INTERVALS[keyMode] ?? SCALE_INTERVALS.maj;
  const scaleQualities = SCALE_QUALITIES[keyMode] ?? SCALE_QUALITIES.maj;
  const scaleNumerals = SCALE_NUMERALS[keyMode] ?? SCALE_NUMERALS.maj;
  const degreeIndex = scaleIntervals.indexOf(degreeOffset);
  const expectedQuality = degreeIndex >= 0 ? scaleQualities[degreeIndex] : null;

  const isInScale = degreeIndex !== -1;
  const isDiatonic = isInScale && expectedQuality === chord.quality;

  const allParallel = findParallelModesContaining(degreeOffset, chord.quality);
  const borrowedFrom = allParallel.filter((m) => m !== (keyMode as AnyMode));
  const isBorrowed = !isDiatonic && borrowedFrom.length > 0;
  const isChromatic = !isInScale && borrowedFrom.length === 0;

  const chordFamily = QUALITY_FAMILY[chord.quality];

  let romanNumeral: string;
  if (isInScale) {
    romanNumeral = diatonicNumeral(scaleNumerals[degreeIndex], expectedQuality!, chord.quality);
  } else {
    romanNumeral = getNumeralAtDegree(keyMode as AnyMode, degreeOffset)
      ?? chromaticNumeral(degreeOffset, chordFamily);
  }

  let func: ChordAnalysis["function"];
  const isDom7 = chord.quality === "7" || chord.quality === "9" ||
    chord.quality === "13" ||
    chord.quality === "7alt" || chord.quality === "7#5" ||
    chord.quality === "7b9" || chord.quality === "7#9" ||
    chord.quality === "13b9" || chord.quality === "9#11";
  if (degreeIndex === 0) func = "tonic";
  else if (degreeIndex === 4 || isDom7) func = "dominant";
  else if (degreeIndex === 3) func = "subdominant";
  else if (degreeIndex === 1) func = "predominant";
  else func = "ambiguous";

  const firstBorrow = borrowedFrom[0];
  const firstChar = firstBorrow ? MODE_CHARACTER[firstBorrow] : null;
  const parentFamily = firstChar?.parentFamily ?? null;
  const moodLabel = isBorrowed && firstChar ? firstChar.borrowLabel : null;

  const genreTags = QUALITY_GENRE_TAGS[chord.quality] ?? [];
  const primaryGenre = genreTags[0] ?? null;

  const q = chord.quality;
  const isExtended = /7|9|11|13/.test(q) && q !== "5" && q !== "6";
  const isAltered = (q.startsWith("7") && q.length > 1 && /alt|#|b/.test(q.slice(1)))
    || q === "13b9" || q === "9#11";
  const isSuspended = q === "sus2" || q === "sus4";
  const isPower = q === "5";
  const hasSlashBass = chord.bass != null;

  // effectiveMode is used elsewhere when needed; suppress unused warning by referencing.
  void effectiveMode;

  return {
    chord,
    rootPc,
    keyRootPc,
    keyMode,
    degreeOffset,
    degreeIndex,
    romanNumeral,
    expectedQuality,
    isDiatonic,
    isInScale,
    isBorrowed,
    isChromatic,
    function: func,
    borrowedFrom,
    parentFamily,
    moodLabel,
    chordFamily,
    genreTags,
    primaryGenre,
    isExtended,
    isAltered,
    isSuspended,
    isPower,
    hasSlashBass,
  };
}

function sharesPitchClass(a: ChordSymbol, b: ChordSymbol): boolean {
  const ivA = QUALITY_INTERVALS[a.quality] ?? [0, 4, 7];
  const ivB = QUALITY_INTERVALS[b.quality] ?? [0, 4, 7];
  const pcsA = new Set(ivA.map((i) => (rootToPc(a.root) + i) % 12));
  for (const i of ivB) {
    if (pcsA.has((rootToPc(b.root) + i) % 12)) return true;
  }
  return false;
}

export function analyzeTransition(
  from: ChordSymbol,
  to: ChordSymbol,
  keyRoot: string,
  keyMode: Mode,
): ChordTransition {
  const fromA = analyzeChord(from, keyRoot, keyMode);
  const toA = analyzeChord(to, keyRoot, keyMode);
  const intervalSemitones = (toA.rootPc - fromA.rootPc + 12) % 12;

  let motionType: ChordTransition["motionType"];
  if (intervalSemitones === 0) motionType = "static";
  else if (intervalSemitones === 1 || intervalSemitones === 2) motionType = "step";
  else if (intervalSemitones === 3 || intervalSemitones === 4) motionType = "leap";
  else if (intervalSemitones === 5) motionType = "fourth";
  else if (intervalSemitones === 6) motionType = "tritone";
  else if (intervalSemitones === 7) motionType = "fifth";
  else motionType = "leap";

  if ((intervalSemitones === 1 || intervalSemitones === 11) && sharesPitchClass(from, to)) {
    motionType = "chromatic";
  }

  const cr = getCR(from, to);
  const friction = frictionBetween(from, to);

  return {
    from: fromA,
    to: toA,
    intervalSemitones,
    motionType,
    crEmotion: cr?.emotion ?? null,
    crSpectrum: cr?.spectrum ?? null,
    frictionDelta: friction.frictionScore,
  };
}

export interface ProgressionAnalysisV2 {
  key: string;
  mode: Mode;
  chords: ChordAnalysis[];
  transitions: ChordTransition[];
  rootMotion: number[];
  patterns: ProgressionPattern[];
  totalFriction: number;
  averageFriction: number;
  frictionScores: FrictionResult[];
}

export function analyzeProgressionV2(
  chords: ChordSymbol[],
  keyRoot: string,
  keyMode: Mode,
): ProgressionAnalysisV2 {
  const analyses = chords.map((c) => analyzeChord(c, keyRoot, keyMode));
  const transitions: ChordTransition[] = [];
  const rootMotion: number[] = [];
  const frictionScores: FrictionResult[] = [];
  for (let i = 0; i < chords.length - 1; i++) {
    const t = analyzeTransition(chords[i], chords[i + 1], keyRoot, keyMode);
    transitions.push(t);
    const up = (rootToPc(chords[i + 1].root) - rootToPc(chords[i].root) + 12) % 12;
    rootMotion.push(up <= 6 ? up : up - 12);
    frictionScores.push(frictionBetween(chords[i], chords[i + 1]));
  }
  const totalFriction = frictionScores.reduce((s, f) => s + f.frictionScore, 0);
  const averageFriction = frictionScores.length ? totalFriction / frictionScores.length : 0;
  return {
    key: keyRoot,
    mode: keyMode,
    chords: analyses,
    transitions,
    rootMotion,
    patterns: detectPatterns(rootMotion, chords),
    totalFriction,
    averageFriction,
    frictionScores,
  };
}
