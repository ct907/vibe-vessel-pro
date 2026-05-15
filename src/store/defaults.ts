import { create } from "zustand";

export type DefaultLandingTab = "lyrics" | "chords" | "progressions" | null;

export interface Defaults {
  /** Default chord length (in beats) when adding a chord to a pattern block. */
  defaultChordLengthBeats: number;
  /** Default bars per pattern block when creating new sections / pattern blocks. */
  defaultPatternBars: number;
  /** Default octave used when adding & auditioning chords. */
  defaultOctave: number;
  /** Tab to auto-open from the landing page. null = no auto-skip. */
  defaultLandingTab: DefaultLandingTab;
}

export const DEFAULTS_FALLBACK: Defaults = {
  defaultChordLengthBeats: 4,
  defaultPatternBars: 4,
  defaultOctave: 4,
  defaultLandingTab: null,
};

const STORAGE_KEY = "songwriters-notebook:defaults:v1";

function loadFromStorage(): Defaults {
  if (typeof localStorage === "undefined") return DEFAULTS_FALLBACK;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS_FALLBACK;
    const parsed = JSON.parse(raw);
    return {
      defaultChordLengthBeats: clamp(Number(parsed.defaultChordLengthBeats) || DEFAULTS_FALLBACK.defaultChordLengthBeats, 0.5, 16),
      defaultPatternBars: Math.max(1, Math.min(32, Math.round(Number(parsed.defaultPatternBars) || DEFAULTS_FALLBACK.defaultPatternBars))),
      defaultOctave: Math.max(2, Math.min(6, Math.round(Number(parsed.defaultOctave) || DEFAULTS_FALLBACK.defaultOctave))),
      defaultLandingTab: (["lyrics", "chords", "progressions"].includes(parsed.defaultLandingTab) ? parsed.defaultLandingTab : null) as DefaultLandingTab,
    };
  } catch {
    return DEFAULTS_FALLBACK;
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

interface DefaultsState extends Defaults {
  setDefaultChordLength: (n: number) => void;
  setDefaultPatternBars: (n: number) => void;
  setDefaultOctave: (n: number) => void;
  setDefaultLandingTab: (t: DefaultLandingTab) => void;
  reset: () => void;
}

const initial = loadFromStorage();

export const useDefaultsStore = create<DefaultsState>((set, get) => ({
  ...initial,
  setDefaultChordLength: (n) => set({ defaultChordLengthBeats: clamp(n, 0.5, 16) }),
  setDefaultPatternBars: (n) => set({ defaultPatternBars: Math.max(1, Math.min(32, Math.round(n))) }),
  setDefaultOctave: (n) => set({ defaultOctave: Math.max(2, Math.min(6, Math.round(n))) }),
  setDefaultLandingTab: (t) => set({ defaultLandingTab: t }),
  reset: () => set({ ...DEFAULTS_FALLBACK }),
}));

// Persist on every change.
useDefaultsStore.subscribe((s) => {
  try {
    const { defaultChordLengthBeats, defaultPatternBars, defaultOctave, defaultLandingTab } = s;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultChordLengthBeats, defaultPatternBars, defaultOctave, defaultLandingTab }),
    );
  } catch {
    /* ignore quota */
  }
});

/** Synchronous getters for use inside non-react code (store actions, etc). */
export function getDefaults(): Defaults {
  const s = useDefaultsStore.getState();
  return {
    defaultChordLengthBeats: s.defaultChordLengthBeats,
    defaultPatternBars: s.defaultPatternBars,
    defaultOctave: s.defaultOctave,
    defaultLandingTab: s.defaultLandingTab,
  };
}
