import { createPortal } from "react-dom";
import { useOnboardingStore } from "@/store/onboarding";

export function SkipTutorialButton() {
  const enabled = useOnboardingStore((s) => s.enabled);
  const globalPhase = useOnboardingStore((s) => s.globalPhase);
  const lyricsStep = useOnboardingStore((s) => s.lyricsStep);
  const progressionsStep = useOnboardingStore((s) => s.progressionsStep);
  const disable = useOnboardingStore((s) => s.disable);

  const inTutorial =
    enabled &&
    (globalPhase < 2 ||
      (lyricsStep >= 1 && lyricsStep <= 5) ||
      (progressionsStep >= 1 && progressionsStep <= 5));

  if (!inTutorial) return null;

  return createPortal(
    <button
      type="button"
      onClick={() => disable()}
      className="fixed bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-display font-semibold transition-colors hover:brightness-110"
      style={{
        zIndex: 10000,
        background: "var(--destructive)",
        color: "var(--paper)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      Skip Tutorial
    </button>,
    document.body,
  );
}
