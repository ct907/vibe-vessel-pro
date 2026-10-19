import { create } from "zustand";

/**
 * Phase 1.6 — Web Audio synth engine presets.
 *
 * Three internal engine archetypes drive every preset:
 *   - "fm"          : 2-op FM (DX-keys, Rhodes)
 *   - "subtractive" : detuned saws + lowpass filter (Juno, String Machine)
 *   - "formant"     : parallel bandpass formants on a saw stack (Vocal Choir)
 *
 * Each preset declares its engine + the meaning of the dynamic Timbre macro.
 */
export type SoundEngine = "fm" | "subtractive" | "formant";

export type SoundPreset =
  | "rhodes"        // FM — Classic Rhodes
  | "dxkeys"        // FM — '80s DX Keys
  | "juno"          // Subtractive — Juno-style polysynth
  | "stringMachine" // Subtractive — Solina string machine
  | "vocalChoir"    // Formant — synthetic choir
  | "piano"         // FM — bright piano
  | "organ"         // Subtractive — drawbar-ish organ
  | "warmPad"       // Subtractive — saws + sub with a slow filter swell
  | "sweepPad"      // Subtractive — resonant filter on a slow LFO
  | "airPad"        // Subtractive — soft triangles + breath noise
  | "glassPad";     // FM — glassy inharmonic shimmer

export interface PresetDef {
  value: SoundPreset;
  label: string;
  engine: SoundEngine;
  /** Label for the dynamic Timbre macro. */
  timbreLabel: string;
  /** Default macro position (0..1). */
  timbreDefault: number;
}

export const SOUND_PRESETS: PresetDef[] = [
  { value: "rhodes",        label: "Classic Rhodes",   engine: "fm",          timbreLabel: "Bell ↔ Tine",     timbreDefault: 0.45 },
  { value: "dxkeys",        label: "'80s DX Keys",     engine: "fm",          timbreLabel: "Mod Index",       timbreDefault: 0.6 },
  { value: "juno",          label: "Juno Poly",        engine: "subtractive", timbreLabel: "Filter Cutoff",   timbreDefault: 0.55 },
  { value: "stringMachine", label: "String Machine",   engine: "subtractive", timbreLabel: "Ensemble",        timbreDefault: 0.7 },
  { value: "vocalChoir",    label: "Vocal Choir",      engine: "formant",     timbreLabel: "Vowel (Ah ↔ Oo)", timbreDefault: 0.4 },
  { value: "piano",         label: "Piano",            engine: "fm",          timbreLabel: "Brightness",      timbreDefault: 0.5 },
  { value: "organ",         label: "Organ",            engine: "subtractive", timbreLabel: "Drawbar Mix",     timbreDefault: 0.6 },
  { value: "warmPad",       label: "Warm Pad",         engine: "subtractive", timbreLabel: "Warmth ↔ Bright", timbreDefault: 0.4 },
  { value: "sweepPad",      label: "Sweep Pad",        engine: "subtractive", timbreLabel: "Sweep",           timbreDefault: 0.5 },
  { value: "airPad",        label: "Air Pad",          engine: "subtractive", timbreLabel: "Air",             timbreDefault: 0.5 },
  { value: "glassPad",      label: "Glass Pad",        engine: "fm",          timbreLabel: "Shimmer",         timbreDefault: 0.5 },
];

export const PRESET_BY_VALUE: Record<SoundPreset, PresetDef> =
  SOUND_PRESETS.reduce((acc, p) => { acc[p.value] = p; return acc; }, {} as Record<SoundPreset, PresetDef>);

export interface ADSR {
  attack: number;   // 0.001 - 4 sec
  decay: number;    // 0 - 4 sec
  sustain: number;  // 0 - 1
  release: number;  // 0.01 - 6 sec
}

export interface EQ3 {
  low: number;   // dB, -24 to +12
  mid: number;
  high: number;
}

export interface FX {
  delayWet: number;      // 0 - 1
  delayTime: number;     // sec, 0 - 1   (used when delaySync=false)
  delaySync: boolean;    // when true, delayTime is derived from BPM
  delayDivision: "1/4" | "1/8" | "1/8." | "1/8t" | "1/16";
  delayFeedback: number; // 0 - 0.9
  reverbWet: number;     // 0 - 1
  reverbDecay: number;   // 0.5 - 8 sec
  chorusWet: number;     // 0 - 1
  chorusRate: number;    // 0.1 - 6 Hz
  chorusDepth: number;   // 0 - 1
}

export type ArpPattern = "all" | "asc" | "desc" | "ascDesc" | "descAsc" | "random";
export type ArpRepeat  = "1" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32";
export type BassMode   = "off" | "bass" | "bassArp";
export type BassRepeat = "1" | "1/2" | "1/4" | "1/8" | "1/16";

