import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  enabled: boolean;
  globalPhase: 0 | 1 | 2;
  lyricsStep: number;
  progressionsStep: number;
  newSongCount: number;
  showNewSongPrompt: boolean;
  dismissedKey: string | null;

  disable(): void;
  enable(): void;
  setGlobalPhase(p: 0 | 1 | 2): void;
  setLyricsStep(s: number): void;
  setProgressionsStep(s: number): void;
  incrementNewSong(): void;
  dismissNewSongPrompt(): void;
  dismissCoachMark(key: string): void;
  resetForNewSong(): void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      enabled: true,
      globalPhase: 0,
      lyricsStep: 0,
      progressionsStep: 0,
      newSongCount: 0,
      showNewSongPrompt: false,
      dismissedKey: null,

      disable: () => set({ enabled: false, showNewSongPrompt: false }),
      enable: () => set({ enabled: true, globalPhase: 2, dismissedKey: null }),
      setGlobalPhase: (p) => set({ globalPhase: p }),
      setLyricsStep: (s) => set({ lyricsStep: s }),
      setProgressionsStep: (s) => set({ progressionsStep: s }),
      incrementNewSong: () => {
        const count = get().newSongCount + 1;
        set({ newSongCount: count, showNewSongPrompt: count >= 1 });
      },
      dismissNewSongPrompt: () => set({ showNewSongPrompt: false }),
      dismissCoachMark: (key) => set({ dismissedKey: key }),
      resetForNewSong: () => {
        if (!get().enabled) return;
        set({
          globalPhase: 0,
          lyricsStep: 0,
          progressionsStep: 0,
          showNewSongPrompt: false,
          dismissedKey: null,
        });
      },
    }),
    { name: "felt:onboarding:v2" },
  ),
);
