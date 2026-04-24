import { useCallback, useState } from "react";

/**
 * Tiny multi-select helper for DnD surfaces (chord row, pattern blocks).
 *
 * Pangea drags one item at a time. The standard pattern for "drag many" is:
 *  - keep a `Set<id>` of selected items
 *  - when a drag starts on an id that IS in the set → operate on the whole set
 *  - when a drag starts on an id that is NOT in the set → clear and operate on
 *    just that id
 *  - render a "+N" badge on the dragging clone via `<Draggable renderClone>`
 */
export function useDndSelection<T extends string = string>() {
  const [selected, setSelected] = useState<Set<T>>(new Set());

  const has = useCallback((id: T) => selected.has(id), [selected]);
  const clear = useCallback(() => setSelected(new Set()), []);
  const set = useCallback((ids: T[]) => setSelected(new Set(ids)), []);
  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const add = useCallback((id: T) => {
    setSelected((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  /** Resolve drag scope: if `id` is selected, the drag carries the whole set; otherwise just `id`. */
  const resolveDragIds = useCallback(
    (id: T): T[] => {
      if (selected.has(id) && selected.size > 1) return Array.from(selected);
      return [id];
    },
    [selected],
  );

  return { selected, has, clear, set, add, toggle, resolveDragIds, size: selected.size };
}
