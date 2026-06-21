import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  enabled: boolean;
  globalPhase: 0 | 1 | 2;
  /** Capture-phase walkthrough (record → take → reveal editor), shared by Write
   *  and Arrange since only the active mode is mounted. 0 = off. */
  captureStep: number;
  lyricsStep: number;
  progressionsStep: number;
  /** Cross-cutting feature tour (sound → voice key → export → finish) shown once
   *  after the first branch's content steps. 0 = off. */
  featureStep: number;
  /** Set once the feature tour has run so the second branch skips it. */
  featureDone: boolean;
  newSongCount: number;
  showNewSongPrompt: boolean;
  dismissedKey: string | null;

  disable(): void;
  enable(): void;
  setGlobalPhase(p: 0 | 1 | 2): void;
  setCaptureStep(s: number): void;
  setLyricsStep(s: number): void;
  setProgressionsStep(s: number): void;
  setFeatureStep(s: number): void;
  markFeatureDone(): void;
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
      captureStep: 0,
      lyricsStep: 0,
      progressionsStep: 0,
      featureStep: 0,
      featureDone: false,
      newSongCount: 0,
      showNewSongPrompt: false,
      dismissedKey: null,

      disable: () => set({ enabled: false, showNewSongPrompt: false }),
      enable: () => set({ enabled: true, globalPhase: 2, dismissedKey: null }),
      setGlobalPhase: (p) => set({ globalPhase: p }),
      setCaptureStep: (s) => set({ captureStep: s }),
      setLyricsStep: (s) => set({ lyricsStep: s }),
      setProgressionsStep: (s) => set({ progressionsStep: s }),
      setFeatureStep: (s) => set({ featureStep: s }),
      markFeatureDone: () => set({ featureDone: true }),
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
          captureStep: 0,
          lyricsStep: 0,
          progressionsStep: 0,
          featureStep: 0,
          featureDone: false,
          showNewSongPrompt: false,
          dismissedKey: null,
        });
      },
    }),
    { name: "felt:onboarding:v2" },
  ),
);
