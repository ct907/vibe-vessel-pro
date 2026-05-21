import { nashvilleLadder, transposeChord, type ChordSymbol, type Quality } from "./chords";

export type HarmonyFunction = "tonic" | "subdominant" | "dominant" | "color";

export interface ExplorerChord {
  numeral: string;
  chord: ChordSymbol;
}

/** Fixed trail elevation per functional role (the mountain's Y-axis). */
export const ELEVATION: Record<string, number> = {
  V: 2,
  "vii°": 2,
  IV: 1,
  ii: 1,
  I: 0,
  vi: -1,
  iii: -1,
  bVI: -2,
  bVII: -2,
};

export const FUNCTION_GROUP: Record<string, HarmonyFunction> = {
  I: "tonic",
  iii: "tonic",
  vi: "tonic",
  ii: "subdominant",
  IV: "subdominant",
  V: "dominant",
  "vii°": "dominant",
  bVI: "color",
  bVII: "color",
};

export const FUNCTION_LABEL: Record<HarmonyFunction, string> = {
  tonic: "Tonic · Home Ground",
  subdominant: "Subdominant · The Climb",
  dominant: "Dominant · The Peak",
  color: "Modal Color · Deep Canyon",
};

export const MOOD_TAGS: Record<string, string> = {
  I: "Home · Resolved",
  ii: "Pensive · Open",
  iii: "Bittersweet · Searching",
  IV: "Uplifting · Steady",
  V: "Tense · Driving",
  vi: "Nostalgic · Tender",
  "vii°": "Unstable · Urgent",
  bVI: "Cinematic · Dreamy",
  bVII: "Anthemic · Bold",
};

const GROUP_ORDER: HarmonyFunction[] = ["tonic", "subdominant", "dominant", "color"];

export function elevationOf(numeral: string): number {
  return ELEVATION[numeral] ?? 0;
}

/** Extended/altered qualities render as diamonds rather than circular stones. */
export function isExtendedQuality(q: Quality): boolean {
  return q !== "maj" && q !== "min";
}

export function explorerChords(keyRoot: string): ExplorerChord[] {
  const ladder = nashvilleLadder(keyRoot, "maj");
  const chords: ExplorerChord[] = ladder.map((d) => ({ numeral: d.numeral, chord: d.chord }));
  const tonic = ladder[0].chord;
  chords.push({ numeral: "bVI", chord: transposeChord(tonic, 8) });
  chords.push({ numeral: "bVII", chord: transposeChord(tonic, 10) });
  return chords;
}

export function explorerChordMap(keyRoot: string): Record<string, ChordSymbol> {
  const map: Record<string, ChordSymbol> = {};
  for (const c of explorerChords(keyRoot)) map[c.numeral] = c.chord;
  return map;
}

export function explorerChordsByGroup(
  keyRoot: string,
): Array<{ group: HarmonyFunction; chords: ExplorerChord[] }> {
  const all = explorerChords(keyRoot);
  return GROUP_ORDER.map((group) => ({
    group,
    chords: all.filter((c) => FUNCTION_GROUP[c.numeral] === group),
  }));
}
