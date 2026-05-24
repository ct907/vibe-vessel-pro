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
  featuredQualities?: Quality[];
  featureIndex?: number;
  beatsPerChord?: number;
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

export const QUALITY_PROGRESSION_PRESETS: ProgressionPreset[] = [
  // minMaj7
  {
    id: "bond-line-cliche",
    name: "James Bond Line Cliché",
    formula: "i – i(maj7) – i7 – i6",
    tag: "Cinematic & Mysterious",
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
    tag: "Smoky & Suspenseful",
    featuredQualities: ["minMaj7"],
    featureIndex: 0,
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
    tag: "Classic Jazz Cadence",
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
    tag: "Brooding & Smooth",
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
    tag: "Sophisticated Walk-up",
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
    tag: "Bebop Color",
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
    tag: "The Jazz Cadence",
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
    tag: "Sneaky Resolution",
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
    tag: "Rhythm Changes",
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
    tag: "Dark Jazz Resolution",
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
    tag: "Funky & Bluesy",
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
    tag: "Standards Turnaround",
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
    tag: "Bossa Nova Drift",
    featuredQualities: ["maj7"],
    featureIndex: 0,
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
    tag: "Dorian Groove",
    featuredQualities: ["min7"],
    featureIndex: 0,
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
    tag: "Mellow Modal Cycle",
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
    tag: "Velvet & Warm",
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
    tag: "Lo-fi & Floating",
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
    tag: "Classic Suspension",
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
    tag: "Folk & Open",
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
    tag: "Silky & Modern",
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
    tag: "Sparkly Pop",
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
    tag: "Old Hollywood",
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
    tag: "Lift & Lean",
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
    tag: "Riff Driver",
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
    tag: "Three-Chord Wall",
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
    tag: "Vintage Swing",
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

