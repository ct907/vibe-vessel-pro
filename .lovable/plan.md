## Root cause discovered (covers issues 1 + 2)

`BasketBar` is currently rendered **twice** when the Chords tab is active:

1. Once at the layout level in `src/pages/Index.tsx` (with `draggable={true}`, lives inside the global `DragDropContext`).
2. Once again at the bottom of `src/components/chords/ChordsTab.tsx` (with `draggable={false}` — the default).

Both are `fixed bottom-0 inset-x-0 z-30`, so they stack on top of each other. The non-draggable copy intercepts pointer events on some chips (the exact ones depend on render order / stacking), which explains:

- Issue 1: chips placed from the first row appear "not draggable" (the non-draggable overlay receives the touch) and the third chip shows a visual offset (two chips are rendered at slightly different positions when the draggable wrapper adds inline drag styles).
- Issue 2: the user has to drag once to "wake up" — that first drag is consumed by the non-draggable overlay; only after some state shuffles does the underlying draggable instance receive the next gesture.

Removing the duplicate is the primary fix. Everything else builds on that.

## 1. Remove duplicate BasketBar in ChordsTab

**File:** `src/components/chords/ChordsTab.tsx`
- Delete the `<BasketBar … />` render at the bottom of the component and its `import`.
- The layout-level `BasketBar` in `Index.tsx` already provides `onSendToLyrics` / `onSendToProgressions` for the active tab, so no functionality is lost.

This single change should resolve both Issue 1 (chip 2/3 visual + drag glitches) and most of Issue 2 (the "drag to confirm" extra step).

## 2. Make basket chips drag immediately on tap-after-select (Issue 2 confirmation)

**File:** `src/components/basket/BasketBar.tsx`

The current `onChipPointerDown` already returns early when the chip is selected, but the `cursor: snap.isDragging ? "grabbing" : "grab"` and the `opacity` change happen via inline style on the same element pangea is observing. We will:

- Keep the early-return-when-selected behaviour.
- Move the drag visual indicators (`opacity`, `cursor`) onto the inner `StaticChordChip` wrapper instead of the outer Draggable element so pangea's element identity stays 100% stable across selection toggles.
- Ensure no `key` on the Draggable changes when `selected` toggles (it already uses `b.id` — verified).
- Keep `touchAction: "none"` on the Draggable element so the browser doesn't claim the gesture as a scroll on the very first drag after selection.

Result: tap selects, the very next drag immediately moves the chip — no intermediate "wake-up" gesture.

## 3. BasketBar header layout (Issue 3)

**File:** `src/components/basket/BasketBar.tsx`

Restructure the top row of the basket:

- Row A (own line): `Basket · N` count label + the action buttons cluster (`Clear selection`, `Discard`, `To Lyrics`, `To Progressions`).
- Row B (own line, full width below Row A): the helper text — `Tap to select · long-press selected to drag` / `N selected · drag any to move {all}` (note: "long-press" wording will be updated to plain "drag" since chips are now immediately draggable after selection).

Implementation: split the existing `flex flex-col` inside the header into two `<div>` rows; move the helper `<span>` out of its current sibling-stack into its own row.

## 4. Add non-sticky "SongNote" app title (Issue 4)

**File:** `src/pages/Index.tsx`

Add a new heading element above the `<TransportHeader />`:

```tsx
<div className="mx-auto w-full max-w-6xl px-4 pt-3">
  <h1 className="font-display" style={{ fontSize: "28px", lineHeight: 1 }}>
    SongNote
  </h1>
</div>
<TransportHeader … />
```

- Placed as a normal block flow element (not `sticky`/`fixed`), so it scrolls away naturally.
- `TransportHeader` keeps its existing `sticky top-2` behaviour and remains pinned after the title scrolls off.
- Uses the existing `font-display` family token (title font style) at exactly 28px as requested.
- Convert the existing `sr-only` `<h1>` inside `<main>` to an `<h2>` so we don't ship two visible/structural h1s.

## Files touched

- `src/components/chords/ChordsTab.tsx` — remove duplicate BasketBar + import.
- `src/components/basket/BasketBar.tsx` — drag-handle stability tweak + header restructure (2 rows) + helper text wording update.
- `src/pages/Index.tsx` — add non-sticky `SongNote` title; demote `sr-only` h1 → h2.

## Out of scope

- No changes to the Lyrics or Progressions tabs.
- No changes to the chord color system, picker sheet, or audio engine.
