import { create } from "zustand";

export type SoundPreset = "piano" | "organ" | "strings" | "pizz" | "kalimba" | "wurli";

export const SOUND_PRESETS: { value: SoundPreset; label: string }[] = [
  { value: "piano", label: "Piano" },
  { value: "organ", label: "Organ" },
  { value: "strings", label: "Strings" },
  { value: "pizz", label: "Pizz Plucks" },
  { value: "kalimba", label: "Kalimba" },
  { value: "wurli", label: "Wurli" },
];

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
  delayWet: number;   // 0 - 1
  delayTime: number;  // sec, 0 - 1
  delayFeedback: number; // 0 - 0.9
  reverbWet: number;  // 0 - 1
  reverbDecay: number; // 0.5 - 8 sec
}

export interface SoundSettings {
  preset: SoundPreset;
  volume: number;     // dB, -40 to 6
  adsr: ADSR;
  eq: EQ3;
  fx: FX;
}

export const PRESET_DEFAULTS: Record<SoundPreset, ADSR> = {
  piano:   { attack: 0.005, decay: 0.4,  sustain: 0.3, release: 1.4 },
  organ:   { attack: 0.02,  decay: 0.05, sustain: 0.9, release: 0.4 },
  strings: { attack: 0.5,   decay: 0.3,  sustain: 0.8, release: 1.5 },
  pizz:    { attack: 0.005, decay: 0.25, sustain: 0.0, release: 0.4 },
  kalimba: { attack: 0.005, decay: 0.6,  sustain: 0.0, release: 0.6 },
  wurli:   { attack: 0.005, decay: 0.5,  sustain: 0.4, release: 1.0 },
};

export const DEFAULT_SOUND: SoundSettings = {
  preset: "piano",
  volume: -10,
  adsr: { ...PRESET_DEFAULTS.piano },
  eq: { low: 0, mid: 0, high: 0 },
  fx: { delayWet: 0, delayTime: 0.25, delayFeedback: 0.25, reverbWet: 0.15, reverbDecay: 2 },
};

interface SoundState extends SoundSettings {
  set: <K extends keyof SoundSettings>(k: K, v: SoundSettings[K]) => void;
  setPreset: (p: SoundPreset) => void;
  setADSR: (patch: Partial<ADSR>) => void;
  setEQ: (patch: Partial<EQ3>) => void;
  setFX: (patch: Partial<FX>) => void;
  setVolume: (v: number) => void;
  reset: () => void;
  loadFrom: (s: Partial<SoundSettings> | undefined) => void;
  toJSON: () => SoundSettings;
}

export const useSoundStore = create<SoundState>((set, get) => ({
  ...DEFAULT_SOUND,
  set: (k, v) => set({ [k]: v } as any),
  setPreset: (p) => set({ preset: p, adsr: { ...PRESET_DEFAULTS[p] } }),
  setADSR: (patch) => set((s) => ({ adsr: { ...s.adsr, ...patch } })),
  setEQ: (patch) => set((s) => ({ eq: { ...s.eq, ...patch } })),
  setFX: (patch) => set((s) => ({ fx: { ...s.fx, ...patch } })),
  setVolume: (v) => set({ volume: v }),
  reset: () => set({ ...DEFAULT_SOUND }),
  loadFrom: (data) => {
    if (!data) return;
    set({
      preset: data.preset ?? DEFAULT_SOUND.preset,
      volume: data.volume ?? DEFAULT_SOUND.volume,
      adsr: { ...DEFAULT_SOUND.adsr, ...(data.adsr ?? {}) },
      eq: { ...DEFAULT_SOUND.eq, ...(data.eq ?? {}) },
      fx: { ...DEFAULT_SOUND.fx, ...(data.fx ?? {}) },
    });
  },
  toJSON: () => {
    const { preset, volume, adsr, eq, fx } = get();
    return { preset, volume, adsr, eq, fx };
  },
}));
