import {
  ChordSymbol, Mode, Quality, QUALITY_PRETTY, rootToPc, pcToName, isMinorMode,
} from "./chords";
import { analyzeProgression } from "./harmony";
import {
  MODE_CHARACTER, ADVANCED_SCALE_DEFS, getQualityAtDegree, getNumeralAtDegree,
  modeDisplayName, type AnyMode,
} from "./modes";


export type SpiceCategory =
  | "cinematic"
  | "espionage"
  | "cosmic_drift"
  | "gateway"
  | "step_between"
  | "hypnotic_drone"
  | "amplify"
  | "break_pattern"
  | "borrowed_colour"
  | "sus_resolution"
  | "line_cliche"
  | "extension_colour"
  | "altered_dominant"
  | "passing_augmented"
  | "power_riff";

export const CATEGORY_SECTION: Record<SpiceCategory, "texture" | "specialist"> = {
  sus_resolution: "texture",
  line_cliche: "texture",
  extension_colour: "texture",
  cinematic: "specialist",
  espionage: "specialist",
  cosmic_drift: "specialist",
  gateway: "specialist",
  step_between: "specialist",
  hypnotic_drone: "specialist",
  amplify: "specialist",
  break_pattern: "specialist",
  borrowed_colour: "specialist",
  altered_dominant: "specialist",
  passing_augmented: "specialist",
  power_riff: "specialist",
};


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
    if (!a.isInScale) continue;
    if (a.isBorrowed) continue;
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
    if (!a.isInScale) continue;
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
  const allDiatonic = analysis.chords.every((a) => a.isDiatonic);
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
  const allDiatonic = analysis.chords.every((a) => a.isDiatonic);
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

// ----- Borrowed colour: modal interchange from any parallel mode -----
function borrowedColourSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  emotiveLabel: string;
  theoryLabel: string;
}> {
  const out: Array<{
    chords: ChordSymbol[];
    changedIndices: number[];
    emotiveLabel: string;
    theoryLabel: string;
  }> = [];
  const useFlat = useFlatFor(keyRoot);
  const keyPc = rootToPc(keyRoot);
  const existingDisplays = new Set(chords.map((c) => c.display));
  const candidateModes = (Object.keys(MODE_CHARACTER) as AnyMode[]).filter(
    (m) => m !== (mode as AnyMode),
  );

  for (let i = 0; i < chords.length; i++) {
    const src = chords[i];
    const degree = (rootToPc(src.root) - keyPc + 12) % 12;
    const currentQuality: Quality = isMajorish(src.quality)
      ? "maj"
      : isMinorish(src.quality)
        ? "min"
        : isDimish(src.quality)
          ? "dim"
          : src.quality;

    for (const candMode of candidateModes) {
      const q = getQualityAtDegree(candMode, degree);
      if (!q) continue;
      if (q === currentQuality) continue;
      const swapped = buildChord(rootToPc(src.root), q, useFlat);
      if (swapped.display === src.display) continue;
      if (existingDisplays.has(swapped.display)) continue;

      const char = MODE_CHARACTER[candMode];
      const numeral = getNumeralAtDegree(candMode, degree) ?? "?";
      const isExotic = candMode in ADVANCED_SCALE_DEFS;
      const moodWord = char.mood.split(",")[0].trim();
      const emotive = `${char.borrowLabel} — ${moodWord.toLowerCase()}`;
      const theoryBase = `Borrowed ${numeral} from ${modeDisplayName(candMode)}`;
      const theory = isExotic ? `Exotic: ${theoryBase}` : theoryBase;

      const next = chords.slice();
      next[i] = swapped;
      out.push({
        chords: next,
        changedIndices: [i],
        emotiveLabel: emotive,
        theoryLabel: theory,
      });
    }
  }
  return out;
}


