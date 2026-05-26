## Defocus chord chip when "Play from here" is pressed

### Change
In `src/components/progressions/ProgressionsTab.tsx`, in the "Play from here" button's `onClick` (around line 644–648), call `onSetActiveChordId(null)` after triggering playback so the chord chip becomes defocused immediately when the button is pressed.

Updated handler:
```ts
onClick={(e) => {
  e.stopPropagation();
  usePlaybackStore.getState().setStartFromChord(pattern.id, c.id);
  window.dispatchEvent(new Event("lovable:request-play"));
  onSetActiveChordId(null);
}}
```

No other changes. The Play button only renders while `isActive`, so clearing the active id will also hide the button as a side effect (expected — the chip returns to its normal state).

### Verification
- `npx tsc --noEmit`
- In the Progressions tab: tap a chord → press the play-from-here button → chord chip loses its active outline and the play/delete affordances disappear; playback starts from that chord.