## Goal

Chord Explorer should have exactly two pages:

1. **Starting Page** — pick a key (auditions tonic), then pick a quality (Major / Minor / Dim). After quality is picked, jump straight to the progression page.
2. **Progression Page** — Voice Leading section (with hiker) starts empty and waits for a starting chord; Choose Your Path section shows diatonic chords as starter options.

The current intermediate state (`started === true` but `steps.length === 0`) creates a third page where Choose Your Path shows diatonic starters and Voice Leading shows a typed-chord prompt. That middle page must be removed.

## Changes

### `src/pages/ChordExplorer.tsx`
- Remove the `started` state entirely.
- Combine the start screen into one card containing both selectors, but only render the quality picker once a key is selected. Actually, simpler: keep the existing "Starting Key" card, and move the quality picker into the same start screen (rendered conditionally after the user has tapped a key; since `keyRoot` defaults to "C", gate on a new `keyPicked` local state OR collapse the gating into the existing flow).
- When the user picks a quality on the start page, call `addStarter(keyRoot, quality)` so the progression page lands with one starter chord… **No** — the user explicitly said the Voice Leading section should be empty. So instead, picking a quality should just set `mode` and trigger a transition to the progression page where `steps` is empty.
- To transition to the progression page with empty steps, we need a flag. Reuse a single `phase` state: `"start" | "progression"`. Replace `started` with `phase`. The start screen renders when `phase === "start"`. The progression page (Voice Leading + Choose Your Path) renders when `phase === "progression"`.
- `handleBack`: if `phase === "progression"`, reset to `"start"` and clear `steps`; else navigate to `/`.

### `src/components/explorer/SuggestionPalette.tsx`
- Remove the `!started` branch (the quality picker UI) — quality picking now happens on the start page.
- Keep the `steps.length === 0 && started` branch (diatonic starter chords) and rename the prop from `started` to something reflecting it always renders this when empty. Simplest: drop the `started`/`onPickQuality` props entirely. When `steps.length === 0`, always render the diatonic starter palette.

### `src/components/explorer/VoiceLeadingChart.tsx`
- No change. The existing empty state (heading + "Type a chord or pick one below" + ChordInput) is exactly what's needed for the empty progression page.

### Start page layout (in `ChordExplorer.tsx`)
- Card 1: "Starting Key" with note buttons + Maj/Min toggle (existing). Tapping a key sets `keyRoot` and plays tonic (existing `changeKey`).
- Card 2: "Pick a Quality for {keyRoot}" with three buttons (Major / Minor / Dim), each with a speaker icon to audition `{keyRoot}{suffix}` and the main button to confirm. This is the UI currently inside `SuggestionPalette`'s `!started` branch — move it into the start page.
- On quality pick: set `mode` accordingly (`maj` → maj, `min` → min, `dim` → keep mode but pick a dim starter? — per the user's flow, dim is just a quality choice; treat it the same as min for `mode` since there's no dim mode, OR keep current behavior of `pickQuality` which sets `mode = "maj" | "min"` and ignores dim's distinction). Then set `phase = "progression"`.

### Cleanup
- `addStarter` stays (called from `SuggestionPalette` diatonic buttons).
- `pickQuality` simplified: set mode + `phase = "progression"`.
- Hiker on empty progression: `VoiceLeadingChart`'s empty state currently does not show the hiker. The user mentioned the Voice Leading section "containing the hiker avatar" — the hiker currently only renders when there are steps. Acceptable to leave as-is since the empty state shows the prompt; hiker appears once a chord exists. Confirm with user if needed, but proceeding without adding an empty-state hiker keeps scope tight.

## Result

Two pages, matching the requested flow. No more middle "pick a starting chord" page.
