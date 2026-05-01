// Phase 1.5 chord color taxonomy.
//
// Maps chord quality to a Tailwind background + foreground class pair.
// Solid colors for triads / bright colors; horizontal gradients for
// extended / dominant / altered families.
//
// IMPORTANT: any new color literal added here MUST also be present in
// `tailwind.config.ts`'s `safelist` (literal or matching pattern), otherwise
// it will be purged in production builds.

import type { ChordSymbol } from "./chords";

export interface ChordColorClasses {
  bg: string;
  text: string;
}

export function getChordColorClasses(chord: ChordSymbol): ChordColorClasses {
  switch (chord.quality) {
    // Solid triads
    case "maj":
      return { bg: "bg-yellow-700", text: "text-stone-50" };
    case "min":
      return { bg: "bg-blue-800", text: "text-stone-50" };

    // Bright (added-tone, no 7th)
    case "6":
    case "add9":
    case "6/9":
      return { bg: "bg-yellow-300", text: "text-zinc-900" };
    case "min6":
      return { bg: "bg-blue-300", text: "text-zinc-900" };

    // Major-extended (gradient)
    case "maj7":
    case "maj9":
    case "maj11":
    case "maj13":
    case "add11":
      return { bg: "bg-gradient-to-r from-yellow-600 to-red-950", text: "text-stone-50" };

    // Minor-extended (gradient)
    case "min7":
    case "min9":
    case "min11":
    case "min13":
      return { bg: "bg-gradient-to-r from-blue-700 to-purple-950", text: "text-stone-50" };

    // Dominant (gradient)
    case "7":
    case "9":
      return { bg: "bg-gradient-to-r from-orange-800 to-blue-600", text: "text-stone-50" };

    // Altered dominant (gradient)
    case "7alt":
    case "7#5":
    case "7b9":
    case "7#9":
      return { bg: "bg-gradient-to-r from-orange-900 to-red-950", text: "text-stone-50" };

    // Minor-major (gradient)
    case "minMaj7":
      return { bg: "bg-gradient-to-r from-purple-800 to-yellow-600", text: "text-stone-50" };

    // Diminished family (gradient)
    case "dim":
    case "dim7":
    case "m7b5":
      return { bg: "bg-gradient-to-r from-blue-800 to-purple-950", text: "text-stone-50" };

    // Suspended / augmented (bright)
    case "sus2":
    case "sus4":
    case "aug":
      return { bg: "bg-pink-300", text: "text-zinc-900" };

    // Power chord
    case "5":
      return { bg: "bg-gradient-to-r from-yellow-300 to-blue-300", text: "text-zinc-900" };
  }
}
