import {
  ChordSymbol, Mode, Quality, rootToPc, isMinorMode,
} from "./chords";

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_DEGREE_QUALITY: Quality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_DEGREE_QUALITY: Quality[] = ["min", "dim", "maj", "min", "min", "maj", "maj"];
const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

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
};

export interface ChordAnalysis {
  chord: ChordSymbol;
  interval: number;
  degree: number;
  romanNumeral: string;
  function: "tonic" | "subdominant" | "dominant" | "chromatic";
  isBorrowed: boolean;
  borrowedFrom: string | null;
  isChromatic: boolean;
}

export interface FrictionResult {
  frictionScore: number;
  sharedAnchors: number;
  isSmooth: boolean;
}

export interface ProgressionPattern {
  type:
    | "stepwise_descent"
    | "stepwise_ascent"
    | "circle_of_fifths"
    | "chromatic_approach"
    | "pedal"
    | "sequence"
    | "repeated_loop";
  startIndex: number;
  endIndex: number;
  description: string;
}

export interface ProgressionAnalysis {
  key: string;
  mode: Mode;
  chords: ChordAnalysis[];
  rootMotion: number[];
  patterns: ProgressionPattern[];
  frictionScores: FrictionResult[];
  averageFriction: number;
}

function effectiveMode(mode: Mode): "maj" | "min" {
  return isMinorMode(mode) ? "min" : "maj";
}

function scaleFor(mode: "maj" | "min"): number[] {
  return mode === "maj" ? MAJOR_SCALE : MINOR_SCALE;
}

function qualitiesFor(mode: "maj" | "min"): Quality[] {
  return mode === "maj" ? MAJOR_DEGREE_QUALITY : MINOR_DEGREE_QUALITY;
}

function numeralsFor(mode: "maj" | "min"): string[] {
  return mode === "maj" ? MAJOR_NUMERALS : MINOR_NUMERALS;
}

function qualityFamilyForRoman(quality: Quality): "maj" | "min" | "dim" | "aug" | "other" {
  if (quality === "dim" || quality === "dim7" || quality === "m7b5") return "dim";
  if (quality === "aug") return "aug";
  if (
    quality === "min" || quality === "min7" || quality === "min9" ||
    quality === "min6" || quality === "min11" || quality === "min13" ||
    quality === "minMaj7"
  ) return "min";
  if (
    quality === "maj" || quality === "maj7" || quality === "maj9" ||
    quality === "maj11" || quality === "maj13" || quality === "6" ||
    quality === "6/9" || quality === "add9" || quality === "add11" ||
    quality === "7" || quality === "9" || quality === "7alt" ||
    quality === "7#5" || quality === "7b9" || quality === "7#9"
  ) return "maj";
  return "other";
}

const BASE_NUMERAL_BY_INTERVAL: Record<number, string> = {
  0: "I", 2: "II", 3: "III", 4: "III", 5: "IV", 6: "IV",
  7: "V", 8: "VI", 9: "VI", 10: "VII", 11: "VII", 1: "II",
};

function chromaticRoman(interval: number, family: "maj" | "min" | "dim" | "aug" | "other"): string {
  // Pick the nearest diatonic neighbour and prefix flat/sharp.
  const flatMap: Record<number, string> = {
    1: "♭II", 3: "♭III", 6: "♭V", 8: "♭VI", 10: "♭VII",
  };
  const sharpMap: Record<number, string> = {
    1: "♯I", 6: "♯IV", 8: "♯V",
  };
  let base = flatMap[interval] ?? sharpMap[interval] ?? BASE_NUMERAL_BY_INTERVAL[interval] ?? `?${interval}`;
  if (family === "min") base = base.toLowerCase().replace("♭", "♭").replace("♯", "♯");
  if (family === "dim") base = base.toLowerCase() + "°";
  if (family === "aug") base = base + "+";
  return base;
}

function diatonicRoman(degree: number, modeName: "maj" | "min", actualQuality: Quality): string {
  const numerals = numeralsFor(modeName);
  let n = numerals[degree];
  const expected = qualitiesFor(modeName)[degree];
  const fam = qualityFamilyForRoman(actualQuality);
  const expectedFam = qualityFamilyForRoman(expected);
  if (fam !== expectedFam) {
    // Quality changed (e.g. ii → II major). Re-case based on actual quality.
    const upper = fam === "maj";
    n = upper ? n.toUpperCase().replace("°", "") : n.toLowerCase();
    if (fam === "dim" && !n.endsWith("°")) n = n + "°";
    if (fam === "aug" && !n.endsWith("+")) n = n + "+";
  }
  // 7th / extension suffix
  if (actualQuality === "7" || actualQuality === "9" || actualQuality === "7alt" ||
      actualQuality === "7#5" || actualQuality === "7b9" || actualQuality === "7#9") {
    n = n + "7";
  } else if (actualQuality === "maj7" || actualQuality === "maj9" || actualQuality === "maj11" || actualQuality === "maj13") {
    n = n + "maj7";
  } else if (actualQuality === "min7" || actualQuality === "min9" || actualQuality === "min11" || actualQuality === "min13") {
    n = n + "7";
  } else if (actualQuality === "dim7") {
    n = n.replace("°", "") + "°7";
  } else if (actualQuality === "m7b5") {
    n = n + "ø";
  }
  return n;
}