// ----- Sus resolution: sus4/sus2 delays before tonic/dominant -----
function susResolutionSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
  durations: number[] | undefined,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  suggestedDurations: number[];
  emotiveLabel: string;
  theoryLabel: string;
  label: string;
}> {
  const out: Array<{
    chords: ChordSymbol[];
    changedIndices: number[];
    suggestedDurations: number[];
    emotiveLabel: string;
    theoryLabel: string;
    label: string;
  }> = [];
  const analysis = analyzeProgression(chords, keyRoot, mode);
  if (analysis.chords.some((a) => a.isSuspended)) return out;

  let sus4Made = false;
  let sus2Made = false;
  for (let i = 0; i < chords.length; i++) {
    const a = analysis.chords[i];
    const src = chords[i];
    const dur = durations?.[i] ?? 4;
    if (dur < 2) continue;
    const isTonicOrDominant = a.function === "tonic" || a.function === "dominant";
    if (!isTonicOrDominant) continue;

    if (!sus4Made) {
      const sus: ChordSymbol = { root: src.root, quality: "sus4", display: src.root + "sus4" };
      const next = [...chords.slice(0, i), sus, ...chords.slice(i)];
      const newDurations = (durations ?? chords.map(() => 4)).slice();
      newDurations.splice(i, 1, dur / 2, dur / 2);
      out.push({
        chords: next,
        changedIndices: [i],
        suggestedDurations: newDurations,
        emotiveLabel: "Suspended moment",
        theoryLabel: "SUS DELAY → RESOLUTION",
        label: `${sus.display} → ${src.display}`,
      });
      sus4Made = true;
    }

    if (!sus2Made && a.isDiatonic && a.chordFamily === "major") {
      const sus: ChordSymbol = { root: src.root, quality: "sus2", display: src.root + "sus2" };
      const next = [...chords.slice(0, i), sus, ...chords.slice(i)];
      const newDurations = (durations ?? chords.map(() => 4)).slice();
      newDurations.splice(i, 1, dur / 2, dur / 2);
      out.push({
        chords: next,
        changedIndices: [i],
        suggestedDurations: newDurations,
        emotiveLabel: "Suspended moment",
        theoryLabel: "SUS DELAY → RESOLUTION",
        label: `${sus.display} → ${src.display}`,
      });
      sus2Made = true;
    }
    if (sus4Made && sus2Made) break;
  }

  // Coldplay stack: 4+ diatonic major chords → sus2 at 0, sus4 at 2
  const diatonicMajorCount = analysis.chords.filter(
    (a) => a.isDiatonic && a.chordFamily === "major",
  ).length;
  if (diatonicMajorCount >= 4) {
    const next = chords.slice();
    if (analysis.chords[0]?.chordFamily === "major") {
      next[0] = { root: chords[0].root, quality: "sus2", display: chords[0].root + "sus2" };
    }
    if (analysis.chords[2]?.chordFamily === "major") {
      next[2] = { root: chords[2].root, quality: "sus4", display: chords[2].root + "sus4" };
    }
    if (next.some((c, i) => c.display !== chords[i].display)) {
      out.push({
        chords: next,
        changedIndices: diffIndices(chords, next),
        suggestedDurations: (durations ?? chords.map(() => 4)).slice(),
        emotiveLabel: "Open, ringing",
        theoryLabel: "SUS STACK",
        label: "Coldplay sus stack",
      });
    }
  }

  return out;
}

