import { create } from "zustand";

/**
 * Lightweight playback state, kept separate from the song store to avoid
 * triggering history snapshots / re-renders of unrelated state on every
 * playhead update.
 */
export interface PlaybackEvent {
  /** Pattern block id the chord lives in. */
  patternId: string;
  /** PatternChord id currently sounding. */
  patternChordId: string;
  /** mirrorId on the pattern chord (== ChordAnchor id in lyrics), if any. */
  mirrorId?: string;
}

interface PlaybackState {
  isPlaying: boolean;
  /** Pattern block currently focused as the playback start point. */
  focusedPatternId: string | null;
  /** Currently sounding chord (drives the orange playhead). */
  current: PlaybackEvent | null;

  setFocusedPattern: (id: string | null) => void;
  setIsPlaying: (b: boolean) => void;
  setCurrent: (e: PlaybackEvent | null) => void;
  reset: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isPlaying: false,
  focusedPatternId: null,
  current: null,
  setFocusedPattern: (id) => set({ focusedPatternId: id }),
  setIsPlaying: (b) => set({ isPlaying: b, ...(b ? {} : { current: null }) }),
  setCurrent: (e) => set({ current: e }),
  reset: () => set({ isPlaying: false, current: null }),
}));
