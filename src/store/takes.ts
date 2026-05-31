import { create } from "zustand";
import { nanoid } from "nanoid";

/**
 * Write-mode "recordings strip" model — a flat library of song-level takes,
 * distinct from the multitrack `recordings` store (which holds clips placed
 * on the Arrange timeline). Up to {@link MAX_BEST_TAKES} can be starred as
 * "best takes"; the Arrange/Track view surfaces those starred takes in its
 * clipboard tray.
 *
 * This is UI state only — the takes carry display metadata (name, date,
 * duration, a waveform seed) but no audio blob. Real capture wires in later.
 */
export interface Take {
  id: string;
  name: string;
  date: string;
  /** Display duration, e.g. "0:12". */
  duration: string;
  /** Deterministic seed for the placeholder waveform. */
  seed: number;
  best: boolean;
}

export const MAX_BEST_TAKES = 3;

interface TakesState {
  takes: Take[];
  bestCount: () => number;
  toggleBest: (id: string) => void;
  addTake: (name?: string) => string;
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
  addTake: (name) => {
    const id = nanoid();
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    set((s) => ({
      takes: [
        { id, name: name ?? "New take", date: `Today · ${time}`, duration: "0:00", seed: Math.floor(Math.random() * 100), best: false },
        ...s.takes,
      ],
    }));
    return id;
  },
  removeTake: (id) => set((s) => ({ takes: s.takes.filter((t) => t.id !== id) })),
  clear: () => set({ takes: [] }),
}));