// ----- Line cliché: descending/ascending inner voice -----
function lineClicheSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
  durations: number[] | undefined,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  suggestedDurations: number[];
  emotiveLabel: string;
  theoryLabel: string;
  label: string;
}> {
  const analysis = analyzeProgression(chords, keyRoot, mode);
  let bestIdx = -1;
  let bestBeats = -1;
  for (let i = 0; i < chords.length; i++) {
    const dur = durations?.[i] ?? 4;
    const q = chords[i].quality;
    if (dur < 4) continue;
    if (q !== "maj" && q !== "min") continue;
    if (dur > bestBeats) { bestBeats = dur; bestIdx = i; }
  }
  if (bestIdx < 0) return [];

  const src = chords[bestIdx];
  const a = analysis.chords[bestIdx];
  const dur = durations?.[bestIdx] ?? 4;

  let cliche: ChordSymbol[];
  let emotive: string;
  let theory: string;
  if (src.quality === "min") {
    cliche = [
      { root: src.root, quality: "min", display: src.root + "m" },
      { root: src.root, quality: "minMaj7", display: src.root + "mMaj7" },
      { root: src.root, quality: "min7", display: src.root + "m7" },
      { root: src.root, quality: "min6", display: src.root + "m6" },
    ];
    emotive = "Aching descent";
    theory = "LINE CLICHÉ — i → imaj7 → i7 → i6";
  } else if (a.degreeIndex === 0) {
    cliche = [
      { root: src.root, quality: "maj", display: src.root },
      { root: src.root, quality: "aug", display: src.root + "aug" },
      { root: src.root, quality: "6", display: src.root + "6" },
      { root: src.root, quality: "maj", display: src.root },
    ];
    emotive = "Rising shimmer";
    theory = "LINE CLICHÉ — I → I+ → I6 → I";
  } else {
    cliche = [
      { root: src.root, quality: "maj", display: src.root },
      { root: src.root, quality: "maj7", display: src.root + "maj7" },
      { root: src.root, quality: "7", display: src.root + "7" },
      { root: src.root, quality: "6", display: src.root + "6" },
    ];
    emotive = "Gentle descent";
    theory = "LINE CLICHÉ — I → Imaj7 → I7 → I6";
  }

  const next = [...chords.slice(0, bestIdx), ...cliche, ...chords.slice(bestIdx + 1)];
  const each = dur / cliche.length;
  const newDurations = (durations ?? chords.map(() => 4)).slice();
  newDurations.splice(bestIdx, 1, each, each, each, each);
  return [{
    chords: next,
    changedIndices: [bestIdx, bestIdx + 1, bestIdx + 2, bestIdx + 3],
    suggestedDurations: newDurations,
    emotiveLabel: emotive,
    theoryLabel: theory,
    label: `Line cliché on ${src.display}`,
  }];
}

// ----- Extension colour: step ladder ±1 -----
const EXT_LADDERS: Record<"maj" | "min" | "dom", Quality[]> = {
  maj: ["maj", "maj7", "maj9", "maj13", "6/9"],
  min: ["min", "min7", "min9", "min11", "min13"],
  dom: ["7", "9"],
};

function extensionColourSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> {
  const out: Array<{ chords: ChordSymbol[]; changedIndices: number[]; label: string }> = [];
  const analysis = analyzeProgression(chords, keyRoot, mode);
  const existingQualities = new Set(chords.map((c) => c.quality));

  for (let i = 0; i < chords.length; i++) {
    const src = chords[i];
    const a = analysis.chords[i];
    let ladder: Quality[] | null = null;
    if (a.chordFamily === "major") ladder = EXT_LADDERS.maj;
    else if (a.chordFamily === "minor") ladder = EXT_LADDERS.min;
    else if (a.chordFamily === "dominant") ladder = EXT_LADDERS.dom;
    if (!ladder) continue;

    const pos = ladder.indexOf(src.quality);
    const candidates: Quality[] = [];
    if (pos < 0) {
      // Plain triad at index 0 — use primaryGenre suggestion
      const g = a.primaryGenre;
      if (g === "neo_soul" || g === "rnb") candidates.push(a.chordFamily === "minor" ? "min7" : "maj9");
      else if (g === "jazz") candidates.push(a.chordFamily === "minor" ? "min7" : "maj7");
      else candidates.push("add9");
    } else {
      if (pos + 1 < ladder.length) candidates.push(ladder[pos + 1]);
      if (pos - 1 >= 0) candidates.push(ladder[pos - 1]);
    }

    for (const q of candidates) {
      if (existingQualities.has(q)) continue;
      if (q === src.quality) continue;
      const next = chords.slice();
      next[i] = { root: src.root, quality: q, display: src.root + QUALITY_PRETTY[q] };
      const adj = a.primaryGenre === "neo_soul" ? "neo soul warmth"
        : a.primaryGenre === "jazz" ? "jazz colour"
        : a.primaryGenre === "gospel" ? "gospel warmth"
        : a.primaryGenre === "rnb" ? "R&B smoothness"
        : "richer texture";
      out.push({
        chords: next,
        changedIndices: [i],
        label: `${src.display} → ${next[i].display} — adds ${adj}`,
      });
    }
  }
  return out;
}