function functionOf(degree: number, isBorrowed: boolean, isChromatic: boolean, interval: number, modeName: "maj" | "min"): ChordAnalysis["function"] {
  if (isChromatic) return "chromatic";
  if (isBorrowed) {
    // Borrowed iv (interval 5, minor) in major = subdominant.
    if (modeName === "maj" && interval === 5) return "subdominant";
    // Borrowed ♭VII (interval 10, major) in major = dominant-ish.
    if (modeName === "maj" && interval === 10) return "dominant";
    return "chromatic";
  }
  if (modeName === "maj") {
    if (degree === 0 || degree === 2 || degree === 5) return "tonic";
    if (degree === 1 || degree === 3) return "subdominant";
    if (degree === 4 || degree === 6) return "dominant";
  } else {
    if (degree === 0 || degree === 2 || degree === 5) return "tonic";
    if (degree === 1 || degree === 3) return "subdominant";
    if (degree === 4 || degree === 6) return "dominant";
  }
  return "chromatic";
}

function analyzeChord(chord: ChordSymbol, keyRoot: string, mode: Mode): ChordAnalysis {
  const modeName = effectiveMode(mode);
  const parallelName: "maj" | "min" = modeName === "maj" ? "min" : "maj";
  const interval = (rootToPc(chord.root) - rootToPc(keyRoot) + 12) % 12;
  const scale = scaleFor(modeName);
  const parallelScale = scaleFor(parallelName);
  let degree = scale.indexOf(interval);
  let isBorrowed = false;
  let borrowedFrom: string | null = null;
  let isChromatic = false;
  if (degree < 0) {
    const pIdx = parallelScale.indexOf(interval);
    if (pIdx >= 0) {
      isBorrowed = true;
      borrowedFrom = parallelName === "min" ? "parallel minor" : "parallel major";
    } else {
      isChromatic = true;
    }
  }
  const romanNumeral = degree >= 0
    ? diatonicRoman(degree, modeName, chord.quality)
    : chromaticRoman(interval, qualityFamilyForRoman(chord.quality));
  const func = functionOf(degree, isBorrowed, isChromatic, interval, modeName);
  return {
    chord,
    interval,
    degree: degree >= 0 ? degree : -1,
    romanNumeral,
    function: func,
    isBorrowed,
    borrowedFrom,
    isChromatic,
  };
}

function rootMotionBetween(a: ChordSymbol, b: ChordSymbol): number {
  const up = (rootToPc(b.root) - rootToPc(a.root) + 12) % 12;
  return up <= 6 ? up : up - 12;
}

