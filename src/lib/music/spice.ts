import {
  ChordSymbol, Mode, Quality, QUALITY_PRETTY, rootToPc, pcToName, isMinorMode,
} from "./chords";
import { analyzeProgression } from "./harmony";

export type SpiceCategory =
  | "cinematic"
  | "espionage"
  | "cosmic_drift"
  | "gateway"
  | "step_between"
  | "hypnotic_drone"
  | "amplify"
  | "break_pattern";

export interface SpiceSuggestion {
  id: string;
  category: SpiceCategory;
  emotiveLabel: string;
  theoryLabel: string;
  description: string;
  chords: ChordSymbol[];
  changedIndices: number[];
  countChanged: boolean;
  suggestedDurations: number[] | null;
  frictionDelta: number;
}

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);

function useFlatFor(keyRoot: string): boolean {
  return keyRoot.includes("b") || FLAT_KEYS.has(keyRoot);
}

function buildChord(rootPc: number, quality: Quality, useFlat: boolean, bass?: string): ChordSymbol {
  const root = pcToName(rootPc, useFlat);
  return {
    root,
    quality,
    bass,
    display: root + QUALITY_PRETTY[quality] + (bass ? `/${bass}` : ""),
  };
}

function withBass(chord: ChordSymbol, bassName: string): ChordSymbol {
  return {
    ...chord,
    bass: bassName,
    display: chord.root + QUALITY_PRETTY[chord.quality] + `/${bassName}`,
  };
}

function chordsEqual(a: ChordSymbol[], b: ChordSymbol[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.display === b[i].display);
}

function diffIndices(orig: ChordSymbol[], next: ChordSymbol[]): number[] {
  const out: number[] = [];
  const n = Math.min(orig.length, next.length);
  for (let i = 0; i < n; i++) if (orig[i].display !== next[i].display) out.push(i);
  if (next.length > orig.length) for (let i = orig.length; i < next.length; i++) out.push(i);
  return out;
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function effectiveModeName(mode: Mode): "maj" | "min" {
  return isMinorMode(mode) ? "min" : "maj";
}

function isMajorish(q: Quality): boolean {
  return q === "maj" || q === "maj7" || q === "maj9" || q === "6" || q === "6/9" ||
    q === "add9" || q === "maj11" || q === "maj13";
}
function isMinorish(q: Quality): boolean {
  return q === "min" || q === "min7" || q === "min9" || q === "min6" || q === "min11" ||
    q === "min13" || q === "minMaj7";
}
function isDimish(q: Quality): boolean {
  return q === "dim" || q === "dim7" || q === "m7b5";
}

// ----- Cinematic: chromatic mediants -----
function cinematicSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  const useFlat = useFlatFor(keyRoot);
  const modeName = effectiveModeName(mode);
  const scale = modeName === "maj" ? MAJOR_SCALE : MINOR_SCALE;
  const keyPc = rootToPc(keyRoot);
  const offsets = [-4, -3, 3, 4];
  const existingPcs = new Set(chords.map((c) => rootToPc(c.root)));
  for (let i = 0; i < chords.length; i++) {
    for (const off of offsets) {
      const newPc = (rootToPc(chords[i].root) + off + 12) % 12;
      const interval = (newPc - keyPc + 12) % 12;
      if (scale.includes(interval)) continue;
      if (existingPcs.has(newPc)) continue;
      const next = chords.slice();
      next[i] = buildChord(newPc, chords[i].quality, useFlat);
      out.push({
        chords: next,
        changedIndices: [i],
        label: `${chords[i].display} → ${next[i].display}`,
      });
    }
  }
  return out;
}