// ----- Altered dominant -----
function alteredDominantSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  emotiveLabel: string;
  theoryLabel: string;
}> {
  const out: Array<{
    chords: ChordSymbol[];
    changedIndices: number[];
    emotiveLabel: string;
    theoryLabel: string;
  }> = [];
  const analysis = analyzeProgression(chords, keyRoot, mode);
  const ALTS: Array<{ q: Quality; emotive: string; theory: string }> = [
    { q: "7b9", emotive: "Dark pull",       theory: "V7♭9 — Spanish/jazz tension" },
    { q: "7#9", emotive: "Grinding edge",   theory: "V7♯9 — The Hendrix chord" },
    { q: "7#5", emotive: "Upward shimmer",  theory: "V7♯5 — Augmented dominant" },
  ];

  for (let i = 0; i < chords.length; i++) {
    const src = chords[i];
    const a = analysis.chords[i];
    if (a.isAltered) continue;
    const isEligible = (a.function === "dominant" || a.degreeIndex === 4)
      && (src.quality === "maj" || src.quality === "7" || src.quality === "9");
    if (!isEligible) continue;
    for (const alt of ALTS) {
      const next = chords.slice();
      next[i] = { root: src.root, quality: alt.q, display: src.root + QUALITY_PRETTY[alt.q] };
      out.push({
        chords: next,
        changedIndices: [i],
        emotiveLabel: alt.emotive,
        theoryLabel: alt.theory,
      });
    }
  }
  return out;
}

// ----- Passing augmented: insert I+ between I and IV/vi -----
function passingAugmentedSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
  durations: number[] | undefined,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  suggestedDurations: number[];
  label: string;
}> {
  const analysis = analyzeProgression(chords, keyRoot, mode);
  for (let i = 0; i < chords.length - 1; i++) {
    const aSrc = analysis.chords[i];
    if (aSrc.chordFamily !== "major") continue;
    if (chords[i].quality === "aug") continue;
    if (chords[i + 1].quality === "aug") continue;
    const delta = (rootToPc(chords[i + 1].root) - rootToPc(chords[i].root) + 12) % 12;
    if (delta !== 5 && delta !== 9) continue;
    const aug: ChordSymbol = { root: chords[i].root, quality: "aug", display: chords[i].root + "aug" };
    const next = [...chords.slice(0, i + 1), aug, ...chords.slice(i + 1)];
    const dur = durations?.[i] ?? 4;
    const newDurations = (durations ?? chords.map(() => 4)).slice();
    newDurations.splice(i, 1, dur / 2, dur / 2);
    return [{
      chords: next,
      changedIndices: [i + 1],
      suggestedDurations: newDurations,
      label: `${aug.display} bridging ${chords[i].display} to ${chords[i + 1].display} — chromatic lift in the fifth`,
    }];
  }
  return [];
}

