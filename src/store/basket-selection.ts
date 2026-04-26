import { create } from "zustand";

/**
 * Selection set for basket chips. Lives outside the React tree so the
 * single global DragDropContext (and the per-tab drop handlers) can read
 * it during a drag without prop drilling.
 *
 * UX rules (see BasketBar):
 *  - Quick tap on a chip toggles its membership in this set.
 *  - Only selected chips are draggable (their dragHandleProps is wired up).
 *  - When a selected chip is dragged, the drop handler reads the whole
 *    selection and places every selected chord into consecutive slots,
 *    starting at the drop slot.
 *  - After a successful drop, the selection clears.
 */
interface BasketSelectionState {
  selected: Set<string>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
  /** Resolve the set of items a drag should carry. If the dragged id is in
   *  the selection we drag everything; otherwise just the dragged id. */
  resolveDragIds: (draggedId: string) => string[];
}

export const useBasketSelectionStore = create<BasketSelectionState>((set, get) => ({
  selected: new Set(),
  has: (id) => get().selected.has(id),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  clear: () => set({ selected: new Set() }),
  resolveDragIds: (draggedId) => {
    const sel = get().selected;
    if (sel.has(draggedId) && sel.size > 1) return Array.from(sel);
    return [draggedId];
  },
}));