// ----- Espionage: line cliché on one chord -----
function espionageSuggestions(
  chords: ChordSymbol[],
  durations: number[] | undefined,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  suggestedDurations: number[];
  label: string;
}> {
  const out: Array<{
    chords: ChordSymbol[];
    changedIndices: number[];
    suggestedDurations: number[];
    label: string;
  }> = [];
  for (let i = 0; i < chords.length; i++) {
    const src = chords[i];
    const dur = durations?.[i] ?? 4;
    if (dur < 2) continue;
    let cliche: ChordSymbol[] | null = null;
    if (isMinorish(src.quality)) {
      cliche = [
        { root: src.root, quality: "min", display: src.root + "m" },
        { root: src.root, quality: "minMaj7", display: src.root + "mMaj7" },
        { root: src.root, quality: "min7", display: src.root + "m7" },
        { root: src.root, quality: "min6", display: src.root + "m6" },
      ];
    } else if (isMajorish(src.quality)) {
      cliche = [
        { root: src.root, quality: "maj", display: src.root },
        { root: src.root, quality: "maj7", display: src.root + "maj7" },
        { root: src.root, quality: "7", display: src.root + "7" },
        { root: src.root, quality: "6", display: src.root + "6" },
      ];
    }
    if (!cliche) continue;
    const next = [...chords.slice(0, i), ...cliche, ...chords.slice(i + 1)];
    const newDurations = (durations ?? chords.map(() => 4)).slice();
    const each = dur / cliche.length;
    newDurations.splice(i, 1, each, each, each, each);
    const changed: number[] = [i, i + 1, i + 2, i + 3];
    out.push({
      chords: next,
      changedIndices: changed,
      suggestedDurations: newDurations,
      label: `Line cliché on ${src.display}`,
    });
  }
  return out;
}

// ----- Cosmic drift: modal interchange -----
function cosmicDriftSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  const useFlat = useFlatFor(keyRoot);
  const modeName = effectiveModeName(mode);
  const keyPc = rootToPc(keyRoot);
  const analysis = analyzeProgression(chords, keyRoot, mode);
  const borrows = modeName === "maj"
    ? [{ interval: 5, quality: "min" as Quality }, { interval: 10, quality: "maj" as Quality },
       { interval: 3, quality: "maj" as Quality }, { interval: 8, quality: "maj" as Quality }]
    : [{ interval: 5, quality: "maj" as Quality }, { interval: 0, quality: "maj" as Quality }];
  for (let i = 0; i < chords.length; i++) {
    const a = analysis.chords[i];
    if (a.isBorrowed) continue;
    if (a.degree < 0) continue;
    for (const b of borrows) {
      const newPc = (keyPc + b.interval) % 12;
      // Only suggest if the borrow shares root with this chord (parallel-key equivalent swap)
      if (rootToPc(chords[i].root) !== newPc) continue;
      const next = chords.slice();
      next[i] = buildChord(newPc, b.quality, useFlat);
      if (next[i].display === chords[i].display) continue;
      out.push({
        chords: next,
        changedIndices: [i],
        label: `${chords[i].display} → ${next[i].display}`,
      });
    }
  }
  // Also offer direct borrows: replace each diatonic chord with its parallel-key shadow
  for (let i = 0; i < chords.length; i++) {
    const a = analysis.chords[i];
    if (a.isBorrowed || a.isChromatic) continue;
    for (const b of borrows) {
      const newPc = (keyPc + b.interval) % 12;
      if (newPc === rootToPc(chords[i].root)) continue;
      const next = chords.slice();
      next[i] = buildChord(newPc, b.quality, useFlat);
      if (chords.some((c, k) => k !== i && c.display === next[i].display)) continue;
      out.push({
        chords: next,
        changedIndices: [i],
        label: `Borrow ${next[i].display} for chord ${i + 1}`,
      });
    }
  }
  return out;
}

// ----- Gateway: secondary dominants -----
function gatewaySuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  const useFlat = useFlatFor(keyRoot);
  const keyPc = rootToPc(keyRoot);
  for (let i = 1; i < chords.length; i++) {
    const target = chords[i];
    if (rootToPc(target.root) === keyPc) continue;
    if (isDimish(target.quality)) continue;
    const domPc = (rootToPc(target.root) + 7) % 12;
    const dom = buildChord(domPc, "7", useFlat);
    if (chords.some((c) => c.display === dom.display)) continue;
    const next = chords.slice();
    next[i - 1] = dom;
    out.push({
      chords: next,
      changedIndices: [i - 1],
      label: `V7/${target.display} at chord ${i}`,
    });
  }
  return out;
}