// ----- Power riff: strip thirds OR I-bVII-IV power run -----
function powerRiffSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): Array<{
  chords: ChordSymbol[];
  changedIndices: number[];
  emotiveLabel: string;
  theoryLabel: string;
  label: string;
}> {
  const out: Array<{
    chords: ChordSymbol[];
    changedIndices: number[];
    emotiveLabel: string;
    theoryLabel: string;
    label: string;
  }> = [];

  // Variant A: strip all thirds (only maj/min keys)
  if (mode === "maj" || mode === "min") {
    const allFive = chords.every((c) => c.quality === "5");
    if (!allFive) {
      const next = chords.map((c) => ({ root: c.root, quality: "5" as Quality, display: c.root + "5" }));
      out.push({
        chords: next,
        changedIndices: diffIndices(chords, next),
        emotiveLabel: "Strip to power chords",
        theoryLabel: "REMOVE ALL THIRDS",
        label: "All power chords",
      });
    }
  }

  // Variant B: I5-bVII5-IV5-I5 (major key only)
  if (mode === "maj") {
    const useFlat = useFlatFor(keyRoot);
    const keyPc = rootToPc(keyRoot);
    const i5  = { root: pcToName(keyPc, useFlat),               quality: "5" as Quality, display: pcToName(keyPc, useFlat) + "5" };
    const b7  = { root: pcToName((keyPc + 10) % 12, useFlat),   quality: "5" as Quality, display: pcToName((keyPc + 10) % 12, useFlat) + "5" };
    const iv5 = { root: pcToName((keyPc + 5) % 12, useFlat),    quality: "5" as Quality, display: pcToName((keyPc + 5) % 12, useFlat) + "5" };
    const next = [i5, b7, iv5, i5];
    if (!chordsEqual(next, chords)) {
      out.push({
        chords: next,
        changedIndices: next.map((_, i) => i),
        emotiveLabel: "Rock anthem",
        theoryLabel: "I-♭VII-IV POWER RUN",
        label: "Classic power riff",
      });
    }
  }

  return out;
}

