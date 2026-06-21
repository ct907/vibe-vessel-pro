import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useOnboardingStore } from "@/store/onboarding";
import { useUIStore } from "@/store/ui";

export function SkipTutorialButton() {
  const enabled = useOnboardingStore((s) => s.enabled);
  const globalPhase = useOnboardingStore((s) => s.globalPhase);
  const captureStep = useOnboardingStore((s) => s.captureStep);
  const lyricsStep = useOnboardingStore((s) => s.lyricsStep);
  const progressionsStep = useOnboardingStore((s) => s.progressionsStep);
  const featureStep = useOnboardingStore((s) => s.featureStep);
  const disable = useOnboardingStore((s) => s.disable);
  const activeTab = useUIStore((s) => s.activeTab);
  const { pathname } = useLocation();

  const inTutorial =
    enabled &&
    (globalPhase < 2 ||
      captureStep > 0 ||
      featureStep > 0 ||
      (activeTab === "lyrics" && lyricsStep >= 1 && lyricsStep <= 5) ||
      (activeTab === "progressions" && progressionsStep >= 1 && progressionsStep <= 5));

  if (!inTutorial || pathname === "/") return null;

  return createPortal(
    <button
      type="button"
      onClick={() => disable()}
      className="btn-sculpt-cream fixed bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-display font-semibold"
      style={{ zIndex: 10000 }}
    >
      Skip Tutorial
    </button>,
    document.body,
  );
}
