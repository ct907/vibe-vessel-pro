# Play From Here button on active chord

Replace the round info button that appears on the active chord chip in the Progressions tab with a play-icon button that anchors the transport playhead to that chord and starts playback. The Stop button in the transport header already clears the start anchor, so the next play after a stop will start from the very first chord of the song — no extra change needed there.

## Changes

### `src/components/progressions/ProgressionsTab.tsx`
- Swap the `Info` lucide import for `Play` (keep other icons as-is).
- In the active-chord overlay button (currently the `-top-1.5 -left-1.5` info button around line 636–656):
  - Replace `<Info …/>` with `<Play className="h-3.5 w-3.5 fill-current" />`.
  - Change `aria-label` to `"Play from here"`.
  - Replace the onClick body with:
    ```ts
    e.stopPropagation();
    usePlaybackStore.getState().setStartFromChord(pattern.id, c.id);
    window.dispatchEvent(new Event("lovable:request-play"));
    ```
  - Drop the `setWhyChord(...)` call and the `nextChord` lookup that fed it (only used by this button).

No other behaviour touched. `WhyThisChordSheet` access from the Chords tab is untouched; the sheet/state declarations in ProgressionsTab can stay (used by long-press / other flows) — only this one button's handler is rewritten.

### `src/components/header/TransportHeader.tsx`
No change. `handleStop` already calls `usePlaybackStore.getState().setStartFromChord(null, null)`, so pressing Stop and then Play restarts from the first chord of the whole song.

## Verification
- `npx tsc --noEmit` passes.
- Active chord chip in Progressions shows a play triangle in the top-left badge instead of an info "i".
- Tapping it starts playback from that chord (transport flips to Playing, orange playhead lands on the tapped chord).
- Pressing Stop in the transport, then Play, starts from the first chord of the song.
