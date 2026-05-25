import type { ChordSymbol, Mode } from "./chords";
import { rootToPc } from "./chords";
import type { ChordAnalysis } from "./analyzeChord";

export type { ChordAnalysis, FrictionResult, ChordTransition } from "./analyzeChord";
export { analyzeChord, analyzeTransition, voicingFor, frictionBetween } from "./analyzeChord";
export { analyzeProgressionV2 as analyzeProgression } from "./analyzeChord";

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
  averageFriction: number;
}

export function detectPatterns(rootMotion: number[], chords: ChordSymbol[]): ProgressionPattern[] {
  const out: ProgressionPattern[] = [];
  if (rootMotion.length === 0) return out;

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

const FUNCTION_PHRASE: Record<ChordAnalysis["function"], string> = {
  tonic: "home base — feels resolved and stable",
  subdominant: "lifts away from home and sets up tension",
  predominant: "sets up the dominant and leans forward",
  dominant: "creates tension that wants to resolve back to the tonic",
  ambiguous: "sits outside the key for color",
};

export function describeChordFunction(analysis: ChordAnalysis): string {
  const name = analysis.chord.display;
  if (analysis.isBorrowed && analysis.borrowedFrom.length > 0) {
    const mood = analysis.moodLabel ?? "a parallel mode";
    return `${name} is a borrowed ${analysis.romanNumeral} — ${mood.toLowerCase()}.`;
  }
  if (analysis.isChromatic) {
    return `${name} is a chromatic chord (${analysis.romanNumeral}) — outside the key, dramatic and unexpected.`;
  }
  return `${name} is the ${analysis.romanNumeral}. It ${FUNCTION_PHRASE[analysis.function]}.`;
}