// ----- Step-between: passing diminished -----
function stepBetweenSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  durations: number[] | undefined,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  suggestedDurations: number[];
  label: string;
}> {
  const candidates: Array<{ gap: number; index: number }> = [];
  for (let i = 0; i < chords.length - 1; i++) {
    const ra = rootToPc(chords[i].root);
    const rb = rootToPc(chords[i + 1].root);
    if (ra === rb) continue;
    const gap = Math.min((rb - ra + 12) % 12, (ra - rb + 12) % 12);
    if (gap < 2) continue;
    candidates.push({ gap, index: i });
  }
  candidates.sort((a, b) => b.gap - a.gap);
  const picks = candidates.slice(0, 2);
  const useFlat = useFlatFor(keyRoot);
  const out: Array<{
    chords: ChordSymbol[];
    changedIndices: number[];
    suggestedDurations: number[];
    label: string;
  }> = [];
  for (const { index } of picks) {
    const passingPc = (rootToPc(chords[index + 1].root) - 1 + 12) % 12;
    const passing = buildChord(passingPc, "dim7", useFlat);
    const next = [...chords.slice(0, index + 1), passing, ...chords.slice(index + 1)];
    const dur = durations?.[index] ?? 4;
    const newDurations = (durations ?? chords.map(() => 4)).slice();
    newDurations.splice(index, 1, dur / 2, dur / 2);
    out.push({
      chords: next,
      changedIndices: [index + 1],
      suggestedDurations: newDurations,
      label: `${passing.display} between ${chords[index].display} and ${chords[index + 1].display}`,
    });
  }
  return out;
}

// ----- Hypnotic drone: pedal bass -----
function hypnoticDroneSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const useFlat = useFlatFor(keyRoot);
  const keyPc = rootToPc(keyRoot);
  const tonicName = pcToName(keyPc, useFlat);
  const dominantName = pcToName((keyPc + 7) % 12, useFlat);
  const tonicPedal = chords.map((c) => withBass(c, tonicName));
  const dominantPedal = chords.map((c) => withBass(c, dominantName));
  const changed = chords.map((_, i) => i);
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  if (!chordsEqual(tonicPedal, chords)) {
    out.push({ chords: tonicPedal, changedIndices: changed, label: `Tonic pedal (${tonicName} bass)` });
  }
  if (!chordsEqual(dominantPedal, chords)) {
    out.push({ chords: dominantPedal, changedIndices: changed, label: `Dominant pedal (${dominantName} bass)` });
  }
  return out;
}

// ----- Amplify -----
function amplifySuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  const analysis = analyzeProgression(chords, keyRoot, mode);
  const allDiatonic = analysis.chords.every((a) => !a.isBorrowed && !a.isChromatic);
  if (allDiatonic) {
    // Add 7th extensions to triads
    const next = chords.map((c) => {
      if (c.quality === "maj") return { ...c, quality: "maj7" as Quality, display: c.root + "maj7" };
      if (c.quality === "min") return { ...c, quality: "min7" as Quality, display: c.root + "m7" };
      return c;
    });
    if (!chordsEqual(next, chords)) {
      out.push({ chords: next, changedIndices: diffIndices(chords, next), label: "Add 7th extensions" });
    }
  }
  return out;
}

// ----- Break the pattern -----
function breakPatternSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  const useFlat = useFlatFor(keyRoot);
  const keyPc = rootToPc(keyRoot);
  const analysis = analyzeProgression(chords, keyRoot, mode);
  const allDiatonic = analysis.chords.every((a) => !a.isBorrowed && !a.isChromatic);
  if (allDiatonic && chords.length >= 2) {
    // Inject a ♭II at position 1
    const next = chords.slice();
    next[Math.min(1, next.length - 1)] = buildChord((keyPc + 1) % 12, "maj", useFlat);
    if (!chordsEqual(next, chords)) {
      out.push({
        chords: next,
        changedIndices: diffIndices(chords, next),
        label: `Inject ${next[Math.min(1, next.length - 1)].display} (♭II)`,
      });
    }
  }
  return out;
}

const CATEGORY_META: Record<SpiceCategory, { emoji: string; emotive: string; theory: string; description: string }> = {
  cinematic: {
    emoji: "🎬",
    emotive: "Dramatic shift",
    theory: "Chromatic mediant",
    description: "Slides to a chord a third away that's outside the key — opens a cinematic door.",
  },
  espionage: {
    emoji: "🕵️",
    emotive: "Inner voice walk",
    theory: "Line cliché",
    description: "Holds the root while an inner voice steps chromatically — that classic spy-movie tension.",
  },
  cosmic_drift: {
    emoji: "🌌",
    emotive: "Bittersweet color",
    theory: "Modal interchange",
    description: "Borrows a chord from the parallel key — instantly nostalgic.",
  },
  gateway: {
    emoji: "✨",
    emotive: "Tension gateway",
    theory: "Secondary dominant",
    description: "Inserts the V7 of the next chord — pulls the ear strongly forward.",
  },
  step_between: {
    emoji: "🛤️",
    emotive: "Smooth bridge",
    theory: "Passing diminished",
    description: "Slips a half-step diminished chord between two roots that are far apart.",
  },
  hypnotic_drone: {
    emoji: "🧘",
    emotive: "Anchored drone",
    theory: "Pedal tone",
    description: "Locks the bass to a single note while the upper chords drift.",
  },
  amplify: {
    emoji: "🔥",
    emotive: "Amplify",
    theory: "Intensify",
    description: "Doubles down on what's already working in the progression.",
  },
  break_pattern: {
    emoji: "💥",
    emotive: "Break the pattern",
    theory: "Disrupt",
    description: "Cuts against the grain of the current progression to wake up the ear.",
  },
};

