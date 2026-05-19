import { create } from "zustand";

/**
 * Lightweight global UI state. Tracks whether the FocusedChordEditor
 * (used by both LyricsTab and ProgressionsTab) is open so reflow watchdogs
 * can pause without coupling to window events. Also tracks whether the
 * floating chord toolbar is expanded so the tab switcher can block tab
 * changes while the user is mid-edit.
 */
interface UIState {
  focusedEditorOpen: boolean;
  setFocusedEditorOpen: (open: boolean) => void;
  toolbarExpanded: boolean;
  setToolbarExpanded: (open: boolean) => void;
  multiSelectMode: boolean;
  setMultiSelectMode: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  focusedEditorOpen: false,
  setFocusedEditorOpen: (open) => set({ focusedEditorOpen: open }),
  toolbarExpanded: false,
  setToolbarExpanded: (open) => set({ toolbarExpanded: open }),
  multiSelectMode: false,
  setMultiSelectMode: (v) => set({ multiSelectMode: v }),
}));