const CATEGORY_META: Record<SpiceCategory, { emoji: string; emotive: string; theory: string; description: string }> = {
  cinematic: {
    emoji: "🎬",
    emotive: "Dramatic",
    theory: "Chromatic mediant",
    description: "Slides to a chord a third away that's outside the key — opens a cinematic door.",
  },
  espionage: {
    emoji: "🕵️",
    emotive: "Descending",
    theory: "Line cliché",
    description: "Holds the root while an inner voice steps chromatically — that classic spy-movie tension.",
  },
  cosmic_drift: {
    emoji: "🌌",
    emotive: "Bittersweet",
    theory: "Modal interchange",
    description: "Borrows a chord from the parallel key — instantly nostalgic.",
  },
  gateway: {
    emoji: "✨",
    emotive: "Tension",
    theory: "Secondary dominant",
    description: "Inserts the V7 of the next chord — pulls the ear strongly forward.",
  },
  step_between: {
    emoji: "🛤️",
    emotive: "Smooth",
    theory: "Passing diminished",
    description: "Slips a half-step diminished chord between two roots that are far apart.",
  },
  hypnotic_drone: {
    emoji: "🧘",
    emotive: "Drone",
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
    emotive: "Pattern Break",
    theory: "Disrupt",
    description: "Cuts against the grain of the current progression to wake up the ear.",
  },
  borrowed_colour: {
    emoji: "🎨",
    emotive: "Folk/Jazz",
    theory: "Modal interchange",
    description: "Swaps one chord for its shade from a parallel mode — fresh colour without leaving the key root.",
  },
  sus_resolution: {
    emoji: "🌊",
    emotive: "Suspended moment",
    theory: "SUS DELAY → RESOLUTION",
    description: "Delays a chord with a sus4 or sus2 voicing before resolving — that classic ringing release.",
  },
  line_cliche: {
    emoji: "🎻",
    emotive: "Descending inner voice",
    theory: "LINE CLICHÉ",
    description: "Expands one chord into a 4-step cliché — a single inner voice walks while the root holds.",
  },
  extension_colour: {
    emoji: "✨",
    emotive: "Richer texture",
    theory: "EXTENSION SWAP",
    description: "Walks one chord up or down the extension ladder — adds genre-appropriate colour.",
  },
  altered_dominant: {
    emoji: "⚡",
    emotive: "Maximum tension",
    theory: "ALTERED DOMINANT",
    description: "Upgrades the V chord to 7♭9, 7♯9, or 7♯5 — maximum pull into the tonic.",
  },
  passing_augmented: {
    emoji: "🔺",
    emotive: "Chromatic bridge",
    theory: "PASSING AUGMENTED",
    description: "Inserts an augmented triad as a chromatic bridge between I and IV (or I and vi).",
  },
  power_riff: {
    emoji: "🔌",
    emotive: "Raw, stripped back",
    theory: "POWER CHORD CONVERSION",
    description: "Strips every chord to a root-fifth power chord, removing the major/minor flavour.",
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

  // Sus resolution
  cap(susResolutionSuggestions(chords, keyRoot, mode, durations), 3)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      const base = makeSuggestion("sus_resolution", i, s.chords, chords.length, s.changedIndices, s.suggestedDurations, s.theoryLabel);
      raw.push({ ...base, emotiveLabel: s.emotiveLabel });
    });

  // Line cliché
  if (focusedIndex < 0) {
    cap(lineClicheSuggestions(chords, keyRoot, mode, durations), 1)
      .forEach((s, i) => {
        const base = makeSuggestion("line_cliche", i, s.chords, chords.length, s.changedIndices, s.suggestedDurations, s.theoryLabel);
        raw.push({ ...base, emotiveLabel: s.emotiveLabel });
      });
  }

  // Extension colour — rank by friction, top 3
  {
    const candidates = extensionColourSuggestions(chords, keyRoot, mode)
      .filter((s) => focusedIndex < 0 || s.changedIndices.includes(focusedIndex))
      .map((s) => {
        const a = analyzeProgression(s.chords, keyRoot, mode);
        return { s, friction: a.averageFriction - baseFriction };
      })
      .sort((a, b) => a.friction - b.friction)
      .slice(0, 3);
    candidates.forEach(({ s }, i) => {
      raw.push(makeSuggestion("extension_colour", i, s.chords, chords.length, s.changedIndices, null, s.label));
    });
  }

  // Altered dominant
  cap(alteredDominantSuggestions(chords, keyRoot, mode), 3)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      const base = makeSuggestion("altered_dominant", i, s.chords, chords.length, s.changedIndices, null, s.theoryLabel);
      raw.push({ ...base, emotiveLabel: s.emotiveLabel });
    });

  // Passing augmented
  cap(passingAugmentedSuggestions(chords, keyRoot, mode, durations), 1)
    .forEach((s, i) => {
      if (focusedIndex >= 0 && !s.changedIndices.includes(focusedIndex)) return;
      raw.push(makeSuggestion("passing_augmented", i, s.chords, chords.length, s.changedIndices, s.suggestedDurations, s.label));
    });

  // Power riff
  if (focusedIndex < 0) {
    cap(powerRiffSuggestions(chords, keyRoot, mode), 2)
      .forEach((s, i) => {
        const base = makeSuggestion("power_riff", i, s.chords, chords.length, s.changedIndices, null, s.theoryLabel);
        raw.push({ ...base, emotiveLabel: s.emotiveLabel });
      });
  }

  // Borrowed colour: rank candidates by frictionDelta, take top 3
  {
    const candidates = borrowedColourSuggestions(chords, keyRoot, mode)
      .filter((s) => focusedIndex < 0 || s.changedIndices.includes(focusedIndex))
      .map((s) => {
        const a = analyzeProgression(s.chords, keyRoot, mode);
        return { s, friction: a.averageFriction - baseFriction };
      })
      .sort((a, b) => a.friction - b.friction)
      .slice(0, 3);
    candidates.forEach(({ s }, i) => {
      const base = makeSuggestion(
        "borrowed_colour", i, s.chords, chords.length, s.changedIndices, null, s.theoryLabel,
      );
      raw.push({ ...base, emotiveLabel: s.emotiveLabel });
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
