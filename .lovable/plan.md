# UI Polish & Interaction Fixes

Four small, isolated patches across three files. No logic refactors.

## 1. BasketBar — fix "drag-after-select needs two gestures"

**File:** `src/components/basket/BasketBar.tsx`

The current `<Draggable>` wrapper applies a `cn(snap.isDragging && "opacity-90")` className AND swaps from `<ChordChip>` (when `!draggable`) vs `StaticChordChip` inside the inner div based on selection-related re-renders. The selection toggle (`toggleSelected`) updates Zustand → re-renders the Draggable child → its inner `<StaticChordChip>` receives a new `selected` prop, which changes its className. Pangea's pointer sensor is fine with className changes on the handle node itself, BUT the `aria-pressed` and `aria-label` on the wrapper div ALSO change on selection — which is harmless — however the real culprit is that `tapInfo.current` is set on `pointerdown`, and on `pointerup` after a successful tap we call `toggleSelected`. The very next `pointerdown` (the user's drag attempt) starts on a freshly re-rendered DOM node. Pangea relies on the dragHandle's stable identity across the gesture; the tap's pointerup already ended the gesture, so the next pointerdown should work — UNLESS our `touchAction: "none"` + tap detector is consuming the initial movement.

**Root cause:** `tapInfo.current` is left dangling after a real tap completes (we set it to `null` correctly), but on touch devices the tap-to-select pointerup fires *before* pangea's long-press timer would, and the immediate follow-up touchstart re-enters `onChipPointerDown` setting a fresh `tapInfo`. If the user then drags within `TAP_MAX_MS` (300ms) AND `TAP_MAX_PX` (8px), `onChipPointerUp` will call `toggleSelected` again — DESELECTING the chip — instead of committing the drag. Pangea's drag may also have started, but the deselection on release makes it look like "the first drag did nothing."

**Fix:**
- When the chip is already selected on `pointerdown`, skip arming `tapInfo` so any subsequent movement goes straight to pangea's drag sensor without our tap detector competing.
- Equivalently: in `onChipPointerUp`, if `selected` is already true, do NOT toggle on a second tap unless the user clearly intends to deselect (we'll accept this minor UX trade — selected chips toggle off only via the explicit "Clear selection" button or by a tap that doesn't move).
- Keep DOM identity stable: do NOT change keys or wrapper structure based on `sel`. Move the `aria-pressed` and `aria-label` updates to data attributes only (no structural change). The current code already keeps the same `<div ref={prov.innerRef}>` — good — but we'll remove the `cn(snap.isDragging && "opacity-90")` className swap (apply opacity via style instead) so React doesn't reconcile className mid-gesture.

Concretely:
- In `onChipPointerDown`: `if (isSelected(id)) { tapInfo.current = null; return; }`
- Replace `className={cn(snap.isDragging && "opacity-90")}` with `style={{ ...prov.draggableProps.style, opacity: snap.isDragging ? 0.9 : 1, ... }}`.

## 2. BasketBar — fully opaque background

**File:** `src/components/basket/BasketBar.tsx` (line ~146)

Change:
```
bg-paper-shade/95 backdrop-blur shadow-[...]
```
to:
```
bg-paper-shade shadow-[...]
```
Drop the `/95` alpha and `backdrop-blur`.

## 3. "Add to basket" button — charcoal style

**File:** `src/components/chords/ChordsTab.tsx` (line 229)

Replace:
```
className="h-12 bg-indigo-300 text-chord-chip-foreground shadow-lg shadow-indigo-300 text-base px-6 py-6"
```
with:
```
className="h-12 bg-zinc-800 text-zinc-50 hover:bg-zinc-700 shadow-lg text-base px-6 py-6"
```

## 4. FocusedChordEditor header — header-sized

**File:** `src/components/lyrics/FocusedChordEditor.tsx` (lines 164–169)

- Keep the small "Slot N of M · adding/editing" caption as-is (it's the eyebrow).
- Change the `<h2>` from `text-sm font-semibold` to `text-xl font-bold`.

## Files touched

- `src/components/basket/BasketBar.tsx` — fixes 1 & 3
- `src/components/chords/ChordsTab.tsx` — fix 2
- `src/components/lyrics/FocusedChordEditor.tsx` — fix 4

No store, no types, no test changes.
