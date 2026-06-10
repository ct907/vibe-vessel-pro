import type { Quality } from "./chords";
import {
  POWDER_BLUE, LAVENDER, WARM_SAND, SOFT_PEACH, DUSTY_BLUE,
  PALE_BUTTER, MUTED_BLUSH, MINT, SOFT_THISTLE, APRICOT,
} from "./chordColor";

export type GenreTag =
  | "neo_soul" | "jazz" | "gospel" | "rnb" | "pop"
  | "cinematic" | "rock" | "folk" | "classical" | "blues";

export const QUALITY_GENRE_TAGS: Record<Quality, GenreTag[]> = {
  maj:     ["pop", "rock", "folk", "classical"],
  min:     ["pop", "rock", "folk", "classical"],
  maj7:    ["neo_soul", "jazz", "pop", "cinematic"],
  min7:    ["neo_soul", "jazz", "rnb", "gospel"],
  "7":     ["rnb", "rock", "jazz", "blues"],
  maj9:    ["neo_soul", "jazz", "gospel", "cinematic", "rnb"],
  min9:    ["neo_soul", "rnb", "jazz"],
  "9":     ["rnb", "jazz", "neo_soul"],
  "6":     ["gospel", "folk", "jazz"],
  "6/9":   ["neo_soul", "gospel", "jazz"],
  min6:    ["jazz", "cinematic"],
  add9:    ["pop", "gospel", "folk", "rnb"],
  add11:   ["neo_soul", "jazz"],
  maj11:   ["jazz", "neo_soul", "cinematic"],
  maj13:   ["neo_soul", "jazz"],
  min11:   ["neo_soul", "jazz", "rnb"],
  min13:   ["jazz", "neo_soul"],
  minMaj7: ["jazz", "cinematic", "classical"],
  dim:     ["classical", "cinematic", "rock"],
  dim7:    ["classical", "jazz", "cinematic"],
  m7b5:    ["jazz", "classical", "cinematic", "neo_soul"],
  "7alt":    ["jazz"],
  "7#5":     ["jazz", "cinematic"],
  "7b9":     ["jazz", "classical"],
  "7#9":     ["jazz"],
  "13":      ["jazz", "neo_soul", "rnb"],
  "13b9":    ["jazz"],
  "9#11":    ["jazz", "neo_soul"],
  "maj9#11": ["jazz", "neo_soul", "cinematic"],
  aug:     ["cinematic", "classical"],
  sus2:    ["pop", "folk", "rock"],
  sus4:    ["pop", "gospel", "rock"],
  "5":     ["rock"],
};

export const GENRE_LABEL: Record<GenreTag, string> = {
  neo_soul:  "Neo Soul",
  jazz:      "Jazz",
  gospel:    "Gospel",
  rnb:       "R&B",
  pop:       "Pop",
  cinematic: "Cinematic",
  rock:      "Rock",
  folk:      "Folk",
  classical: "Classical",
  blues:     "Blues",
};

export const GENRE_COLOR: Record<GenreTag, string> = {
  neo_soul:  POWDER_BLUE,
  jazz:      LAVENDER,
  gospel:    WARM_SAND,
  rnb:       SOFT_PEACH,
  cinematic: DUSTY_BLUE,
  pop:       PALE_BUTTER,
  rock:      MUTED_BLUSH,
  folk:      MINT,
  classical: SOFT_THISTLE,
  blues:     APRICOT,
};

const GENRE_ADJECTIVE: Record<GenreTag, string> = {
  neo_soul:  "smooth, layered",
  jazz:      "complex, colourful",
  gospel:    "warm, stacked",
  rnb:       "groove-centred",
  cinematic: "dramatic",
  pop:       "bright, open",
  rock:      "raw",
  folk:      "natural, open",
  classical: "voice-leading richness",
  blues:     "gritty tension",
};

export function getGenreTags(quality: Quality): GenreTag[] {
  return QUALITY_GENRE_TAGS[quality] ?? [];
}

export function getGenreLabel(quality: Quality): string {
  const tags = QUALITY_GENRE_TAGS[quality];
  if (!tags || tags.length === 0) return "";
  return GENRE_LABEL[tags[0]];
}

export function getGenreContextLine(quality: Quality): string | null {
  const tags = QUALITY_GENRE_TAGS[quality];
  if (!tags || tags.length === 0) return null;
  const simple = ["maj", "min", "sus2", "sus4", "5", "add9"];
  if (simple.includes(quality)) return null;
  const top = tags.slice(0, 2);
  const labels = top.map((t) => GENRE_LABEL[t]).join(" and ");
  const adjective = GENRE_ADJECTIVE[top[0]];
  return `Common in ${labels} — adds ${adjective} texture.`;
}
