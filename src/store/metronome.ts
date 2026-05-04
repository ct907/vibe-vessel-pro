import { create } from "zustand";

const STORAGE_KEY = "songwriters-notebook:metronome:v1";

interface Persist {
  enabled: boolean;
  volume: number;
}

const FALLBACK: Persist = { enabled: false, volume: 0.6 };

function load(): Persist {
  if (typeof localStorage === "undefined") return FALLBACK;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK;
    const p = JSON.parse(raw);
    return {
      enabled: !!p.enabled,
      volume: Math.max(0, Math.min(1, Number(p.volume) || FALLBACK.volume)),
    };
  } catch {
    return FALLBACK;
  }
}

interface State extends Persist {
  setEnabled: (b: boolean) => void;
  setVolume: (v: number) => void;
}

export const useMetronomeStore = create<State>((set) => ({
  ...load(),
  setEnabled: (b) => set({ enabled: b }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
}));

useMetronomeStore.subscribe((s) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ enabled: s.enabled, volume: s.volume }),
    );
  } catch {
    /* ignore quota */
  }
});