export interface ArpSettings {
  pattern: ArpPattern;
  repeat: ArpRepeat;
  /** Legacy: songs saved with a Bass Note mode get the Bass part instead (see loadFrom). */
  bassMode: BassMode;
  bassRepeat: BassRepeat;
  /** 0.5 = straight, 0.75 = full dotted-8th + 16th swing (DAW convention). */
  swing: number;
}

export const DEFAULT_ARP: ArpSettings = {
  pattern: "all",
  repeat: "1/4",
  bassMode: "off",
  bassRepeat: "1",
  swing: 0.5,
};

// ---- Parts ----
//
// The song plays as up to three parts: Pad (the chord sound above, with its
// arpeggiator), Bass and Drums. Each has its own level and on/off switch.

export type PartId = "pad" | "bass" | "drums";

export interface PartMix {
  on: boolean;
  /** dB, -30 to +6 */
  volume: number;
}

export type BassSound = "sub" | "analog" | "electric" | "acid";
export type BassPattern = "hold" | "pulse" | "rootFifth" | "octave" | "approach";

export interface BassSettings {
  sound: BassSound;
  pattern: BassPattern;
  /** Step length for every pattern except Hold. */
  rate: BassRepeat;
  /** 0..1 macro; the sound defines what it does. */
  tone: number;
}

export const BASS_SOUNDS: { value: BassSound; label: string; toneLabel: string }[] = [
  { value: "electric", label: "Electric Bass", toneLabel: "Brightness" },
  { value: "sub",      label: "Sub Bass",      toneLabel: "Grit" },
  { value: "analog",   label: "Analog Bass",   toneLabel: "Filter" },
  { value: "acid",     label: "Acid Bass",     toneLabel: "Squelch" },
];

export const BASS_PATTERNS: { value: BassPattern; label: string }[] = [
  { value: "hold",      label: "Hold root" },
  { value: "pulse",     label: "Pulse" },
  { value: "rootFifth", label: "Root – fifth" },
  { value: "octave",    label: "Octaves" },
  { value: "approach",  label: "Walk into next chord" },
];

export const DEFAULT_BASS: BassSettings = { sound: "electric", pattern: "pulse", rate: "1/4", tone: 0.5 };

export const DEFAULT_MIX: Record<PartId, PartMix> = {
  pad: { on: true, volume: 0 },
  bass: { on: false, volume: 0 },
  drums: { on: false, volume: 0 },
};

export interface SoundSettings {
  preset: SoundPreset;
  volume: number;     // dB, -40 to 6
  timbre: number;     // 0..1 (preset-defined meaning)
  bpmRamp: boolean;   // optional: smooth tempo changes
  highLatencyMode: boolean; // use "playback" latencyHint for Bluetooth audio
  adsr: ADSR;
  eq: EQ3;
  fx: FX;
  arp: ArpSettings;
  bass: BassSettings;
  mix: Record<PartId, PartMix>;
}

export const PRESET_DEFAULTS: Record<SoundPreset, ADSR> = {
  rhodes:        { attack: 0.005, decay: 0.9,  sustain: 0.25, release: 1.4 },
  dxkeys:        { attack: 0.005, decay: 0.6,  sustain: 0.4,  release: 1.2 },
  juno:          { attack: 0.02,  decay: 0.4,  sustain: 0.7,  release: 0.8 },
  stringMachine: { attack: 0.6,   decay: 0.4,  sustain: 0.85, release: 1.6 },
  vocalChoir:    { attack: 0.4,   decay: 0.3,  sustain: 0.9,  release: 1.4 },
  piano:         { attack: 0.005, decay: 0.5,  sustain: 0.25, release: 1.2 },
  organ:         { attack: 0.02,  decay: 0.05, sustain: 0.95, release: 0.3 },
  warmPad:       { attack: 0.8,   decay: 0.6,  sustain: 0.85, release: 2.2 },
  sweepPad:      { attack: 0.5,   decay: 0.5,  sustain: 0.8,  release: 2.0 },
  airPad:        { attack: 1.0,   decay: 0.5,  sustain: 0.9,  release: 2.5 },
  glassPad:      { attack: 0.15,  decay: 1.8,  sustain: 0.5,  release: 2.4 },
};

export const DEFAULT_SOUND: SoundSettings = {
  preset: "rhodes",
  volume: -10,
  timbre: PRESET_BY_VALUE.rhodes.timbreDefault,
  bpmRamp: true,
  highLatencyMode: false,
  adsr: { ...PRESET_DEFAULTS.rhodes },
  eq: { low: 0, mid: 0, high: 0 },
  fx: {
    delayWet: 0, delayTime: 0.25, delaySync: true, delayDivision: "1/8",
    delayFeedback: 0.25, reverbWet: 0.18, reverbDecay: 2.2,
    chorusWet: 0, chorusRate: 0.8, chorusDepth: 0.4,
  },
  arp: { ...DEFAULT_ARP },
  bass: { ...DEFAULT_BASS },
  mix: structuredClone(DEFAULT_MIX),
};

