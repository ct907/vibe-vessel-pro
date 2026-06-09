import { create } from "zustand";
import { nanoid } from "nanoid";

export interface Take {
  id: string;
  name: string;
  date: string;
  /** Formatted display duration, e.g. "0:12". */
  duration: string;
  durationSec: number;
  /** Deterministic seed for the waveform visualisation. */
  seed: number;
  best: boolean;
  /** IndexedDB key for the real audio blob, absent for placeholder takes. */
  blobId?: string;
  /** MIME type of the audio blob, e.g. "audio/wav". */
  mime?: string;
}

export const MAX_BEST_TAKES = 3;

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TakesState {
  takes: Take[];
  bestCount: () => number;
  toggleBest: (id: string) => void;
  addTake: (opts?: { name?: string; blobId?: string; durationSec?: number; mime?: string }) => string;
  removeTake: (id: string) => void;
  clear: () => void;
}

export const useTakesStore = create<TakesState>((set, get) => ({
  takes: [],
  bestCount: () => get().takes.filter((t) => t.best).length,
  toggleBest: (id) =>
    set((s) => {
      const target = s.takes.find((t) => t.id === id);
      if (!target) return s;
      if (!target.best && s.takes.filter((t) => t.best).length >= MAX_BEST_TAKES) return s;
      return { takes: s.takes.map((t) => (t.id === id ? { ...t, best: !t.best } : t)) };
    }),
  addTake: (opts = {}) => {
    const { name, blobId, durationSec = 0, mime } = opts;
    const id = nanoid();
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    set((s) => ({
      takes: [
        {
          id,
          name: name ?? `Take ${s.takes.length + 1}`,
          date: `Today · ${time}`,
          duration: fmtDuration(durationSec),
          durationSec,
          seed: Math.floor(Math.random() * 100),
          best: false,
          blobId,
          mime,
        },
        ...s.takes,
      ],
    }));
    return id;
  },
  removeTake: (id) => set((s) => ({ takes: s.takes.filter((t) => t.id !== id) })),
  clear: () => set({ takes: [] }),
}));
