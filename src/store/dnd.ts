import { create } from "zustand";
import type { DropResult } from "@hello-pangea/dnd";

/**
 * Lightweight cross-tab DnD state. Lives outside the React tree so the
 * single global <DragDropContext> in Index.tsx can read multi-drag info
 * (e.g. lyrics multi-select) regardless of which tab originated the drag,
 * and route DropResult events back to the appropriate per-tab handler.
 */
type Handler = (r: DropResult) => void;
type StartHandler = (start: { draggableId: string }) => void;

interface DndState {
  draggingIds: Set<string>;
  setDraggingIds: (ids: Set<string>) => void;
  clear: () => void;

  /** Per-tab drag-end handlers (registered by each tab on mount). */
  lyricsOnDragEnd: Handler | null;
  progressionsOnDragEnd: Handler | null;
  lyricsOnDragStart: StartHandler | null;
  setLyricsHandlers: (start: StartHandler | null, end: Handler | null) => void;
  setProgressionsHandlers: (end: Handler | null) => void;
}

export const useDndStore = create<DndState>((set) => ({
  draggingIds: new Set(),
  setDraggingIds: (ids) => set({ draggingIds: ids }),
  clear: () => set({ draggingIds: new Set() }),

  lyricsOnDragEnd: null,
  progressionsOnDragEnd: null,
  lyricsOnDragStart: null,
  setLyricsHandlers: (start, end) =>
    set({ lyricsOnDragStart: start, lyricsOnDragEnd: end }),
  setProgressionsHandlers: (end) => set({ progressionsOnDragEnd: end }),
}));
