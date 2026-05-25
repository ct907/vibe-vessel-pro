import {
  ChordSymbol, Mode, Quality, QUALITY_PRETTY, rootToPc, pcToName,
} from "./chords";
import type { CRSpectrum } from "./chordRelationships";
import type { GenreTag } from "./genreColor";

export type { CRSpectrum };

export interface PresetDegree {
  interval: number;
  quality: Quality;
  romanNumeral: string;
  bassInterval?: number;
}

export type PresetFilter =
  | { kind: "cr_spectrum"; value: CRSpectrum }
  | { kind: "genre"; value: GenreTag }
  | { kind: "vibe"; value: string };

export interface ProgressionPreset {
  id: string;
  name: string;
  formula: string;
  filters: PresetFilter[];
  degrees: PresetDegree[];
  featuredQualities?: Quality[];
  featureIndex?: number;
  beatsPerChord?: number;
}

export function getPresetCRSpectrums(p: ProgressionPreset): CRSpectrum[] {
  return p.filters.filter((f): f is Extract<PresetFilter, { kind: "cr_spectrum" }> => f.kind === "cr_spectrum").map((f) => f.value);
}

export function getPresetGenres(p: ProgressionPreset): GenreTag[] {
  return p.filters.filter((f): f is Extract<PresetFilter, { kind: "genre" }> => f.kind === "genre").map((f) => f.value);
}

export function getPresetVibes(p: ProgressionPreset): string[] {
  return p.filters.filter((f): f is Extract<PresetFilter, { kind: "vibe" }> => f.kind === "vibe").map((f) => f.value);
}