function detectPatterns(rootMotion: number[], chords: ChordSymbol[]): ProgressionPattern[] {
  const out: ProgressionPattern[] = [];
  if (rootMotion.length === 0) return out;

  // Stepwise descent / ascent (3+ consecutive motions of magnitude 1-2)
  let runStart = 0;
  let runDir = 0;
  for (let i = 0; i <= rootMotion.length; i++) {
    const m = i < rootMotion.length ? rootMotion[i] : 0;
    const inStep = i < rootMotion.length && Math.abs(m) >= 1 && Math.abs(m) <= 2;
    const dir = m < 0 ? -1 : m > 0 ? 1 : 0;
    if (inStep && (runDir === 0 || dir === runDir)) {
      if (runDir === 0) { runStart = i; runDir = dir; }
    } else {
      const runLen = i - runStart;
      if (runDir !== 0 && runLen >= 3) {
        out.push({
          type: runDir < 0 ? "stepwise_descent" : "stepwise_ascent",
          startIndex: runStart,
          endIndex: runStart + runLen,
          description: `Roots ${runDir < 0 ? "descend" : "ascend"} by step from chord ${runStart + 1} to ${runStart + runLen + 1}.`,
        });
      }
      runStart = i;
      runDir = inStep ? dir : 0;
    }
  }

  // Circle of fifths (3+ motions of |5| or |7|)
  let cofStart = -1;
  for (let i = 0; i <= rootMotion.length; i++) {
    const ok = i < rootMotion.length && (Math.abs(rootMotion[i]) === 5 || Math.abs(rootMotion[i]) === 7);
    if (ok) {
      if (cofStart < 0) cofStart = i;
    } else {
      if (cofStart >= 0 && i - cofStart >= 3) {
        out.push({
          type: "circle_of_fifths",
          startIndex: cofStart,
          endIndex: i,
          description: `Circle-of-fifths motion from chord ${cofStart + 1} to ${i + 1}.`,
        });
      }
      cofStart = -1;
    }
  }

  // Chromatic approach: single motion of ±1
  for (let i = 0; i < rootMotion.length; i++) {
    if (Math.abs(rootMotion[i]) === 1) {
      out.push({
        type: "chromatic_approach",
        startIndex: i,
        endIndex: i + 1,
        description: `Chromatic step from chord ${i + 1} into chord ${i + 2}.`,
      });
    }
  }

  // Pedal: 2+ consecutive chords sharing root (interval 0)
  let pedalStart = -1;
  for (let i = 0; i <= rootMotion.length; i++) {
    const ok = i < rootMotion.length && rootMotion[i] === 0;
    if (ok) {
      if (pedalStart < 0) pedalStart = i;
    } else {
      if (pedalStart >= 0) {
        out.push({
          type: "pedal",
          startIndex: pedalStart,
          endIndex: i + 1,
          description: `Same root held from chord ${pedalStart + 1} to ${i + 1}.`,
        });
      }
      pedalStart = -1;
    }
  }

  // Sequence: repeating sub-pattern of length 2-4 in rootMotion
  for (const len of [2, 3, 4]) {
    if (rootMotion.length >= len * 2) {
      const first = rootMotion.slice(0, len);
      const second = rootMotion.slice(len, len * 2);
      if (first.every((v, i) => v === second[i])) {
        out.push({
          type: "sequence",
          startIndex: 0,
          endIndex: len * 2,
          description: `Sequence: same ${len}-step interval pattern repeats.`,
        });
        break;
      }
    }
  }

  // Repeated loop: split into 2/3/4 equal chunks, ≥75% shared roots
  for (const parts of [2, 3, 4]) {
    if (chords.length >= parts * 2 && chords.length % parts === 0) {
      const size = chords.length / parts;
      const first = chords.slice(0, size).map((c) => rootToPc(c.root));
      let matchCount = 0;
      for (let p = 1; p < parts; p++) {
        const chunk = chords.slice(p * size, (p + 1) * size).map((c) => rootToPc(c.root));
        const matches = chunk.filter((pc, i) => pc === first[i]).length;
        if (matches / size >= 0.75) matchCount++;
      }
      if (matchCount === parts - 1) {
        out.push({
          type: "repeated_loop",
          startIndex: 0,
          endIndex: chords.length,
          description: `Progression splits into ${parts} near-identical chunks.`,
        });
        break;
      }
    }
  }

  return out;
}

function voicingFor(chord: ChordSymbol): number[] {
  const intervals = (QUALITY_INTERVALS[chord.quality] ?? [0, 4, 7]).slice(0, 4);
  const rootPc = rootToPc(chord.root);
  const base = 60 + rootPc - 6; // keep around C4
  return intervals.map((iv) => base + iv);
}

function frictionBetween(a: ChordSymbol, b: ChordSymbol): FrictionResult {
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

export function analyzeProgression(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): ProgressionAnalysis {
  const analyses = chords.map((c) => analyzeChord(c, keyRoot, mode));
  const rootMotion: number[] = [];
  const frictionScores: FrictionResult[] = [];
  for (let i = 0; i < chords.length - 1; i++) {
    rootMotion.push(rootMotionBetween(chords[i], chords[i + 1]));
    frictionScores.push(frictionBetween(chords[i], chords[i + 1]));
  }
  const averageFriction = frictionScores.length
    ? frictionScores.reduce((s, f) => s + f.frictionScore, 0) / frictionScores.length
    : 0;
  return {
    key: keyRoot,
    mode,
    chords: analyses,
    rootMotion,
    patterns: detectPatterns(rootMotion, chords),
    frictionScores,
    averageFriction,
  };
}

const FUNCTION_PHRASE: Record<ChordAnalysis["function"], string> = {
  tonic: "home base — feels resolved and stable",
  subdominant: "lifts away from home and sets up tension",
  dominant: "creates tension that wants to resolve back to the tonic",
  chromatic: "sits outside the key for color",
};

export function describeChordFunction(
  analysis: ChordAnalysis,
  keyRoot: string,
  mode: Mode,
): string {
  const modeName = effectiveMode(mode) === "maj" ? "major" : "minor";
  const name = analysis.chord.display;
  if (analysis.isBorrowed && analysis.borrowedFrom) {
    return `${name} is a borrowed ${analysis.romanNumeral} from ${keyRoot} ${analysis.borrowedFrom === "parallel minor" ? "minor" : "major"}. It adds an unexpected color to ${keyRoot} ${modeName}.`;
  }
  if (analysis.isChromatic) {
    return `${name} is a chromatic chord (${analysis.romanNumeral}) — outside ${keyRoot} ${modeName}, dramatic and unexpected.`;
  }
  return `${name} is the ${analysis.romanNumeral} in ${keyRoot} ${modeName}. It ${FUNCTION_PHRASE[analysis.function]}.`;
}
