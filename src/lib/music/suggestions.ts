// Rule-based chord progression variation generator.
// Produces up to 4 reharmonizations that preserve the source chord count and
// length structure (only chord identities change). Purely deterministic and
// offline — no AI, no network calls.

import {
  ChordSymbol, Mode, Quality, rootToPc, pcToName,
} from "./chords";
import { analyzeChord } from "./analyzeChord";

export interface ProgressionSuggestion {
  label: string;
  chords: ChordSymbol[];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_DEGREE_QUALITY: Quality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_DEGREE_QUALITY: Quality[] = ["min", "dim", "maj", "min", "min", "maj", "maj"];

const QUALITY_PRETTY: Record<Quality, string> = {
  maj: "", min: "m", dim: "dim", aug: "aug", sus2: "sus2", sus4: "sus4",
  maj7: "maj7", min7: "m7", "7": "7", dim7: "dim7", m7b5: "m7b5", minMaj7: "mMaj7",
  maj9: "maj9", min9: "m9", "9": "9", "6": "6", min6: "m6", add9: "add9",
  "5": "5", "7alt": "7alt", "7#5": "7#5", "7b9": "7b9", "7#9": "7#9",
  maj11: "maj11", maj13: "maj13", min11: "m11", min13: "m13",
  add11: "add11", "6/9": "6/9",
};

function buildChord(rootPc: number, quality: Quality, useFlat: boolean): ChordSymbol {
  const root = pcToName(rootPc, useFlat);
  return { root, quality, display: root + QUALITY_PRETTY[quality] };
}

type QualityFamily = "maj" | "min" | "dom";

const FAMILY_MEMBERS: Record<QualityFamily, Quality[]> = {
  maj: ["maj", "maj7", "maj9", "maj11", "maj13", "6", "6/9", "add9", "add11"],
  min: ["min", "min7", "min9", "min11", "min13", "min6", "minMaj7"],
  dom: ["7", "9", "7alt", "7#5", "7b9", "7#9"],
};

const FAMILY_BASE: Record<QualityFamily, Quality> = {
  maj: "maj",
  min: "min",
  dom: "7",
};

function buildChordLike(
  rootPc: number,
  sourceQuality: Quality,
  targetFamily: QualityFamily,
  useFlat: boolean,
): ChordSymbol {
  const quality = FAMILY_MEMBERS[targetFamily].includes(sourceQuality)
    ? sourceQuality
    : FAMILY_BASE[targetFamily];
  return buildChord(rootPc, quality, useFlat);
}

function diatonicAt(degree: number, keyRoot: string, mode: Mode, useFlat: boolean): ChordSymbol {
  const scale = mode === "maj" ? MAJOR_SCALE : MINOR_SCALE;
  const qualities = mode === "maj" ? MAJOR_DEGREE_QUALITY : MINOR_DEGREE_QUALITY;
  const keyPc = rootToPc(keyRoot);
  const idx = ((degree % 7) + 7) % 7;
  const pc = (keyPc + scale[idx]) % 12;
  return buildChord(pc, qualities[idx], useFlat);
}

/** Convert a chord to its relative (maj↔min), preserving extended quality when family-compatible. */
function relativeSwap(c: ChordSymbol, useFlat: boolean): ChordSymbol | null {
  if (FAMILY_MEMBERS.maj.includes(c.quality)) {
    const pc = (rootToPc(c.root) + 9) % 12;
    return buildChordLike(pc, c.quality, "min", useFlat);
  }
  if (FAMILY_MEMBERS.min.includes(c.quality)) {
    const pc = (rootToPc(c.root) + 3) % 12;
    return buildChordLike(pc, c.quality, "maj", useFlat);
  }
  return null;
}

/** Tritone substitution: bII7 of the dominant. */
function tritoneSub(c: ChordSymbol, useFlat: boolean): ChordSymbol {
  const pc = (rootToPc(c.root) + 6) % 12;
  return buildChordLike(pc, c.quality, "dom", useFlat);
}


/** Secondary dominant: V7 of the next chord (perfect-fifth-up to next root). */
export function secondaryDominantOf(next: ChordSymbol, useFlat: boolean): ChordSymbol {
  const pc = (rootToPc(next.root) + 7) % 12;
  return buildChord(pc, "7", useFlat);
}

function chordsEqual(a: ChordSymbol[], b: ChordSymbol[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.display === b[i].display);
}

/**
 * Generate up to 4 deterministic variations of a chord progression. Each
 * variation has the same number of chords as the input (1:1 swap, lengths
 * preserved by the caller).
 */
export function generateProgressionSuggestions(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): ProgressionSuggestion[] {
  if (chords.length < 2) return [];
  const useFlat = keyRoot.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(keyRoot);
  const out: ProgressionSuggestion[] = [];
  const pushUnique = (s: ProgressionSuggestion) => {
    if (s.chords.length !== chords.length) return;
    if (chordsEqual(s.chords, chords)) return;
    if (out.some((x) => chordsEqual(x.chords, s.chords))) return;
    out.push(s);
  };

  // 1. Relative swap of every triad.
  const rel = chords.map((c) => relativeSwap(c, useFlat) ?? c);
  if (rel.some((c, i) => c.display !== chords[i].display)) {
    pushUnique({ label: "Relative major/minor swap", chords: rel });
  }

  // 2. Replace IV with ii (or ii with IV) where it appears.
  const iv2ii = chords.map((c) => {
    const deg = analyzeChord(c, keyRoot, mode).degreeIndex;
    if (deg === 3) return diatonicAt(1, keyRoot, mode, useFlat); // IV → ii
    if (deg === 1) return diatonicAt(3, keyRoot, mode, useFlat); // ii → IV
    return c;
  });
  if (iv2ii.some((c, i) => c.display !== chords[i].display)) {
    pushUnique({ label: "IV ↔ ii substitution", chords: iv2ii });
  }

  // 3. Tritone sub on dominants (or convert V triad → V7 → tritone sub).
  const tritone = chords.map((c) => {
    const a = analyzeChord(c, keyRoot, mode);
    const isDom = FAMILY_MEMBERS.dom.includes(c.quality);
    if (a.function === "dominant" || isDom) {
      const dom: ChordSymbol = isDom
        ? c
        : { ...c, quality: "7", display: c.root + QUALITY_PRETTY["7"] };
      return tritoneSub(dom, useFlat);
    }
    return c;
  });
  if (tritone.some((c, i) => c.display !== chords[i].display)) {
    pushUnique({ label: "Tritone sub on the dominant", chords: tritone });
  }

  // 4. Secondary dominants: replace each non-first chord with V7/that chord.
  if (chords.length >= 2) {
    const secondary2 = chords.slice();
    let changed = false;
    for (let i = 1; i < chords.length; i++) {
      const prev = chords[i - 1];
      const cur = chords[i];
      const isFifthDown = ((rootToPc(prev.root) - rootToPc(cur.root) + 12) % 12) === 7;
      if (!isFifthDown) {
        secondary2[i - 1] = secondaryDominantOf(cur, useFlat);
        changed = true;
      }
    }
    if (changed) pushUnique({ label: "Add secondary dominants", chords: secondary2 });
  }

  // 5. Deceptive cadence: V → I becomes V → vi.
  const deceptive = chords.slice();
  let deceptiveChanged = false;
  for (let i = 0; i < chords.length - 1; i++) {
    const a = analyzeChord(chords[i], keyRoot, mode);
    const b = analyzeChord(chords[i + 1], keyRoot, mode);
    if (a.function === "dominant" && b.degreeIndex === 0) {
      deceptive[i + 1] = diatonicAt(5, keyRoot, mode, useFlat);
      deceptiveChanged = true;
    }
  }
  if (deceptiveChanged) pushUnique({ label: "Deceptive cadence (V → vi)", chords: deceptive });

  // 6. Modal interchange: borrow bVI / bVII from parallel minor in major keys.
  if (mode === "maj") {
    const borrowed = chords.map((c) => {
      const deg = analyzeChord(c, keyRoot, mode).degreeIndex;
      if (deg === 5) {
        // vi → bVI (major)
        const pc = (rootToPc(keyRoot) + 8) % 12;
        return buildChord(pc, "maj", useFlat);
      }
      if (deg === 6) {
        // vii° → bVII
        const pc = (rootToPc(keyRoot) + 10) % 12;
        return buildChord(pc, "maj", useFlat);
      }
      return c;
    });
    if (borrowed.some((c, i) => c.display !== chords[i].display)) {
      pushUnique({ label: "Borrow bVI / bVII (modal interchange)", chords: borrowed });
    }
  }

  return out.slice(0, 4);
}

/**
 * Suggest 4–6 chords that pair naturally with the given chord in the key.
 * Preserves the input chord's quality family (e.g. Cm7 → other m7 suggestions).
 */
export function getChordProgressionSuggestions(
  chord: ChordSymbol,
  keyRoot: string,
  mode: Mode,
): ChordSymbol[] {
  const useFlat = keyRoot.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(keyRoot);
  const deg = analyzeChord(chord, keyRoot, mode).degreeIndex;

  const SUCCESSORS: Record<number, number[]> = {
    0: [3, 4, 5, 1],
    1: [4, 3, 0, 6],
    2: [5, 3, 0, 4],
    3: [0, 4, 1, 6],
    4: [0, 5, 3, 1],
    5: [3, 1, 4, 0],
    6: [0, 4, 5, 3],
  };

  const familyFor = (q: Quality): QualityFamily | null => {
    if (FAMILY_MEMBERS.maj.includes(q)) return "maj";
    if (FAMILY_MEMBERS.min.includes(q)) return "min";
    if (FAMILY_MEMBERS.dom.includes(q)) return "dom";
    return null;
  };

  const inheritOrBase = (base: ChordSymbol): ChordSymbol => {
    const fam = familyFor(base.quality);
    if (fam && FAMILY_MEMBERS[fam].includes(chord.quality)) {
      return buildChordLike(rootToPc(base.root), chord.quality, fam, useFlat);
    }
    return base;
  };

  const out: ChordSymbol[] = [];
  const seen = new Set<string>([chord.display]);
  const push = (c: ChordSymbol) => {
    if (seen.has(c.display)) return;
    seen.add(c.display);
    out.push(c);
  };

  if (deg >= 0) {
    for (const d of SUCCESSORS[deg] ?? []) {
      push(inheritOrBase(diatonicAt(d, keyRoot, mode, useFlat)));
    }
  } else {
    const isDom = FAMILY_MEMBERS.dom.includes(chord.quality);
    const domSource: ChordSymbol = isDom
      ? chord
      : { ...chord, quality: "7", display: chord.root + QUALITY_PRETTY["7"] };
    push(tritoneSub(domSource, useFlat));
    push(secondaryDominantOf(chord, useFlat));
    const rootPc = rootToPc(chord.root);
    const scale = mode === "maj" ? MAJOR_SCALE : MINOR_SCALE;
    const keyPc = rootToPc(keyRoot);
    const ranked = [0, 1, 2, 3, 4, 5, 6]
      .map((d) => {
        const pc = (keyPc + scale[d]) % 12;
        const dist = Math.min((pc - rootPc + 12) % 12, (rootPc - pc + 12) % 12);
        return { d, dist };
      })
      .sort((a, b) => a.dist - b.dist);
    for (const { d } of ranked) {
      if (out.length >= 6) break;
      push(inheritOrBase(diatonicAt(d, keyRoot, mode, useFlat)));
    }
  }

  return out.slice(0, 6);
}

/**
 * Build a Google search URL for "similar chord progression" fallback when
 * the rule-based generator finds no variations.
 */
export function buildGoogleSearchUrl(
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
): string {
  const chordPart = chords.map((c) => c.display).join("+");
  const modeWord = mode === "maj" ? "major" : "minor";
  const q = `chord+progression+similar+to+${chordPart}+in+key+of+${keyRoot}+${modeWord}`;
  return `https://www.google.com/search?q=${q}`;
}
