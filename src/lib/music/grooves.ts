// Drum grooves as text: one string per lane, one character per step.
//
//   "."  rest
//   "1"  half-note skeleton    (plays at every density)
//   "2"  quarter-note support
//   "3"  eighth-note motion
//   "4"  sixteenths and ghost notes (busiest density only)
//
// Density is the gap between notes: at density n, steps marked 1..n play. A
// step is a sixteenth note, so a bar has (16 / beatUnit) steps per beat:
// 16 in 4/4, 12 in 3/4 and in 6/8.

export const DRUM_LANES = [
  "kick", "snare", "clap", "rim", "hatClosed", "hatOpen", "ride", "shaker", "perc", "crash",
] as const;
export type DrumLane = (typeof DRUM_LANES)[number];

export const LANE_LABELS: Record<DrumLane, string> = {
  kick: "Kick", snare: "Snare", clap: "Clap", rim: "Rim", hatClosed: "Hat",
  hatOpen: "Open hat", ride: "Ride", shaker: "Shaker", perc: "Conga", crash: "Crash",
};

export type DrumGenre =
  | "popRock" | "fourFloor" | "halfTime" | "boomBap" | "shuffle" | "bossa"
  | "waltz" | "ballad68" | "basic";

export type LanePattern = Partial<Record<DrumLane, string>>;

export interface Groove {
  id: DrumGenre;
  label: string;
  /** "beatsPerBar/beatUnit" meters it is written for; empty = any (built per meter). */
  meters: string[];
  lanes: LanePattern;
  /** Delay the off-beat eighths or sixteenths by this fraction of the note. */
  swing?: { unit: 8 | 16; amount: number };
}

export const GROOVES: Groove[] = [
  {
    id: "popRock", label: "Pop / Rock", meters: ["4/4"],
    lanes: {
      kick:      "1.....3.1.3.....",
      snare:     "....1.......1..4",
      hatClosed: "1434243414342434",
    },
  },
  {
    id: "fourFloor", label: "Four on the floor", meters: ["4/4"],
    lanes: {
      kick:      "1...2...1...2...",
      clap:      "....1.......1...",
      hatOpen:   "..2...2...2...2.",
      hatClosed: ".4.4.4.4.4.4.4.4",
      shaker:    "3.3.3.3.3.3.3.3.",
    },
  },
  {
    id: "halfTime", label: "Half-time", meters: ["4/4"],
    lanes: {
      kick:      "1.....4...3.....",
      snare:     "........1.......",
      hatClosed: "1434243424342434",
      rim:       "....3.......4...",
    },
  },
  {
    id: "boomBap", label: "Boom bap", meters: ["4/4"], swing: { unit: 16, amount: 0.25 },
    lanes: {
      kick:      "1......3..1....4",
      snare:     "....1.......1...",
      hatClosed: "2434243424342434",
      hatOpen:   "..............3.",
    },
  },
  {
    id: "shuffle", label: "Shuffle", meters: ["4/4"], swing: { unit: 8, amount: 1 / 3 },
    lanes: {
      kick:      "1.......1.3.....",
      snare:     "....1.......1...",
      ride:      "1.3.2.3.1.3.2.3.",
      hatClosed: "....4.......4...",
    },
  },
  {
    id: "bossa", label: "Bossa nova", meters: ["4/4"],
    lanes: {
      kick:   "1..32...1..32..." + "1..32...1..32...",
      rim:    "1..2..2...2....." + "..2...2.........",
      shaker: "3434343434343434" + "3434343434343434",
    },
  },
  {
    id: "waltz", label: "Waltz", meters: ["3/4"],
    lanes: {
      kick:      "1...........",
      snare:     "....2...2...",
      hatClosed: "2.3.2.3.2.3.",
      perc:      "......4...4.",
    },
  },
  {
    id: "ballad68", label: "6/8 ballad", meters: ["6/8"],
    lanes: {
      kick:      "1.......3...",
      snare:     "......1.....",
      hatClosed: "243434243434",
    },
  },
  { id: "basic", label: "Basic", meters: [], lanes: {} },
];

export const GROOVE_BY_ID = Object.fromEntries(GROOVES.map((g) => [g.id, g])) as Record<DrumGenre, Groove>;

export function stepsPerBar(beatsPerBar: number, beatUnit: number): number {
  return Math.round(beatsPerBar * (16 / beatUnit));
}

/** Kick on the one, backbeat on the last beat, hats on every beat and subdivision. */
function basicLanes(beatsPerBar: number, beatUnit: number): LanePattern {
  const per = 16 / beatUnit;
  const n = stepsPerBar(beatsPerBar, beatUnit);
  const at = (fn: (step: number, beat: number, sub: number) => string) =>
    Array.from({ length: n }, (_, i) => fn(i, Math.floor(i / per), i % per)).join("");
  const last = beatsPerBar - 1;
  return {
    kick: at((_, beat, sub) => (sub === 0 && beat === 0 ? "1" : sub === 0 && beatsPerBar >= 4 && beat === Math.floor(beatsPerBar / 2) ? "2" : ".")),
    snare: at((_, beat, sub) => (sub === 0 && beat === last && beat > 0 ? "1" : ".")),
    hatClosed: at((_, beat, sub) => (sub === 0 ? (beat === 0 ? "1" : "2") : per >= 2 && sub === per / 2 ? "3" : "4")),
  };
}

export function grooveFits(g: Groove, beatsPerBar: number, beatUnit: number): boolean {
  return g.meters.length === 0 || g.meters.includes(`${beatsPerBar}/${beatUnit}`);
}

/** The groove's lanes for this meter. A genre written for another meter falls back to Basic. */
export function grooveLanes(genre: DrumGenre, beatsPerBar: number, beatUnit: number): { lanes: LanePattern; swing?: Groove["swing"] } {
  const g = GROOVE_BY_ID[genre] ?? GROOVE_BY_ID.basic;
  if (g.id === "basic" || !grooveFits(g, beatsPerBar, beatUnit)) return { lanes: basicLanes(beatsPerBar, beatUnit) };
  return { lanes: g.lanes, swing: g.swing };
}
