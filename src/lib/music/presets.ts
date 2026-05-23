import {
  ChordSymbol, Mode, Quality, QUALITY_PRETTY, rootToPc, pcToName,
} from "./chords";

export interface PresetDegree {
  interval: number;
  quality: Quality;
  romanNumeral: string;
  bassInterval?: number;
}

export interface ProgressionPreset {
  id: string;
  name: string;
  formula: string;
  tag: string;
  degrees: PresetDegree[];
}

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: "royal-road",
    name: "The Royal Road",
    formula: "IV – V – iii – vi",
    tag: "Emotional & Driving",
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
    tag: "Smooth & Smoky",
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
    tag: "Stadium Epic",
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
    tag: "Nostalgic Sigh",
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
    tag: "Dark & Dramatic",
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
    tag: "Classic & Warm",
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
    tag: "Anthemic & Hopeful",
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
    tag: "Brooding & Intimate",
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
    tag: "Sneaky Resolution",
    degrees: [
      { interval: 0, quality: "maj", romanNumeral: "I" },
      { interval: 9, quality: "min", romanNumeral: "vi" },
      { interval: 5, quality: "min", romanNumeral: "iv" },
      { interval: 10, quality: "7", romanNumeral: "♭VII7" },
      { interval: 0, quality: "maj", romanNumeral: "I" },
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
