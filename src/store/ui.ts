import { create } from "zustand";

/**
 * Lightweight global UI state. Currently tracks whether the
 * FocusedChordEditor (used by both LyricsTab and ProgressionsTab) is open
 * so reflow watchdogs can pause without coupling to window events.
 */
interface UIState {
  focusedEditorOpen: boolean;
  setFocusedEditorOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  focusedEditorOpen: false,
  setFocusedEditorOpen: (open) => set({ focusedEditorOpen: open }),
}));
