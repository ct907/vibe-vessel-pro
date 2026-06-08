import { create } from "zustand";
import type { ChordSymbol } from "@/lib/music/chords";

/**
 * Lightweight global UI state. Tracks whether the FocusedChordEditor
 * (used by both LyricsTab and ProgressionsTab) is open so reflow watchdogs
 * can pause without coupling to window events. Also tracks whether the
 * floating chord toolbar is expanded so the tab switcher can block tab
 * changes while the user is mid-edit.
 */
export interface WhyChordRequest {
  chord: ChordSymbol;
  /** When present, the sheet's "Replace in song" action targets this chord. */
  patternId?: string;
  chordId?: string;
  /** Next chord in the progression sequence — enables the Transition feel section. */
  nextChord?: ChordSymbol;
}

export type TabName = "lyrics" | "chords" | "progressions" | "recordings" | "voicekey";

/** Direction A primary navigation: Capture (write) ↔ Refine (arrange). */
export type AppMode = "write" | "arrange";
/** Arrange sub-view, chosen in the song-meta row. */
export type ArrangeView = "track" | "chords";

interface UIState {
  focusedEditorOpen: boolean;
  setFocusedEditorOpen: (open: boolean) => void;
  toolbarExpanded: boolean;
  setToolbarExpanded: (open: boolean) => void;
  multiSelectMode: boolean;
  setMultiSelectMode: (v: boolean) => void;
  whyChord: WhyChordRequest | null;
  setWhyChord: (req: WhyChordRequest | null) => void;
  activeTab: TabName | null;
  setActiveTab: (tab: TabName | null) => void;
  mode: AppMode;
  setMode: (m: AppMode) => void;
  arrangeView: ArrangeView;
  setArrangeView: (v: ArrangeView) => void;
  /** One-shot signal: WriteStickyBar requests FloatingChordToolbar to expand. */
  chordToolbarOpen: boolean;
  setChordToolbarOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  focusedEditorOpen: false,
  setFocusedEditorOpen: (open) => set({ focusedEditorOpen: open }),
  toolbarExpanded: false,
  setToolbarExpanded: (open) => set({ toolbarExpanded: open }),
  multiSelectMode: false,
  setMultiSelectMode: (v) => set({ multiSelectMode: v }),
  whyChord: null,
  setWhyChord: (req) => set({ whyChord: req }),
  activeTab: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  mode: "write",
  setMode: (mode) => set({ mode }),
  arrangeView: "track",
  setArrangeView: (arrangeView) => set({ arrangeView }),
  chordToolbarOpen: false,
  setChordToolbarOpen: (v) => set({ chordToolbarOpen: v }),
}));