interface SoundState extends SoundSettings {
  set: <K extends keyof SoundSettings>(k: K, v: SoundSettings[K]) => void;
  setPreset: (p: SoundPreset) => void;
  setTimbre: (v: number) => void;
  setADSR: (patch: Partial<ADSR>) => void;
  setEQ: (patch: Partial<EQ3>) => void;
  setFX: (patch: Partial<FX>) => void;
  setVolume: (v: number) => void;
  setBpmRamp: (b: boolean) => void;
  setHighLatencyMode: (b: boolean) => void;
  setArp: (patch: Partial<ArpSettings>) => void;
  setBass: (patch: Partial<BassSettings>) => void;
  setMix: (part: PartId, patch: Partial<PartMix>) => void;
  reset: () => void;
  loadFrom: (s: Partial<SoundSettings> | undefined) => void;
  toJSON: () => SoundSettings;
}

export const useSoundStore = create<SoundState>((set, get) => ({
  ...DEFAULT_SOUND,
  set: (k, v) => set({ [k]: v } as any),
  setPreset: (p) => set({
    preset: p,
    adsr: { ...PRESET_DEFAULTS[p] },
    timbre: PRESET_BY_VALUE[p].timbreDefault,
  }),
  setTimbre: (v) => set({ timbre: Math.max(0, Math.min(1, v)) }),
  setADSR: (patch) => set((s) => ({ adsr: { ...s.adsr, ...patch } })),
  setEQ: (patch) => set((s) => ({ eq: { ...s.eq, ...patch } })),
  setFX: (patch) => set((s) => ({ fx: { ...s.fx, ...patch } })),
  setVolume: (v) => set({ volume: v }),
  setBpmRamp: (b) => set({ bpmRamp: b }),
  setHighLatencyMode: (b) => set({ highLatencyMode: b }),
  setArp: (patch) => set((s) => ({ arp: { ...s.arp, ...patch } })),
  setBass: (patch) => set((s) => ({ bass: { ...s.bass, ...patch } })),
  setMix: (part, patch) => set((s) => ({ mix: { ...s.mix, [part]: { ...s.mix[part], ...patch } } })),
  reset: () => set({ ...DEFAULT_SOUND, mix: structuredClone(DEFAULT_MIX) }),
  loadFrom: (data) => {
    if (!data) return;
    // No migration logic (per Phase 1.6 plan): unknown preset values fall back
    // to the default preset rather than being remapped.
    const preset: SoundPreset =
      data.preset && PRESET_BY_VALUE[data.preset as SoundPreset]
        ? (data.preset as SoundPreset)
        : DEFAULT_SOUND.preset;
    set({
      preset,
      volume: data.volume ?? DEFAULT_SOUND.volume,
      timbre: data.timbre ?? PRESET_BY_VALUE[preset].timbreDefault,
      bpmRamp: data.bpmRamp ?? DEFAULT_SOUND.bpmRamp,
      highLatencyMode: data.highLatencyMode ?? DEFAULT_SOUND.highLatencyMode,
      adsr: { ...PRESET_DEFAULTS[preset], ...(data.adsr ?? {}) },
      eq: { ...DEFAULT_SOUND.eq, ...(data.eq ?? {}) },
      fx: { ...DEFAULT_SOUND.fx, ...(data.fx ?? {}) },
      ...migrateBass(data),
    });
  },
  toJSON: () => {
    const { preset, volume, timbre, bpmRamp, highLatencyMode, adsr, eq, fx, arp, bass, mix } = get();
    return { preset, volume, timbre, bpmRamp, highLatencyMode, adsr, eq, fx, arp, bass, mix };
  },
}));

/**
 * Before the Bass part, the arpeggiator could add a bass note on the pad
 * sound ("Bass Note" mode). Songs saved that way turn the Bass part on at the
 * same rate instead.
 */
function migrateBass(data: Partial<SoundSettings>): Pick<SoundSettings, "arp" | "bass" | "mix"> {
  const arp = { ...DEFAULT_ARP, ...(data.arp ?? {}) };
  const mix: Record<PartId, PartMix> = {
    pad: { ...DEFAULT_MIX.pad, ...(data.mix?.pad ?? {}) },
    bass: { ...DEFAULT_MIX.bass, ...(data.mix?.bass ?? {}) },
    drums: { ...DEFAULT_MIX.drums, ...(data.mix?.drums ?? {}) },
  };
  const bass = { ...DEFAULT_BASS, ...(data.bass ?? {}) };
  if (!data.bass && arp.bassMode !== "off") {
    mix.bass.on = true;
    bass.pattern = "pulse";
    bass.rate = arp.bassRepeat;
  }
  return { arp: { ...arp, bassMode: "off" }, bass, mix };
}
