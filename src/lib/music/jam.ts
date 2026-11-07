// Jam mode (T9 Nashville keypad) chord recipes. A step stores how a chord was
// built — degree plus the 8 / 9 / 0 modifier states — rather than the resolved
// symbol, so modifier edits stay lossless and re-resolve in any key.

import {
  ChordSymbol,
  Mode,
  Quality,
  QUALITY_PRETTY,
  nashvilleLadder,
  pcToName,
  rootToPc,
} from "./chords";

export type Accidental = -1 | 0 | 1;
export type JamType = "maj" | "min" | "dim" | "aug" | "sus4" | "sus2";
export type JamExt = 0 | 7 | 9 | 11 | 13;

export interface JamStep {
  id: string;
  degree: number;
  accidental: Accidental;
  /** null = the degree's natural (diatonic) triad type. */
  type: JamType | null;
  ext: JamExt;
}

/** Modifier state armed before a number key, as on the T9 hardware. */
export type JamPrefix = Omit<JamStep, "id" | "degree">;

export const EMPTY_PREFIX: JamPrefix = { accidental: 0, type: null, ext: 0 };

export const TYPE_CYCLE: JamType[] = ["maj", "min", "dim", "aug", "sus4", "sus2"];
export const EXT_CYCLE: JamExt[] = [0, 7, 9, 11, 13];

type SeventhKind = "maj7" | "dom" | "min7" | "minMaj7" | "m7b5" | "dim7" | "aug" | "none";

const TRIAD: Record<JamType, Quality> = {
  maj: "maj", min: "min", dim: "dim", aug: "aug", sus4: "sus4", sus2: "sus2",
};

const EXTENDED: Record<SeventhKind, Partial<Record<Exclude<JamExt, 0>, Quality>>> = {
  maj7:    { 7: "maj7", 9: "maj9", 11: "maj11", 13: "maj13" },
  dom:     { 7: "7", 9: "9", 11: "9#11", 13: "13" },
  min7:    { 7: "min7", 9: "min9", 11: "min11", 13: "min13" },
  minMaj7: { 7: "minMaj7" },
  m7b5:    { 7: "m7b5" },
  dim7:    { 7: "dim7" },
  aug:     { 7: "7#5" },
  none:    {},
};

function ladderTriadType(q: Quality): JamType {
  return q === "min" || q === "dim" || q === "aug" ? q : "maj";
}

/** Triad type a degree has before 0 is pressed. Borrowed (♭/♯) roots are major. */
export function naturalType(degree: number, accidental: Accidental, keyRoot: string, mode: Mode): JamType {
  if (accidental !== 0) return "maj";
  return ladderTriadType(nashvilleLadder(keyRoot, mode)[degree - 1].chord.quality);
}

function seventhKind(step: Omit<JamStep, "id">, keyRoot: string, mode: Mode): SeventhKind {
  const type = step.type ?? naturalType(step.degree, step.accidental, keyRoot, mode);
  if (step.type !== null || step.accidental !== 0) {
    if (type === "maj") return "dom";
    if (type === "min") return "min7";
    if (type === "dim") return "dim7";
    if (type === "aug") return "aug";
    return "none";
  }
  const ladder = nashvilleLadder(keyRoot, mode);
  if (ladder.length < 7) {
    if (type === "maj") return mode === "blues" ? "dom" : "maj7";
    if (type === "min") return "min7";
    if (type === "dim") return "m7b5";
    return "none";
  }
  const i = step.degree - 1;
  const rootPc = rootToPc(ladder[i].chord.root);
  const seventh = (rootToPc(ladder[(i + 6) % 7].chord.root) - rootPc + 12) % 12;
  if (type === "maj") return seventh === 11 ? "maj7" : "dom";
  if (type === "min") return seventh === 10 ? "min7" : "minMaj7";
  if (type === "dim") return seventh === 10 ? "m7b5" : "dim7";
  return "none";
}

/** Resolved quality, or null when the step's extension doesn't exist for its type. */
export function jamQuality(step: Omit<JamStep, "id">, keyRoot: string, mode: Mode): Quality | null {
  const type = step.type ?? naturalType(step.degree, step.accidental, keyRoot, mode);
  if (step.ext === 0) return TRIAD[type];
  return EXTENDED[seventhKind(step, keyRoot, mode)][step.ext] ?? null;
}

export function buildJamChord(step: Omit<JamStep, "id">, keyRoot: string, mode: Mode): ChordSymbol {
  const ladderRoot = nashvilleLadder(keyRoot, mode)[step.degree - 1].chord.root;
  const root = step.accidental === 0
    ? ladderRoot
    : pcToName(rootToPc(ladderRoot) + step.accidental, step.accidental < 0);
  const quality = jamQuality(step, keyRoot, mode) ?? TRIAD[step.type ?? naturalType(step.degree, step.accidental, keyRoot, mode)];
  return { root, quality, display: root + QUALITY_PRETTY[quality] };
}

/** Drops an extension that no longer exists after a type/accidental change. */
export function normalizeStep<T extends Omit<JamStep, "id">>(step: T, keyRoot: string, mode: Mode): T {
  return jamQuality(step, keyRoot, mode) ? step : { ...step, ext: 0 };
}

export function nextAccidental(a: Accidental): Accidental {
  return a === 0 ? -1 : a === -1 ? 1 : 0;
}

/** Next stop in the 0-key cycle; landing back on the natural type stores null. */
export function nextType(current: JamType | null, natural: JamType): JamType | null {
  const from = current ?? natural;
  const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(from) + 1) % TYPE_CYCLE.length];
  return next === natural ? null : next;
}

/** Next stop in the 9-key cycle, skipping extensions the chord can't take. */
export function nextExt(step: Omit<JamStep, "id">, keyRoot: string, mode: Mode): JamExt {
  let i = EXT_CYCLE.indexOf(step.ext);
  for (let n = 0; n < EXT_CYCLE.length; n++) {
    i = (i + 1) % EXT_CYCLE.length;
    const ext = EXT_CYCLE[i];
    if (ext === 0 || jamQuality({ ...step, ext }, keyRoot, mode)) return ext;
  }
  return 0;
}

export function stepFromPrefix(id: string, degree: number, prefix: JamPrefix, keyRoot: string, mode: Mode): JamStep {
  const natural = naturalType(degree, prefix.accidental, keyRoot, mode);
  const type = prefix.type === natural ? null : prefix.type;
  return normalizeStep({ id, degree, ...prefix, type }, keyRoot, mode);
}

export function recipeLabel(step: Pick<JamStep, "degree" | "accidental">): string {
  return (step.accidental === -1 ? "♭" : step.accidental === 1 ? "♯" : "") + step.degree;
}
