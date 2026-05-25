import { type ChordSymbol, QUALITY_FAMILY, rootToPc } from "./chords";

export type CRSpectrum =
  | "sad" | "tragic" | "bittersweet" | "evil" | "uneasy" | "ominous"
  | "dramatic" | "mysterious" | "neutral" | "cautious" | "rising"
  | "powerful" | "resolution" | "romantic" | "otherworldly" | "wonder"
  | "heroic" | "fantastical" | "protagonism" | "good_energy";

export interface ChordRelationship {
  startQuality: "maj" | "min";
  interval: number;
  endQuality: "maj" | "min";
  emotion: string;
  spectrum: CRSpectrum;
  twin?: { interval: number; startQuality: "maj" | "min"; endQuality: "maj" | "min" };
}

export const CR_TABLE: ChordRelationship[] = [
  // ── Major → Minor ─────────────────────────────────────────────────────────
  { startQuality: "maj", interval: 1,  endQuality: "min", emotion: "Evil tension",       spectrum: "evil" },
  { startQuality: "maj", interval: 2,  endQuality: "min", emotion: "Uneasy shift",        spectrum: "uneasy" },
  { startQuality: "maj", interval: 3,  endQuality: "min", emotion: "Ominous turn",         spectrum: "ominous" },
  { startQuality: "maj", interval: 4,  endQuality: "min", emotion: "Sadness and loss",     spectrum: "sad" },
  { startQuality: "maj", interval: 5,  endQuality: "min", emotion: "Dramatic pull",        spectrum: "dramatic" },
  { startQuality: "maj", interval: 6,  endQuality: "min", emotion: "Mysterious drop",      spectrum: "mysterious" },
  { startQuality: "maj", interval: 7,  endQuality: "min", emotion: "Neutral drift",        spectrum: "neutral" },
  { startQuality: "maj", interval: 8,  endQuality: "min", emotion: "Protagonism",          spectrum: "protagonism" },
  { startQuality: "maj", interval: 9,  endQuality: "min", emotion: "Romantic shadow",      spectrum: "romantic" },
  { startQuality: "maj", interval: 10, endQuality: "min", emotion: "Rising melancholy",    spectrum: "rising" },
  { startQuality: "maj", interval: 11, endQuality: "min", emotion: "Quiet resolve",        spectrum: "resolution" },

  // ── Minor → Major ─────────────────────────────────────────────────────────
  { startQuality: "min", interval: 1,  endQuality: "maj", emotion: "Dark shimmer",         spectrum: "mysterious" },
  { startQuality: "min", interval: 2,  endQuality: "maj", emotion: "Cautious hope",        spectrum: "cautious" },
  { startQuality: "min", interval: 3,  endQuality: "maj", emotion: "Rising escape",        spectrum: "rising" },
  { startQuality: "min", interval: 4,  endQuality: "maj", emotion: "Romantic lift",        spectrum: "romantic" },
  { startQuality: "min", interval: 5,  endQuality: "maj", emotion: "Powerful surge",       spectrum: "powerful" },
  { startQuality: "min", interval: 6,  endQuality: "maj", emotion: "Cosmic bridge",        spectrum: "otherworldly" },
  { startQuality: "min", interval: 7,  endQuality: "maj", emotion: "Bittersweet",          spectrum: "bittersweet", twin: { interval: 10, startQuality: "min", endQuality: "maj" } },
  { startQuality: "min", interval: 8,  endQuality: "maj", emotion: "Wonder",               spectrum: "wonder" },
  { startQuality: "min", interval: 9,  endQuality: "maj", emotion: "Resolution",           spectrum: "resolution" },
  { startQuality: "min", interval: 10, endQuality: "maj", emotion: "Bittersweet echo",     spectrum: "bittersweet", twin: { interval: 7, startQuality: "min", endQuality: "maj" } },
  { startQuality: "min", interval: 11, endQuality: "maj", emotion: "Fantastical leap",     spectrum: "fantastical" },

  // ── Minor → Minor ─────────────────────────────────────────────────────────
  { startQuality: "min", interval: 1,  endQuality: "min", emotion: "Evil shadow",          spectrum: "evil" },
  { startQuality: "min", interval: 2,  endQuality: "min", emotion: "Uneasy descent",       spectrum: "uneasy" },
  { startQuality: "min", interval: 3,  endQuality: "min", emotion: "Ominous weight",       spectrum: "ominous" },
  { startQuality: "min", interval: 4,  endQuality: "min", emotion: "Dramatic descent",     spectrum: "dramatic" },
  { startQuality: "min", interval: 5,  endQuality: "min", emotion: "Tragic",               spectrum: "tragic",      twin: { interval: 7, startQuality: "min", endQuality: "min" } },
  { startQuality: "min", interval: 6,  endQuality: "min", emotion: "Outer void",           spectrum: "otherworldly", twin: { interval: 6, startQuality: "maj", endQuality: "maj" } },
  { startQuality: "min", interval: 7,  endQuality: "min", emotion: "Deep tragedy",         spectrum: "tragic",      twin: { interval: 5, startQuality: "min", endQuality: "min" } },
  { startQuality: "min", interval: 8,  endQuality: "min", emotion: "Mysterious depth",     spectrum: "mysterious" },
  { startQuality: "min", interval: 9,  endQuality: "min", emotion: "Neutral dark",         spectrum: "neutral" },
  { startQuality: "min", interval: 10, endQuality: "min", emotion: "Rising dark",          spectrum: "rising" },
  { startQuality: "min", interval: 11, endQuality: "min", emotion: "Dark protagonist",     spectrum: "protagonism" },

  // ── Major → Major ─────────────────────────────────────────────────────────
  { startQuality: "maj", interval: 1,  endQuality: "maj", emotion: "Eerie neighbour",      spectrum: "mysterious" },
  { startQuality: "maj", interval: 2,  endQuality: "maj", emotion: "Fantastical step",     spectrum: "fantastical" },
  { startQuality: "maj", interval: 3,  endQuality: "maj", emotion: "Heroic charge",        spectrum: "heroic",      twin: { interval: 9, startQuality: "maj", endQuality: "maj" } },
  { startQuality: "maj", interval: 4,  endQuality: "maj", emotion: "Powerful ascent",      spectrum: "powerful" },
  { startQuality: "maj", interval: 5,  endQuality: "maj", emotion: "Strong resolution",    spectrum: "resolution" },
  { startQuality: "maj", interval: 6,  endQuality: "maj", emotion: "Outer space",          spectrum: "otherworldly", twin: { interval: 6, startQuality: "min", endQuality: "min" } },
  { startQuality: "maj", interval: 7,  endQuality: "maj", emotion: "Good energy",          spectrum: "good_energy" },
  { startQuality: "maj", interval: 8,  endQuality: "maj", emotion: "Wonder",               spectrum: "wonder" },
  { startQuality: "maj", interval: 9,  endQuality: "maj", emotion: "Triumphant return",    spectrum: "heroic",      twin: { interval: 3, startQuality: "maj", endQuality: "maj" } },
  { startQuality: "maj", interval: 10, endQuality: "maj", emotion: "Romantic longing",     spectrum: "romantic" },
  { startQuality: "maj", interval: 11, endQuality: "maj", emotion: "Protagonism",          spectrum: "protagonism" },
];

