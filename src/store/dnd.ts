import { create } from "zustand";
import type { DropResult } from "@hello-pangea/dnd";

/**
 * Lightweight cross-tab DnD state. Routes DropResult events to the
 * appropriate per-tab handler. Chord-to-chord drag was removed; only
 * basket chips are draggable now.
 */
type Handler = (r: DropResult) => void;

interface DndState {
  clear: () => void;

  /** Per-tab drag-end handlers (registered by each tab on mount). */
  lyricsOnDragEnd: Handler | null;
  progressionsOnDragEnd: Handler | null;
  setLyricsOnDragEnd: (end: Handler | null) => void;
  setProgressionsHandlers: (end: Handler | null) => void;
}

export const useDndStore = create<DndState>((set) => ({
  clear: () => set({}),

  lyricsOnDragEnd: null,
  progressionsOnDragEnd: null,
  setLyricsOnDragEnd: (end) => set({ lyricsOnDragEnd: end }),
  setProgressionsHandlers: (end) => set({ progressionsOnDragEnd: end }),
}));
