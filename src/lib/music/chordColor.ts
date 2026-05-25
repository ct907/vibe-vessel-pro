// Pastel chord color taxonomy (OKLCH).
//
// Each chord quality maps to an inline `style` (background + foreground color)
// plus a small `className` that carries hover behavior. Multi-color families
// use `linear-gradient(to right in oklch, A, B)` so the gradient interpolates
// in OKLCH and avoids the muddy midpoints you'd get from default sRGB
// interpolation.
//
// All OKLCH literals were generated from the requested hex palette.

import type { CSSProperties } from "react";
import type { ChordSymbol } from "./chords";

export interface ChordColorClasses {
  /** Inline style carrying background (solid or oklch gradient) + text color. */
  style: CSSProperties;
  /** Hover/transition utility class — no color classes here. */
  className: string;
  /** Back-compat: empty strings so legacy callers using `bg`/`text` still compile. */
  bg: string;
  text: string;
}

export const TEXT_DARK = "oklch(0.25 0.02 260)";
export const TEXT_LIGHT = "oklch(0.95 0.01 80)";
const HOVER = "transition-opacity hover:opacity-90";

function adaptiveText(bg: string): string {
  const ls = [...bg.matchAll(/oklch\(([\d.]+)/g)].map((m) => parseFloat(m[1]));
  if (!ls.length) return TEXT_DARK;
  const avg = ls.reduce((a, b) => a + b, 0) / ls.length;
  return avg > 0.55 ? TEXT_DARK : TEXT_LIGHT;
}

// Pastel palette (hex -> oklch).
export const SOFT_PEACH    = "oklch(0.9294 0.0816 89.78)";   // #FDE6A9
export const POWDER_BLUE   = "oklch(0.9092 0.0316 243.72)";  // #D0E4F5
export const PALE_BUTTER   = "oklch(0.9597 0.0633 94.68)";   // #FFF2C2
export const ICE_BLUE      = "oklch(0.9469 0.0209 236.76)";  // #E1F0FA
export const WARM_SAND     = "oklch(0.9272 0.0651 83.56)";   // #FCE4B6
export const ROSE          = "oklch(0.8689 0.0539 11.07)";   // #F5C6CB
export const SKY_BLUE      = "oklch(0.9046 0.0400 263.66)";  // #D2E0FB
export const LAVENDER      = "oklch(0.8897 0.0407 307.95)";  // #E2D4F0
export const APRICOT       = "oklch(0.9013 0.0465 54.45)";   // #F8D7C2
export const PERIWINKLE    = "oklch(0.8744 0.0387 264.35)";  // #C9D6F0
export const MINT          = "oklch(0.9088 0.0353 150.52)";  // #D1E8D5
export const MUTED_BLUSH   = "oklch(0.8693 0.0443 18.04)";   // #F0C9C9
export const DUSTY_BLUE    = "oklch(0.8626 0.0268 274.07)";  // #CCD1E4
export const LILAC         = "oklch(0.8460 0.0483 311.68)";  // #D7C4E4
export const SOFT_THISTLE  = "oklch(0.8865 0.0337 308.94)";  // #E0D4EB
export const PALE_GOLD     = WARM_SAND;                       // #FCE4B6
export const COTTON_CANDY  = "oklch(0.9065 0.0471 350.82)";  // #FAD4E4
export const PALE_LEMON    = "oklch(0.9565 0.0595 94.86)";   // #FDF1C4
export const BABY_BLUE     = "oklch(0.9265 0.0286 238.25)";  // #D6EAF8

const solid = (color: string): CSSProperties => ({ background: color, color: adaptiveText(color) });
const grad  = (a: string, b: string): CSSProperties => ({
  background: `linear-gradient(to right in oklch, ${a}, ${b})`,
  color: adaptiveText(a + b),
});

function styleFor(quality: ChordSymbol["quality"]): CSSProperties {
  switch (quality) {
    // Plain triads
    case "maj":     return solid(SOFT_PEACH);
    case "min":     return solid(POWDER_BLUE);

    // Gentle (added-tone, no 7th)
    case "6":
    case "add9":
    case "6/9":     return solid(PALE_BUTTER);
    case "min6":    return solid(ICE_BLUE);

    // Major-extended
    case "maj7":
    case "maj9":
    case "maj11":
    case "maj13":
    case "add11":   return grad(WARM_SAND, ROSE);

    // Minor-extended
    case "min7":
    case "min9":
    case "min11":
    case "min13":   return grad(SKY_BLUE, LAVENDER);

    // Dominant
    case "7":
    case "9":       return grad(APRICOT, PERIWINKLE);

    // Altered dominant
    case "7alt":
    case "7#5":
    case "7b9":
    case "7#9":     return grad(MINT, MUTED_BLUSH);

    // Diminished family
    case "dim":
    case "dim7":
    case "m7b5":    return grad(DUSTY_BLUE, LILAC);

    // Minor-major
    case "minMaj7": return grad(SOFT_THISTLE, PALE_GOLD);

    // Suspended / augmented
    case "sus2":
    case "sus4":
    case "aug":     return solid(COTTON_CANDY);

    // Power chord
    case "5":       return grad(PALE_LEMON, BABY_BLUE);
  }
}

// Stroke color = darker sibling of gradient's first color.
// Used as 2px border on focused/selected chord chips.
function strokeFor(quality: ChordSymbol["quality"]): string {
  switch (quality) {
    case "maj":     return "oklch(0.52 0.17 60)";
    case "min":     return "oklch(0.48 0.15 245)";
    case "6":
    case "add9":
    case "6/9":     return "oklch(0.55 0.16 90)";
    case "min6":    return "oklch(0.50 0.14 232)";
    case "maj7":
    case "maj9":
    case "maj11":
    case "maj13":
    case "add11":   return "oklch(0.50 0.18 25)";
    case "min7":
    case "min9":
    case "min11":
    case "min13":   return "oklch(0.45 0.17 290)";
    case "7":
    case "9":       return "oklch(0.52 0.18 50)";
    case "7alt":
    case "7#5":
    case "7b9":
    case "7#9":     return "oklch(0.50 0.16 155)";
    case "dim":
    case "dim7":
    case "m7b5":    return "oklch(0.46 0.15 295)";
    case "minMaj7": return "oklch(0.50 0.14 70)";
    case "sus2":
    case "sus4":
    case "aug":     return "oklch(0.52 0.17 350)";
    case "5":       return "oklch(0.50 0.15 238)";
  }
}

export function getChordColorClasses(chord: ChordSymbol): ChordColorClasses {
  return {
    style: styleFor(chord.quality),
    className: HOVER,
    bg: "",
    text: "",
  };
}

/** Returns the focused/selected border color for a chord quality. */
export function getChordStrokeColor(chord: ChordSymbol): string {
  return strokeFor(chord.quality);
}

/** Every distinct chip background — every solid + gradient combination across chord families. */
export const ALL_CHIP_STYLES: CSSProperties[] = [
  solid(SOFT_PEACH),
  solid(POWDER_BLUE),
  solid(PALE_BUTTER),
  solid(ICE_BLUE),
  grad(WARM_SAND, ROSE),
  grad(SKY_BLUE, LAVENDER),
  grad(APRICOT, PERIWINKLE),
  grad(MINT, MUTED_BLUSH),
  grad(DUSTY_BLUE, LILAC),
  grad(SOFT_THISTLE, PALE_GOLD),
  solid(COTTON_CANDY),
  grad(PALE_LEMON, BABY_BLUE),
];