function toSimpleQuality(quality: ChordSymbol["quality"]): "maj" | "min" | null {
  const family = QUALITY_FAMILY[quality];
  if (family === "major") return "maj";
  if (family === "minor") return "min";
  return null;
}

export function getCR(from: ChordSymbol, to: ChordSymbol): ChordRelationship | null {
  const fromQ = toSimpleQuality(from.quality);
  const toQ = toSimpleQuality(to.quality);
  if (!fromQ || !toQ) return null;
  const interval = ((rootToPc(to.root) - rootToPc(from.root)) % 12 + 12) % 12;
  if (interval === 0) return null;
  return CR_TABLE.find(
    (e) => e.startQuality === fromQ && e.interval === interval && e.endQuality === toQ,
  ) ?? null;
}

export const CR_SPECTRUM_LABEL: Record<CRSpectrum, string> = {
  sad: "Sad",
  tragic: "Tragic",
  bittersweet: "Bittersweet",
  evil: "Evil",
  uneasy: "Uneasy",
  ominous: "Ominous",
  dramatic: "Dramatic",
  mysterious: "Mysterious",
  neutral: "Neutral",
  cautious: "Cautious",
  rising: "Rising",
  otherworldly: "Otherworldly",
  powerful: "Powerful",
  resolution: "Resolution",
  romantic: "Romantic",
  wonder: "Wonder",
  heroic: "Heroic",
  fantastical: "Fantastical",
  protagonism: "Protagonism",
  good_energy: "Good Energy",
};

export const CR_BANDS = {
  dark:    ["sad", "tragic", "bittersweet", "evil", "uneasy", "ominous", "dramatic", "mysterious"],
  neutral: ["neutral", "cautious", "rising", "otherworldly"],
  bright:  ["powerful", "resolution", "romantic", "wonder", "protagonism", "heroic", "fantastical", "good_energy"],
} as const;
