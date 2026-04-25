# Chord Row: Strict Composition vs Edit Mode + Dynamic Scroll Offset

Refactor `LineRow` in `src/components/lyrics/LyricsTab.tsx` so that the Pencil button no longer creates conflicting UI (picker + selection toolbar simultaneously), and replace the hardcoded 140px scroll offset with a dynamic header-aware calculation.

## 1. State separation (per-row in `LineRow`)

Add a new local state alongside the existing `selection` (which already tracks `selectedChords`):

```tsx
const [isEditMode, setIsEditMode] = useState(false);
```

The existing `selection` (from `useDndSelection`) plays the role of `selectedChords`. The picker open state already lives in the parent (`picker` in `LyricsTab`) — the row signals it via `onPickerOpen`. We'll add a sibling `onPickerClose` callback (or have the parent close when `picker.lineId` changes) so the row can force-close the picker when entering Edit Mode.

- Add an `onPickerClose: () => void` prop to `LineRowProps`.
- In the parent `LyricsTab`, pass `() => setPicker(null)`.

## 2. Pencil button → `toggleEditMode`

Replace the current pencil `onClick` (which selects all chords AND opens the picker) with:

```tsx
onClick={(e) => {
  e.stopPropagation();
  onChordFocus(line.id);
  setIsEditMode((prev) => {
    const next = !prev;
    if (next) {
      // Entering Edit Mode: close picker + blur active input
      onPickerClose();
      (document.activeElement as HTMLElement | null)?.blur?.();
      // Pre-select all chords on this row so the context toolbar appears
      if (line.chords.length > 0) selection.set(line.chords.map((c) => c.id));
    } else {
      // Exiting Edit Mode: clear selection
      selection.clear();
    }
    return next;
  });
}}
```

Add a visual-active style to the pencil button when `isEditMode` is true (e.g. `text-primary bg-primary/10`).

## 3. Slot / chord click handlers — gated by `isEditMode`

**Chord row container `onClick`** (empty-area tap that currently opens the picker at slot 0):
```tsx
onClick={(e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-chip-anchor]")) return;
  if (t.closest("[data-slot-index]")) return;
  if (isEditMode) return; // never open picker in Edit Mode
  setFocusedPattern(null);
  onChordFocus(line.id);
  onPickerOpen(line.id, 0);
}}
```

**Empty slot `onClick`**:
```tsx
onClick={(e) => {
  if (occupied) return;
  e.stopPropagation();
  if (isEditMode) return; // never open picker in Edit Mode
  onChordFocus(line.id);
  onPickerOpen(line.id, slotIdx);
}}
```

**Existing chord chip `onClick`** — split behavior on `isEditMode`:
```tsx
onClick={(e) => {
  e.stopPropagation();
  // Modifier-key paths still always work as multi-select shortcuts
  if (e.shiftKey) { selectRangeTo(anchor!.id, true); return; }
  if (e.metaKey || e.ctrlKey) {
    selection.toggle(anchor!.id);
    lastSelectedRef.current = anchor!.id;
    return;
  }

  if (isEditMode) {
    // EDIT MODE: tap toggles selection only — never opens picker, never auditions
    selection.toggle(anchor!.id);
    lastSelectedRef.current = anchor!.id;
    return;
  }

  // COMPOSITION MODE: audition + open picker for that chord
  void playChord(anchor!.chord);
  onChordFocus(line.id);
  onPickerOpen(line.id, slotIdx, anchor!.id);
}}
```

The selection toolbar (already rendered when `selection.size > 0`) becomes the "floating Context Menu" — no separate component needed. Add a "Done" button in the toolbar that calls `setIsEditMode(false)` + `selection.clear()` so the user can exit Edit Mode from the toolbar too.

## 4. Dynamic scroll-to-focus

**Add an ID to the sticky header** in `src/components/header/TransportHeader.tsx`:
```tsx
<header id="main-header" className="sticky top-2 z-40 ...">
```

**Add scroll-margin to the row container** in `LineRow`:
```tsx
<div ref={rowRef} className={cn("group py-1 transition-colors scroll-mt-24", ...)} ...>
```

**Replace the scroll effect** (lines ~168–194):
```tsx
useEffect(() => {
  // Skip entirely in Edit Mode — selecting chips shouldn't move the page.
  if (!active || isEditMode || !rowRef.current) return;
  const el = rowRef.current;
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const scrollIntoView = () => {
    if (!el.isConnected) return;
    const header = document.getElementById("main-header");
    const headerHeight = header ? header.getBoundingClientRect().height : 60;
    const targetTop = (vv?.offsetTop ?? 0) + headerHeight + 16;
    const rect = el.getBoundingClientRect();
    const delta = rect.top - targetTop;
    if (Math.abs(delta) < 2) return;
    window.scrollBy({ top: delta, behavior: "smooth" });
  };
  scrollIntoView();
  const settle = window.setTimeout(scrollIntoView, 200);
  if (vv) {
    vv.addEventListener("resize", scrollIntoView);
    vv.addEventListener("scroll", scrollIntoView);
  }
  return () => {
    window.clearTimeout(settle);
    if (vv) {
      vv.removeEventListener("resize", scrollIntoView);
      vv.removeEventListener("scroll", scrollIntoView);
    }
  };
}, [active, isEditMode]);
```

## 5. Auto-exit Edit Mode

To avoid stale state, clear `isEditMode` when the row loses `active` status (e.g. user taps another row):
```tsx
useEffect(() => {
  if (!active && isEditMode) {
    setIsEditMode(false);
    selection.clear();
  }
}, [active]);
```

## Files to edit
- `src/components/lyrics/LyricsTab.tsx` — `LineRow` state, pencil handler, slot/chip click gating, scroll effect, toolbar "Done" button, parent passes `onPickerClose`.
- `src/components/header/TransportHeader.tsx` — add `id="main-header"` to the `<header>`.

## Out of scope
- No store changes.
- No changes to drag-and-drop logic; DnD continues to work in both modes (chips remain Draggable).
- ProgressionsTab is not touched.
