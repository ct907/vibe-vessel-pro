// Rule-based chord progression variation generator.
// Produces up to 4 reharmonizations that preserve the source chord count and
// length structure (only chord identities change). Purely deterministic and
// offline — no AI, no network calls.

import {
  ChordSymbol, Mode, Quality, parseChord, rootToPc, pcToName, transposeChord,
} from "./chords";

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
};

function buildChord(rootPc: number, quality: Quality, useFlat: boolean): ChordSymbol {
  const root = pcToName(rootPc, useFlat);
  return { root, quality, display: root + QUALITY_PRETTY[quality] };
}

/** Get the diatonic degree (0-6) of a chord in the given key, or -1. */
function degreeOf(chord: ChordSymbol, keyRoot: string, mode: Mode): number {
  const scale = mode === "maj" ? MAJOR_SCALE : MINOR_SCALE;
  const keyPc = rootToPc(keyRoot);
  const interval = (rootToPc(chord.root) - keyPc + 12) % 12;
  return scale.indexOf(interval);
}

function diatonicAt(degree: number, keyRoot: string, mode: Mode, useFlat: boolean): ChordSymbol {
  const scale = mode === "maj" ? MAJOR_SCALE : MINOR_SCALE;
  const qualities = mode === "maj" ? MAJOR_DEGREE_QUALITY : MINOR_DEGREE_QUALITY;
  const keyPc = rootToPc(keyRoot);
  const idx = ((degree % 7) + 7) % 7;
  const pc = (keyPc + scale[idx]) % 12;
  return buildChord(pc, qualities[idx], useFlat);
}

/** Is this a dominant-quality chord? */
function isDominant(c: ChordSymbol): boolean {
  return c.quality === "7" || c.quality === "9";
}

/** Convert a triad chord to its relative (maj↔min). vi in major or III in minor. */
function relativeSwap(c: ChordSymbol, useFlat: boolean): ChordSymbol | null {
  if (c.quality === "maj") {
    // Relative minor: down a minor 3rd, minor quality.
    const pc = (rootToPc(c.root) + 9) % 12;
    return buildChord(pc, "min", useFlat);
  }
  if (c.quality === "min") {
    // Relative major: up a minor 3rd, major quality.
    const pc = (rootToPc(c.root) + 3) % 12;
    return buildChord(pc, "maj", useFlat);
  }
  return null;
}

/** Tritone substitution: bII7 of the dominant. */
function tritoneSub(c: ChordSymbol, useFlat: boolean): ChordSymbol {
  const pc = (rootToPc(c.root) + 6) % 12;
  return buildChord(pc, "7", useFlat);
}

/** Secondary dominant: V7 of the next chord (perfect-fifth-up to next root). */
function secondaryDominantOf(next: ChordSymbol, useFlat: boolean): ChordSymbol {
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
    const deg = degreeOf(c, keyRoot, mode);
    if (deg === 3) return diatonicAt(1, keyRoot, mode, useFlat); // IV → ii
    if (deg === 1) return diatonicAt(3, keyRoot, mode, useFlat); // ii → IV
    return c;
  });
  if (iv2ii.some((c, i) => c.display !== chords[i].display)) {
    pushUnique({ label: "IV ↔ ii substitution", chords: iv2ii });
  }

  // 3. Tritone sub on dominants (or convert V triad → V7 → tritone sub).
  const tritone = chords.map((c, i) => {
    const isV = degreeOf(c, keyRoot, mode) === 4;
    if (isDominant(c) || isV) {
      const dom: ChordSymbol = isDominant(c)
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
    const a = chords[i];
    const b = chords[i + 1];
    if ((isDominant(a) || degreeOf(a, keyRoot, mode) === 4) && degreeOf(b, keyRoot, mode) === 0) {
      deceptive[i + 1] = diatonicAt(5, keyRoot, mode, useFlat);
      deceptiveChanged = true;
    }
  }
  if (deceptiveChanged) pushUnique({ label: "Deceptive cadence (V → vi)", chords: deceptive });

  // 6. Modal interchange: borrow bVI / bVII from parallel minor in major keys.
  if (mode === "maj") {
    const borrowed = chords.map((c) => {
      const deg = degreeOf(c, keyRoot, mode);
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
