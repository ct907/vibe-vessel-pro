## Problem

In `VoiceLeadingLinesPanel.tsx`, the SVG uses `preserveAspectRatio="none"` with a fixed viewBox width (`n * 100`). When the panel renders at a different actual pixel width, the browser stretches the SVG horizontally — distorting the diamond/pentagon/square/circle shapes and the note labels.

## Fix

Stop letting the SVG scale on the x-axis. Measure the container width and render markers/lines at real pixel coordinates so shapes and text keep their natural size.

### Changes in `src/components/progressions/VoiceLeadingLinesPanel.tsx`

1. Add a container ref + `ResizeObserver` to track the actual pixel width of the panel.
2. Compute per-chord x positions from that measured width: `colX[i] = (i + 0.5) * (width / n)`.
3. Render the SVG with:
   - `width={measuredWidth}` and `height={height}` (no percentage width)
   - `viewBox="0 0 measuredWidth height"` 
   - Remove `preserveAspectRatio="none"` (use default `xMidYMid meet`, which now has nothing to stretch since viewBox matches pixel size)
4. Use `colX[i]` for marker `x` and line `x1/x2` instead of `i * 100 + 50`.
5. Keep the `vectorEffect="non-scaling-stroke"` (harmless) and current y math untouched.

Result: marker shapes stay circular/diamond/etc. at their authored 12px radius and note labels render at 10px regardless of panel width.

## Out of scope

No changes to layout math, colors, toggle behavior, or `ProgressionsTab.tsx`.