export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: "royal-road",
    name: "The Royal Road",
    formula: "IV – V – iii – vi",
    filters: [
      { kind: "cr_spectrum", value: "fantastical" },
      { kind: "cr_spectrum", value: "romantic" },
      { kind: "cr_spectrum", value: "tragic" },
      { kind: "vibe", value: "Emotional & Driving" },
    ],
    degrees: [
      { interval: 5, quality: "maj", romanNumeral: "IV" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
      { interval: 4, quality: "min", romanNumeral: "iii" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
    ],
  },
  {
    id: "jazz-turnaround",
    name: "The Jazz Turnaround",
    formula: "ii – V – I – vi",
    filters: [
      { kind: "cr_spectrum", value: "powerful" },
      { kind: "cr_spectrum", value: "resolution" },
      { kind: "cr_spectrum", value: "romantic" },
      { kind: "vibe", value: "Smooth & Smoky" },
    ],
    degrees: [
      { interval: 2, quality: "min", romanNumeral: "ii" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
    ],
  },
  {
    id: "deep-pop-canyon",
    name: "The Deep Pop Canyon",
    formula: "I – V – vi – IV",
    filters: [
      { kind: "cr_spectrum", value: "good_energy" },
      { kind: "cr_spectrum", value: "neutral" },
      { kind: "cr_spectrum", value: "wonder" },
      { kind: "vibe", value: "Stadium Epic" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
    ],
  },
  {
    id: "cinematic-drift",
    name: "The Cinematic Drift",
    formula: "I – ♭VII – IV – iv",
    filters: [
      { kind: "cr_spectrum", value: "romantic" },
      { kind: "cr_spectrum", value: "good_energy" },
      { kind: "vibe", value: "Nostalgic Sigh" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 10, quality: "maj", romanNumeral: "♭VII" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
      { interval: 5, quality: "min", romanNumeral: "iv" },
    ],
  },
  {
    id: "andalusian",
    name: "The Andalusian Descent",
    formula: "i – ♭VII – ♭VI – V",
    filters: [
      { kind: "cr_spectrum", value: "bittersweet" },
      { kind: "cr_spectrum", value: "romantic" },
      { kind: "cr_spectrum", value: "protagonism" },
      { kind: "vibe", value: "Dark & Dramatic" },
    ],
    degrees: [
      { interval: 0, quality: "min", romanNumeral: "i" },
      { interval: 10, quality: "maj", romanNumeral: "♭VII" },
      { interval: 8, quality: "maj", romanNumeral: "♭VI" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
    ],
  },
  {
    id: "doo-wop",
    name: "The Doo-Wop",
    formula: "I – vi – IV – V",
    filters: [
      { kind: "cr_spectrum", value: "romantic" },
      { kind: "cr_spectrum", value: "wonder" },
      { kind: "cr_spectrum", value: "fantastical" },
      { kind: "vibe", value: "Classic & Warm" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
    ],
  },
  {
    id: "axis",
    name: "The Axis",
    formula: "vi – IV – I – V",
    filters: [
      { kind: "cr_spectrum", value: "wonder" },
      { kind: "cr_spectrum", value: "good_energy" },
      { kind: "vibe", value: "Anthemic & Hopeful" },
    ],
    degrees: [
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
    ],
  },
  {
    id: "minor-drama",
    name: "The Minor Drama",
    formula: "i – iv – v – i",
    filters: [
      { kind: "cr_spectrum", value: "tragic" },
      { kind: "cr_spectrum", value: "uneasy" },
      { kind: "vibe", value: "Brooding & Intimate" },
    ],
    degrees: [
      { interval: 0, quality: "min", romanNumeral: "i" },
      { interval: 5, quality: "min", romanNumeral: "iv" },
      { interval: 7, quality: "min", romanNumeral: "v" },
      { interval: 0, quality: "min", romanNumeral: "i" },
    ],
  },
  {
    id: "backdoor",
    name: "The Backdoor",
    formula: "I – vi – iv – ♭VII – I",
    filters: [
      { kind: "cr_spectrum", value: "romantic" },
      { kind: "cr_spectrum", value: "mysterious" },
      { kind: "vibe", value: "Sneaky Resolution" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "min", romanNumeral: "iv" },
      { interval: 10, quality: "7", romanNumeral: "♭VII7" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
    ],
  },
  {
    id: "descending-minor-line-cliche",
    name: "Descending minor line cliché",
    formula: "i – i(maj7) – i7 – i6",
    filters: [{ kind: "vibe", value: "Cinematic" }],
    degrees: [
      { interval: 0, quality: "min", romanNumeral: "i" },
      { interval: 0, quality: "minMaj7", romanNumeral: "i(maj7)" },
      { interval: 0, quality: "min7", romanNumeral: "i7" },
      { interval: 0, quality: "min6", romanNumeral: "i6" },
    ],
  },
  {
    id: "half-diminished-bridge",
    name: "Half-diminished bridge",
    formula: "iiø7 – V7 – i – ♭VII",
    filters: [
      { kind: "cr_spectrum", value: "bittersweet" },
      { kind: "vibe", value: "Jazz" },
    ],
    degrees: [
      { interval: 2, quality: "m7b5", romanNumeral: "iiø7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
      { interval: 0, quality: "min", romanNumeral: "i" },
      { interval: 10, quality: "maj", romanNumeral: "♭VII" },
    ],
  },
  {
    id: "neapolitan-cadence",
    name: "Neapolitan cadence",
    formula: "♭II – V – i",
    filters: [
      { kind: "cr_spectrum", value: "otherworldly" },
      { kind: "cr_spectrum", value: "dramatic" },
      { kind: "vibe", value: "Classical" },
    ],
    degrees: [
      { interval: 1, quality: "maj", romanNumeral: "♭II" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
      { interval: 0, quality: "min", romanNumeral: "i" },
    ],
  },
  {
    id: "lydian-loop",
    name: "Lydian loop",
    formula: "I – II – vii° – I",
    filters: [
      { kind: "cr_spectrum", value: "fantastical" },
      { kind: "vibe", value: "Cinematic" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 2, quality: "maj", romanNumeral: "II" },
      { interval: 11, quality: "dim", romanNumeral: "vii°" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
    ],
  },
  {
    id: "sad-string-quartet",
    name: "Sad String Quartet",
    formula: "I – iii – IV – V",
    filters: [
      { kind: "cr_spectrum", value: "sad" },
      { kind: "vibe", value: "Emotional" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 4, quality: "min", romanNumeral: "iii" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
    ],
  },
  {
    id: "heroic-anthem",
    name: "Heroic Anthem",
    formula: "I – VI – IV – V",
    filters: [
      { kind: "cr_spectrum", value: "heroic" },
      { kind: "vibe", value: "Epic" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 9, quality: "maj", romanNumeral: "VI" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
    ],
  },
  {
    id: "outer-space",
    name: "Outer Space",
    formula: "I – #IV – I",
    filters: [
      { kind: "cr_spectrum", value: "otherworldly" },
      { kind: "vibe", value: "Cinematic" },
    ],
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 6, quality: "maj", romanNumeral: "#IV" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
    ],
  },
  {
    id: "bittersweet-resolve",
    name: "Bittersweet Resolve",
    formula: "i – v – ♭VI – ♭VII",
    filters: [
      { kind: "cr_spectrum", value: "bittersweet" },
      { kind: "vibe", value: "Emotional" },
    ],
    degrees: [
      { interval: 0,  quality: "min", romanNumeral: "i" },
      { interval: 7,  quality: "min", romanNumeral: "v" },
      { interval: 8,  quality: "maj", romanNumeral: "♭VI" },
      { interval: 10, quality: "maj", romanNumeral: "♭VII" },
    ],
  },
  {
    id: "rising-tension",
    name: "Rising Tension",
    formula: "i – ♭III – iv – V",
    filters: [
      { kind: "cr_spectrum", value: "rising" },
      { kind: "vibe", value: "Dark" },
    ],
    degrees: [
      { interval: 0, quality: "min", romanNumeral: "i" },
      { interval: 3, quality: "maj", romanNumeral: "♭III" },
      { interval: 5, quality: "min", romanNumeral: "iv" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
    ],
  },
  {
    id: "neo-soul-shimmer",
    name: "Neo Soul Shimmer",
    formula: "Imaj9 – vim9 – IVmaj9 – V9",
    filters: [
      { kind: "genre", value: "neo_soul" },
      { kind: "vibe", value: "Emotional" },
    ],
    degrees: [
      { interval: 0, quality: "maj9", romanNumeral: "Imaj9" },
      { interval: 9, quality: "min9", romanNumeral: "vim9" },
      { interval: 5, quality: "maj9", romanNumeral: "IVmaj9" },
      { interval: 7, quality: "9",    romanNumeral: "V9" },
    ],
  },
  {
    id: "rnb-late-night",
    name: "R&B Late Night",
    formula: "im9 – ♭VIImaj9 – ♭VImaj7 – V9",
    filters: [
      { kind: "genre", value: "rnb" },
      { kind: "genre", value: "neo_soul" },
      { kind: "vibe", value: "Emotional" },
    ],
    degrees: [
      { interval: 0,  quality: "min9", romanNumeral: "im9" },
      { interval: 10, quality: "maj9", romanNumeral: "♭VIImaj9" },
      { interval: 8,  quality: "maj7", romanNumeral: "♭VImaj7" },
      { interval: 7,  quality: "9",    romanNumeral: "V9" },
    ],
  },
  {
    id: "jazz-ii-v-i-colour",
    name: "Jazz ii–V–I with Colour",
    formula: "iim7 – V7alt – Imaj9",
    filters: [
      { kind: "genre", value: "jazz" },
      { kind: "vibe", value: "Dark" },
    ],
    degrees: [
      { interval: 2, quality: "min7",  romanNumeral: "iim7" },
      { interval: 7, quality: "7alt",  romanNumeral: "V7alt" },
      { interval: 0, quality: "maj9",  romanNumeral: "Imaj9" },
    ],
  },
  {
    id: "gospel-warmth",
    name: "Gospel Warmth",
    formula: "I6/9 – IVadd9 – vim7 – V9",
    filters: [
      { kind: "genre", value: "gospel" },
      { kind: "vibe", value: "Emotional" },
    ],
    degrees: [
      { interval: 0, quality: "6/9",  romanNumeral: "I6/9" },
      { interval: 5, quality: "add9", romanNumeral: "IVadd9" },
      { interval: 9, quality: "min7", romanNumeral: "vim7" },
      { interval: 7, quality: "9",    romanNumeral: "V9" },
    ],
  },
  {
    id: "cinematic-half-dim-resolve",
    name: "Cinematic Half-Dim Resolve",
    formula: "iiø7 – V7♭9 – i(maj7) – IVmaj7",
    filters: [
      { kind: "genre", value: "cinematic" },
      { kind: "genre", value: "jazz" },
      { kind: "genre", value: "classical" },
      { kind: "vibe", value: "Dark" },
    ],
    degrees: [
      { interval: 2, quality: "m7b5",   romanNumeral: "iiø7" },
      { interval: 7, quality: "7b9",    romanNumeral: "V7♭9" },
      { interval: 0, quality: "minMaj7", romanNumeral: "i(maj7)" },
      { interval: 5, quality: "maj7",   romanNumeral: "IVmaj7" },
    ],
  },
];

export const QUALITY_PROGRESSION_PRESETS: ProgressionPreset[] = [
  // minMaj7
  {
    id: "bond-line-cliche",
    name: "James Bond Line Cliché",
    formula: "i – i(maj7) – i7 – i6",
    filters: [{ kind: "vibe", value: "Cinematic & Mysterious" }],
    featuredQualities: ["minMaj7"],
    featureIndex: 1,
    degrees: [
      { interval: 0, quality: "min", romanNumeral: "i" },
      { interval: 0, quality: "minMaj7", romanNumeral: "i(maj7)" },
      { interval: 0, quality: "min7", romanNumeral: "i7" },
      { interval: 0, quality: "min6", romanNumeral: "i6" },
    ],
  },
  {
    id: "bond-minor-plagal",
    name: "Bond Minor Plagal",
    formula: "i(maj7) – iv – i",
    filters: [{ kind: "vibe", value: "Smoky & Suspenseful" }],
    featuredQualities: ["minMaj7"],
    featureIndex: 0,
    beatsPerChord: 4,
    degrees: [

      { interval: 0, quality: "minMaj7", romanNumeral: "i(maj7)" },
      { interval: 5, quality: "min", romanNumeral: "iv" },
      { interval: 0, quality: "min", romanNumeral: "i" },
    ],
  },
  // m7b5
  {
    id: "minor-ii-v-i",
    name: "Minor ii–V–i",
    formula: "iiø7 – V7♭9 – i",
    filters: [{ kind: "vibe", value: "Classic Jazz Cadence" }],
    featuredQualities: ["m7b5"],
    featureIndex: 0,
    degrees: [
      { interval: 2, quality: "m7b5", romanNumeral: "iiø7" },
      { interval: 7, quality: "7b9", romanNumeral: "V7♭9" },
      { interval: 0, quality: "min", romanNumeral: "i" },
    ],
  },
  {
    id: "half-dim-approach",
    name: "Half-Diminished Approach",
    formula: "viiø7 – iii7 – vi",
    filters: [{ kind: "vibe", value: "Brooding & Smooth" }],
    featuredQualities: ["m7b5"],
    featureIndex: 0,
    degrees: [
      { interval: 11, quality: "m7b5", romanNumeral: "viiø7" },
      { interval: 4, quality: "min7", romanNumeral: "iii7" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
    ],
  },
  // dim7
  {
    id: "chromatic-passing-dim",
    name: "Chromatic Passing Diminished",
    formula: "I – #i°7 – ii7 – V7",
    filters: [{ kind: "vibe", value: "Sophisticated Walk-up" }],
    featuredQualities: ["dim7", "dim"],
    featureIndex: 1,
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 1, quality: "dim7", romanNumeral: "#i°7" },
      { interval: 2, quality: "min7", romanNumeral: "ii7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
    ],
  },
  {
    id: "dim-turnaround",
    name: "Diminished Turnaround",
    formula: "Imaj7 – ♭iii°7 – ii7 – V7",
    filters: [{ kind: "vibe", value: "Bebop Color" }],
    featuredQualities: ["dim7", "dim"],
    featureIndex: 1,
    degrees: [
      { interval: 0, quality: "maj7", romanNumeral: "Imaj7" },
      { interval: 3, quality: "dim7", romanNumeral: "♭iii°7" },
      { interval: 2, quality: "min7", romanNumeral: "ii7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
    ],
  },
  // dominant 7
  {
    id: "ii-v-i-major",
    name: "ii–V–I",
    formula: "ii7 – V7 – Imaj7",
    filters: [{ kind: "vibe", value: "The Jazz Cadence" }],
    featuredQualities: ["7"],
    featureIndex: 1,
    degrees: [
      { interval: 2, quality: "min7", romanNumeral: "ii7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
      { interval: 0, quality: "maj7", romanNumeral: "Imaj7" },
    ],
  },
  {
    id: "backdoor-ii-v",
    name: "Backdoor ii–V",
    formula: "iv7 – ♭VII7 – Imaj7",
    filters: [{ kind: "vibe", value: "Sneaky Resolution" }],
    featuredQualities: ["7"],
    featureIndex: 1,
    degrees: [
      { interval: 5, quality: "min7", romanNumeral: "iv7" },
      { interval: 10, quality: "7", romanNumeral: "♭VII7" },
      { interval: 0, quality: "maj7", romanNumeral: "Imaj7" },
    ],
  },
  {
    id: "blues-turnaround",
    name: "Blues Turnaround",
    formula: "I7 – VI7 – ii7 – V7",
    filters: [{ kind: "vibe", value: "Rhythm Changes" }],
    featuredQualities: ["7"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "7", romanNumeral: "I7" },
      { interval: 9, quality: "7", romanNumeral: "VI7" },
      { interval: 2, quality: "min7", romanNumeral: "ii7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
    ],
  },
  // altered dominants
  {
    id: "altered-v-to-i",
    name: "Altered V → i",
    formula: "iiø7 – V7alt – i(maj7)",
    filters: [{ kind: "vibe", value: "Dark Jazz Resolution" }],
    featuredQualities: ["7alt", "7b9", "7#9", "7#5"],
    featureIndex: 1,
    degrees: [
      { interval: 2, quality: "m7b5", romanNumeral: "iiø7" },
      { interval: 7, quality: "7alt", romanNumeral: "V7alt" },
      { interval: 0, quality: "minMaj7", romanNumeral: "i(maj7)" },
    ],
  },
  {
    id: "hendrix-7sharp9",
    name: "Hendrix",
    formula: "I7#9 – IV7 – ♭III7",
    filters: [{ kind: "vibe", value: "Funky & Bluesy" }],
    featuredQualities: ["7#9", "7alt"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "7#9", romanNumeral: "I7#9" },
      { interval: 5, quality: "7", romanNumeral: "IV7" },
      { interval: 3, quality: "7", romanNumeral: "♭III7" },
    ],
  },
  // maj7
  {
    id: "jazz-i-vi-ii-v",
    name: "Jazz I–vi–ii–V",
    formula: "Imaj7 – vi7 – ii7 – V7",
    filters: [{ kind: "vibe", value: "Standards Turnaround" }],
    featuredQualities: ["maj7"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "maj7", romanNumeral: "Imaj7" },
      { interval: 9, quality: "min7", romanNumeral: "vi7" },
      { interval: 2, quality: "min7", romanNumeral: "ii7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
    ],
  },
  {
    id: "bossa-i-iv",
    name: "Bossa I–IV",
    formula: "Imaj7 – IVmaj7",
    filters: [{ kind: "vibe", value: "Bossa Nova Drift" }],
    featuredQualities: ["maj7"],
    featureIndex: 0,
    beatsPerChord: 4,
    degrees: [

      { interval: 0, quality: "maj7", romanNumeral: "Imaj7" },
      { interval: 5, quality: "maj7", romanNumeral: "IVmaj7" },
    ],
  },
  // min7
  {
    id: "modal-vamp",
    name: "Modal Vamp",
    formula: "i7 – ♭VII – IV",
    filters: [{ kind: "vibe", value: "Dorian Groove" }],
    featuredQualities: ["min7"],
    featureIndex: 0,
    beatsPerChord: 4,
    degrees: [

      { interval: 0, quality: "min7", romanNumeral: "i7" },
      { interval: 10, quality: "maj", romanNumeral: "♭VII" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
    ],
  },
  {
    id: "smooth-minor-ii-v-i",
    name: "Smooth Minor ii–V–i",
    formula: "i7 – iv7 – ♭VII7 – ♭IIImaj7",
    filters: [{ kind: "vibe", value: "Mellow Modal Cycle" }],
    featuredQualities: ["min7"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "min7", romanNumeral: "i7" },
      { interval: 5, quality: "min7", romanNumeral: "iv7" },
      { interval: 10, quality: "7", romanNumeral: "♭VII7" },
      { interval: 3, quality: "maj7", romanNumeral: "♭IIImaj7" },
    ],
  },
  // maj9 / maj13 / 6/9
  {
    id: "lush-bossa",
    name: "Lush Bossa",
    formula: "Imaj9 – IV6/9 – iimin9 – V13",
    filters: [{ kind: "vibe", value: "Velvet & Warm" }],
    featuredQualities: ["maj9", "maj13", "6/9"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "maj9", romanNumeral: "Imaj9" },
      { interval: 5, quality: "6/9", romanNumeral: "IV6/9" },
      { interval: 2, quality: "min9", romanNumeral: "iimin9" },
      { interval: 7, quality: "9", romanNumeral: "V9" },
    ],
  },
  {
    id: "mellow-loop",
    name: "Mellow Loop",
    formula: "Imaj9 – iiimin9 – vi9 – IVmaj9",
    filters: [{ kind: "vibe", value: "Lo-fi & Floating" }],
    featuredQualities: ["maj9", "min9"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "maj9", romanNumeral: "Imaj9" },
      { interval: 4, quality: "min9", romanNumeral: "iiimin9" },
      { interval: 9, quality: "min9", romanNumeral: "vi9" },
      { interval: 5, quality: "maj9", romanNumeral: "IVmaj9" },
    ],
  },
  // sus
  {
    id: "sus-suspension",
    name: "Sus Suspension",
    formula: "Vsus4 – V – I",
    filters: [{ kind: "vibe", value: "Classic Suspension" }],
    featuredQualities: ["sus4", "sus2"],
    featureIndex: 0,
    degrees: [
      { interval: 7, quality: "sus4", romanNumeral: "Vsus4" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
    ],
  },
  {
    id: "open-drone",
    name: "Open Drone",
    formula: "Isus2 – V – Isus4 – I",
    filters: [{ kind: "vibe", value: "Folk & Open" }],
    featuredQualities: ["sus2", "sus4"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "sus2", romanNumeral: "Isus2" },
      { interval: 7, quality: "maj", romanNumeral: "V" },
      { interval: 0, quality: "sus4", romanNumeral: "Isus4" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
    ],
  },
  // min9 / min11 / min13
  {
    id: "neo-soul-loop",
    name: "Neo-Soul Loop",
    formula: "imin9 – iv11 – ♭VIImaj7 – ♭VImaj7",
    filters: [{ kind: "vibe", value: "Silky & Modern" }],
    featuredQualities: ["min9", "min11", "min13"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "min9", romanNumeral: "imin9" },
      { interval: 5, quality: "min11", romanNumeral: "iv11" },
      { interval: 10, quality: "maj7", romanNumeral: "♭VIImaj7" },
      { interval: 8, quality: "maj7", romanNumeral: "♭VImaj7" },
    ],
  },
  // add9 / add11
  {
    id: "modern-pop-loop-add9",
    name: "Modern Pop Loop",
    formula: "Iadd9 – Vadd9 – vi – IVadd9",
    filters: [{ kind: "vibe", value: "Sparkly Pop" }],
    featuredQualities: ["add9", "add11"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "add9", romanNumeral: "Iadd9" },
      { interval: 7, quality: "add9", romanNumeral: "Vadd9" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "add9", romanNumeral: "IVadd9" },
    ],
  },
  // aug
  {
    id: "whole-tone-rise",
    name: "Whole-Tone Rise",
    formula: "I – I+ – I6 – I7",
    filters: [{ kind: "vibe", value: "Old Hollywood" }],
    featuredQualities: ["aug"],
    featureIndex: 1,
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 0, quality: "aug", romanNumeral: "I+" },
      { interval: 0, quality: "6", romanNumeral: "I6" },
      { interval: 0, quality: "7", romanNumeral: "I7" },
    ],
  },
  {
    id: "augmented-bridge",
    name: "Augmented Bridge",
    formula: "I – III+ – vi – IV",
    filters: [{ kind: "vibe", value: "Lift & Lean" }],
    featuredQualities: ["aug"],
    featureIndex: 1,
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 4, quality: "aug", romanNumeral: "III+" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "maj", romanNumeral: "IV" },
    ],
  },
  // power
  {
    id: "power-rock",
    name: "Power Rock",
    formula: "I5 – ♭VII5 – IV5",
    filters: [{ kind: "vibe", value: "Riff Driver" }],
    featuredQualities: ["5"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "5", romanNumeral: "I5" },
      { interval: 10, quality: "5", romanNumeral: "♭VII5" },
      { interval: 5, quality: "5", romanNumeral: "IV5" },
    ],
  },
  {
    id: "punk-i-iv-v",
    name: "Punk I–IV–V",
    formula: "I5 – IV5 – V5",
    filters: [{ kind: "vibe", value: "Three-Chord Wall" }],
    featuredQualities: ["5"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "5", romanNumeral: "I5" },
      { interval: 5, quality: "5", romanNumeral: "IV5" },
      { interval: 7, quality: "5", romanNumeral: "V5" },
    ],
  },
  // 6 / min6
  {
    id: "swing-i-vi-ii-v-6",
    name: "Swing I6",
    formula: "I6 – vi7 – ii7 – V7",
    filters: [{ kind: "vibe", value: "Vintage Swing" }],
    featuredQualities: ["6", "min6"],
    featureIndex: 0,
    degrees: [
      { interval: 0, quality: "6", romanNumeral: "I6" },
      { interval: 9, quality: "min7", romanNumeral: "vi7" },
      { interval: 2, quality: "min7", romanNumeral: "ii7" },
      { interval: 7, quality: "7", romanNumeral: "V7" },
    ],
  },
];

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);

function useFlatFor(keyRoot: string): boolean {
  return keyRoot.includes("b") || FLAT_KEYS.has(keyRoot);
}

export function realizePreset(
  preset: ProgressionPreset,
  keyRoot: string,
  _mode: Mode,
): ChordSymbol[] {
  const useFlat = useFlatFor(keyRoot);
  const keyPc = rootToPc(keyRoot);
  return preset.degrees.map((d) => {
    const pc = (keyPc + d.interval) % 12;
    const root = pcToName(pc, useFlat);
    const bass = d.bassInterval !== undefined
      ? pcToName((keyPc + d.bassInterval) % 12, useFlat)
      : undefined;
    const display = root + QUALITY_PRETTY[d.quality] + (bass ? `/${bass}` : "");
    return { root, quality: d.quality, bass, display };
  });
}

export function realizePresetAnchored(
  preset: ProgressionPreset,
  anchorRoot: string,
  anchorIndex: number,
  useFlatHint?: boolean,
): ChordSymbol[] {
  const useFlat = useFlatHint ?? useFlatFor(anchorRoot);
  const anchorPc = rootToPc(anchorRoot);
  const anchorInterval = preset.degrees[anchorIndex]?.interval ?? 0;
  const keyPc = (anchorPc - anchorInterval + 144) % 12;
  return preset.degrees.map((d) => {
    const pc = (keyPc + d.interval) % 12;
    const root = pcToName(pc, useFlat);
    const bass = d.bassInterval !== undefined
      ? pcToName((keyPc + d.bassInterval) % 12, useFlat)
      : undefined;
    const display = root + QUALITY_PRETTY[d.quality] + (bass ? `/${bass}` : "");
    return { root, quality: d.quality, bass, display };
  });
}

