import { generateSpiceSuggestions, type SpiceSuggestion, type SpiceCategory } from "./spice";
import { suggestProgressionVoicings, type Feel } from "./voicingFeel";
import type { ChordSymbol, Mode } from "./chords";

export type Vibe = "dreamy" | "cinematic" | "tense" | "hypnotic" | "bold";

export const VIBES: {
  id: Vibe;
  emoji: string;
  label: string;
  blurb: string;
}[] = [
  { id: "dreamy", emoji: "✨", label: "Dreamy", blurb: "Light, floating, suspended" },
  { id: "cinematic", emoji: "🎬", label: "Cinematic", blurb: "Wide, dramatic, scene-setting" },
  { id: "tense", emoji: "⚡", label: "Tense", blurb: "Edgy, pulling, unresolved" },
  { id: "hypnotic", emoji: "🧘", label: "Hypnotic", blurb: "Droning, looping, locked-in" },
  { id: "bold", emoji: "🔥", label: "Bold", blurb: "Loud, stripped, in-your-face" },
];

// Which reharm categories belong to each vibe.
// Each SpiceCategory appears under exactly one vibe.
export const VIBE_CATEGORIES: Record<Vibe, SpiceCategory[]> = {
  dreamy: ["sus_resolution", "cosmic_drift", "extension_colour"],
  cinematic: ["cinematic", "step_between", "passing_augmented"],
  tense: ["gateway", "altered_dominant", "espionage"],
  hypnotic: ["hypnotic_drone", "line_cliche", "borrowed_colour"],
  bold: ["amplify", "break_pattern", "power_riff"],
};

// Each vibe also pulls one voicing feel into the same list.
export const VIBE_FEEL: Record<Vibe, Feel> = {
  dreamy: "dreamy",
  cinematic: "dramatic",
  tense: "tense",
  hypnotic: "flowing",
  bold: "jazzy",
};

// Star rating — displayed on the card and used to sort the list.
// Voicings are always 1. Reharms are rated by frictionDelta.
export const STAR_MEANING: Record<1 | 2 | 3, string> = {
  1: "Same chords, new voicing",
  2: "Gentle new chord",
  3: "Bold reharmonization",
};

// frictionDelta threshold: at or above this value → 3 stars.
// Tune by ear after auditioning; start here.
export const DRAMATIC_FRICTION_THRESHOLD = 1.2;

export interface VibeSuggestion {
  id: string;
  kind: "voicing" | "reharm";
  chords: ChordSymbol[];
  label: string; // emotiveLabel for reharm; voicing label for voicing
  description: string;
  stars: 1 | 2 | 3;
  changedIndices: number[];
  suggestedDurations: number[] | null;
  countChanged: boolean;
}

function reharmStars(s: SpiceSuggestion): 2 | 3 {
  return s.frictionDelta >= DRAMATIC_FRICTION_THRESHOLD ? 3 : 2;
}

export function generateVibeSuggestions(
  vibe: Vibe,
  chords: ChordSymbol[],
  keyRoot: string,
  mode: Mode,
  scope: "whole_chain" | { chordIndex: number },
  durations?: number[],
): VibeSuggestion[] {
  const wanted = new Set(VIBE_CATEGORIES[vibe]);

  // Reharms: run the existing engine, filter to this vibe's categories.
  const reharms: VibeSuggestion[] = generateSpiceSuggestions(
    chords,
    keyRoot,
    mode,
    scope,
    durations,
  )
    .filter((s) => wanted.has(s.category))
    .map((s) => ({
      id: s.id,
      kind: "reharm" as const,
      chords: s.chords,
      label: s.emotiveLabel,
      description: s.description,
      stars: reharmStars(s),
      changedIndices: s.changedIndices,
      suggestedDurations: s.suggestedDurations,
      countChanged: s.countChanged,
    }));

  // Voicings: whole-chain only (revoicing is a full-progression op).
  // Skip when scope is a single focused chord.
  const voicings: VibeSuggestion[] =
    scope === "whole_chain"
      ? suggestProgressionVoicings(chords, VIBE_FEEL[vibe]).map((v) => ({
          id: `voicing-${v.id}`,
          kind: "voicing" as const,
          chords: v.chords,
          label: v.label,
          description: "Same chords, smoother voice leading.",
          stars: 1 as const,
          changedIndices: v.chords
            .map((c, i) => (c.display !== chords[i]?.display ? i : -1))
            .filter((i) => i >= 0),
          suggestedDurations: null,
          countChanged: false,
        }))
      : [];

  // Sort ascending by stars: 1★ voicings first, 3★ bold reharms last.
  return [...voicings, ...reharms].sort((a, b) => a.stars - b.stars);
}
