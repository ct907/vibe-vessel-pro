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

/** Snapshot of the source element's bounding rect at drag-start. Captured
 *  in onBeforeDragStart while the source is still in the DOM, so the
 *  renderClone can position itself correctly on the very first frame even
 *  when pangea's draggableProps.style is briefly missing top/left. */
export interface DragSourceRect {
  draggableId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DndState {
  draggingIds: Set<string>;
  setDraggingIds: (ids: Set<string>) => void;
  clear: () => void;

  /** Bounding rect of the dragged element captured at drag-start. */
  sourceRect: DragSourceRect | null;
  setSourceRect: (rect: DragSourceRect | null) => void;

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
  clear: () => set({ draggingIds: new Set(), sourceRect: null }),

  sourceRect: null,
  setSourceRect: (rect) => set({ sourceRect: rect }),

  lyricsOnDragEnd: null,
  progressionsOnDragEnd: null,
  lyricsOnDragStart: null,
  setLyricsHandlers: (start, end) =>
    set({ lyricsOnDragStart: start, lyricsOnDragEnd: end }),
  setProgressionsHandlers: (end) => set({ progressionsOnDragEnd: end }),
}));
