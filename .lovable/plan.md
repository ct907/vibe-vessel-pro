## Fix mobile drag ghost offset (initialize pointer position immediately)

Apply the user's suggested approach to `src/components/lyrics/LyricsTab.tsx`.

### Changes

**1. `onDragStart` (~line 1508):** Before attaching `pointermove`/`touchmove` listeners, seed `pointerPosRef.current` from the dragged element's bounding rect center, so the very first render of the portalled clone has a valid pointer coordinate.

```ts
const el = document.querySelector(`[data-chip-anchor="${start.draggableId}"]`) as HTMLElement | null;
if (el) {
  const r = el.getBoundingClientRect();
  pointerPosRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
```

For basket drags (`basket:<id>`), fall back to `[data-basket-id="<id>"]` so basket→lyrics drags also seed correctly.

**2. Portalled clone render (~line 499):** Keep the existing pointer-follow transform. Add a safe fallback when `pointerPosRef.current` is still null on the very first frame: read the source draggable's rect via the inner ref and translate to its top-left, instead of letting Pangea's default transform kick in.

**3. Cleanup hardening:** Ensure the `__lvDndPointerCleanup` is invoked at the start of any new `onDragStart` (in case a previous drag aborted without firing `onDragEnd`), so stale listeners don't accumulate.

No other files are touched. Behavior on desktop is unchanged (the pointer was already tracked from mousedown). Mobile ghost will now appear under the finger from frame one.