function makeSuggestion(
  category: SpiceCategory,
  idx: number,
  chords: ChordSymbol[],
  originalCount: number,
  changedIndices: number[],
  suggestedDurations: number[] | null,
  customLabel?: string,
): Omit<SpiceSuggestion, "frictionDelta"> {
  const meta = CATEGORY_META[category];
  return {
    id: `${category}-${idx}`,
    category,
    emotiveLabel: meta.emotive,
    theoryLabel: customLabel ?? meta.theory,
    description: meta.description,
    chords,
    changedIndices,
    countChanged: chords.length !== originalCount,
    suggestedDurations,
  };
}

export function generateSpiceSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
  scope: "whole_chain" | { chordIndex: number },
  durations?: number[],
): SpiceSuggestion[] {
  if (chords.length === 0) return [];
  const baseAnalysis = analyzeProgression(chords, keyRoot, mode);
  const baseFriction = baseAnalysis.averageFriction;
  const focusedIndex = typeof scope === "object" ? scope.chordIndex : -1;

  let raw: Array<Omit<SpiceSuggestion, "frictionDelta">> = [];

  const cap = <T>(xs: T[], n: number): T[] => xs.slice(0, n);

  // Cinematic
  cap(cinematicSuggestions(chords, keyRoot, mode), 2)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      raw.push(makeSuggestion("cinematic", i, s.chords, chords.length, s.changedIndices, null, s.label));
    });

  // Espionage
  cap(espionageSuggestions(chords, durations), 2)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      raw.push(makeSuggestion("espionage", i, s.chords, chords.length, s.changedIndices, s.suggestedDurations, s.label));
    });

  // Cosmic drift
  cap(cosmicDriftSuggestions(chords, keyRoot, mode), 2)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      raw.push(makeSuggestion("cosmic_drift", i, s.chords, chords.length, s.changedIndices, null, s.label));
    });

  // Gateway
  cap(gatewaySuggestions(chords, keyRoot), 2)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      raw.push(makeSuggestion("gateway", i, s.chords, chords.length, s.changedIndices, null, s.label));
    });

  // Step between
  if (focusedIndex < 0) {
    cap(stepBetweenSuggestions(chords, keyRoot, durations), 2)
      .forEach((s, i) => {
        raw.push(makeSuggestion("step_between", i, s.chords, chords.length, s.changedIndices, s.suggestedDurations, s.label));
      });
  }

  // Hypnotic drone
  if (focusedIndex < 0) {
    cap(hypnoticDroneSuggestions(chords, keyRoot), 2)
      .forEach((s, i) => {
        raw.push(makeSuggestion("hypnotic_drone", i, s.chords, chords.length, s.changedIndices, null, s.label));
      });
  }

  // Amplify
  if (focusedIndex < 0) {
    cap(amplifySuggestions(chords, keyRoot, mode), 1)
      .forEach((s, i) => {
        raw.push(makeSuggestion("amplify", i, s.chords, chords.length, s.changedIndices, null, s.label));
      });
  }

  // Break pattern
  if (focusedIndex < 0) {
    cap(breakPatternSuggestions(chords, keyRoot, mode), 1)
      .forEach((s, i) => {
        raw.push(makeSuggestion("break_pattern", i, s.chords, chords.length, s.changedIndices, null, s.label));
      });
  }

  // Deduplicate by chord-display sequence
  const seen = new Set<string>();
  const deduped = raw.filter((s) => {
    const key = s.chords.map((c) => c.display).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.map((s) => {
    const a = analyzeProgression(s.chords, keyRoot, mode);
    return { ...s, frictionDelta: a.averageFriction - baseFriction };
  });
}
