import { create } from "zustand";

/**
 * Lightweight cross-tab DnD state. Lives outside the React tree so the
 * single global <DragDropContext> in Index.tsx can read multi-drag info
 * (e.g. lyrics multi-select) regardless of which tab originated the drag.
 */
interface DndState {
  draggingIds: Set<string>;
  setDraggingIds: (ids: Set<string>) => void;
  clear: () => void;
}

export const useDndStore = create<DndState>((set) => ({
  draggingIds: new Set(),
  setDraggingIds: (ids) => set({ draggingIds: ids }),
  clear: () => set({ draggingIds: new Set() }),
}));
