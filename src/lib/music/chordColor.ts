// Render-time projection from a chord's quality + extension to chip colors.
// No SSOT/schema/store changes. Pure function.
//
// Family rules:
//   dim / ° / dim7 ............. teal
//   m7b5 / minor + 7th ......... purple (per spec verification: Em7b5 → purple-500)
//   minor (m, min) ............. blue
//   dominant 7/9/11/13 with maj  orange (e.g. Cmaj9 → orange-700)
//   dominant 7/9/11/13 with m    purple (e.g. Em7 → purple-500)
//   dominant 7/9/11/13 plain ... orange (e.g. G7 → orange-500)
//   maj / triad / sus / add /
//     aug / 5 (power) .......... yellow
//
// Weight rules (by highest extension number found):
//   contains 9, 11, or 13 → 700
//   contains 7 (not 9/11/13) → 500
//   otherwise → 300
//
// Classes are emitted as full literal strings so Tailwind's JIT can detect them.

import type { ChordSymbol, Quality } from "./chords";

type Family = "yellow" | "blue" | "teal" | "purple" | "orange";
type Weight = 300 | 500 | 700;

function detectWeight(q: Quality, display: string): Weight {
  // Prefer the structured quality for safety, fall back to the display string
  // for things like /^.*9.*$/ patterns we don't model in Quality.
  if (q === "maj9" || q === "min9" || q === "9" || q === "add9") return 700;
  if (/(?:^|[^0-9])(?:9|11|13)(?![0-9])/.test(display)) return 700;
  if (q === "maj7" || q === "min7" || q === "7" || q === "dim7" || q === "m7b5" || q === "minMaj7") return 500;
  if (/(?:^|[^0-9])7(?![0-9])/.test(display)) return 500;
  return 300;
}

function detectFamily(q: Quality): Family {
  switch (q) {
    case "dim":
    case "dim7":
      return "teal";
    case "m7b5":
    case "min7":
    case "min9":
    case "minMaj7":
    case "min6":
      return "purple";
    case "min":
      return "blue";
    case "maj7":
    case "maj9":
      return "orange";
    case "7":
    case "9":
      return "orange";
    case "6":
      return "orange";
    case "maj":
    case "aug":
    case "sus2":
    case "sus4":
    case "add9":
      return "yellow";
    default:
      return "yellow";
  }
}

// Static lookup table — every class string written out so Tailwind JIT picks it up.
const CLASS_TABLE: Record<Family, Record<Weight, string>> = {
  yellow: {
    300: "bg-yellow-300 hover:bg-yellow-300/80 text-yellow-950",
    500: "bg-yellow-500 hover:bg-yellow-500/80 text-yellow-50",
    700: "bg-yellow-700 hover:bg-yellow-700/80 text-yellow-50",
  },
  blue: {
    300: "bg-blue-300 hover:bg-blue-300/80 text-blue-950",
    500: "bg-blue-500 hover:bg-blue-500/80 text-blue-50",
    700: "bg-blue-700 hover:bg-blue-700/80 text-blue-50",
  },
  teal: {
    300: "bg-teal-300 hover:bg-teal-300/80 text-teal-950",
    500: "bg-teal-500 hover:bg-teal-500/80 text-teal-50",
    700: "bg-teal-700 hover:bg-teal-700/80 text-teal-50",
  },
  purple: {
    300: "bg-purple-300 hover:bg-purple-300/80 text-purple-950",
    500: "bg-purple-500 hover:bg-purple-500/80 text-purple-50",
    700: "bg-purple-700 hover:bg-purple-700/80 text-purple-50",
  },
  orange: {
    300: "bg-orange-300 hover:bg-orange-300/80 text-orange-950",
    500: "bg-orange-500 hover:bg-orange-500/80 text-orange-50",
    700: "bg-orange-700 hover:bg-orange-700/80 text-orange-50",
  },
};

export function getChordChipClasses(chord: ChordSymbol): string {
  const family = detectFamily(chord.quality);
  const weight = detectWeight(chord.quality, chord.display);
  return CLASS_TABLE[family][weight];
}
