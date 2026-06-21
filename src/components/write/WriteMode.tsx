import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mic, Pencil } from "lucide-react";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import type { TabName } from "@/store/ui";
import { useTakesStore } from "@/store/takes";
import { useSongStore } from "@/store/song";
import { useOnboardingStore } from "@/store/onboarding";
import { AnchoredCoachMark } from "@/components/onboarding/OnboardingCoachMark";
import { useIsDesktop } from "@/hooks/use-mobile";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { RecordingsStrip } from "./RecordingsStrip";
import { WriteStickyBar, requestStickyBarRecording } from "./WriteStickyBar";

interface Props {
  sortMode: boolean;
  onSwitchTab: (t: TabName) => void;
  showOnboarding: boolean;
}

/** Poll a few frames for the first lyric textarea (it mounts on reveal) and focus it. */
function focusFirstLyricLine() {
  let tries = 0;
  const tick = () => {
    const el = document.querySelector<HTMLTextAreaElement>("[data-lyric-input]");
    if (el) {
      el.focus();
      return;
    }
    if (++tries < 10) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Write mode (Capture) — the Apple-Notes-style surface: a pinned recordings
 * strip on top, the existing chord-over-lyric editor below, and a floating
 * Record pill for one-tap capture.
 *
 * Each area starts as a dashed tap card while it is empty; tapping reveals the
 * real editor and immediately performs the capture action (caret ready in the
 * first lyric line / recording already rolling) so inspiration isn't kept
 * waiting. An untouched area reverts to its card on remount.
 */
export function WriteMode({ sortMode, onSwitchTab, showOnboarding }: Props) {
  const recordingsEmpty = useTakesStore((s) => s.takes.length === 0);
  const lyricsEmpty = useSongStore(
    (s) =>
      s.sections.every((sec) => sec.lines.every((l) => l.text.trim() === "")) &&
      s.sections.every((sec) => sec.chords.length === 0),
  );

  const [recRevealed, setRecRevealed] = useState(false);
  const [lyricsRevealed, setLyricsRevealed] = useState(false);
  const isDesktop = useIsDesktop();
  const tapVerb = isDesktop ? "Click" : "Tap";

  const showRecordings = !recordingsEmpty || recRevealed;
  const showLyrics = !lyricsEmpty || lyricsRevealed;

  const onboarding = useOnboardingStore();
  const canCoach = onboarding.enabled && showOnboarding && onboarding.globalPhase === 2;
  const recCardRef = useRef<HTMLButtonElement | null>(null);
  const recStripRef = useRef<HTMLDivElement | null>(null);
  const lyricsCardRef = useRef<HTMLButtonElement | null>(null);

  // Capture walkthrough: once recording is rolling, move from the record prompt
  // to the "your take lives here" callout.
  useEffect(() => {
    if (canCoach && onboarding.captureStep === 1 && showRecordings) onboarding.setCaptureStep(2);
  }, [canCoach, onboarding, showRecordings]);

  // Revealing the lyrics editor (by tap or otherwise) ends the capture phase and
  // hands the tour to the lyrics steps that live inside LyricsTab.
  const revealLyricsForTour = () => {
    if (canCoach && onboarding.captureStep !== 0) {
      onboarding.setCaptureStep(0);
      onboarding.setLyricsStep(1);
    }
  };

  // Carry the capture intent picked on the landing page straight into the
  // editor so tapping its empty-state card starts the same gesture here — no
  // second tap. The param is consumed once, then cleared.
  //
  // Index (and thus WriteMode) is mounted for the whole app lifetime — even
  // while the landing page is shown on top of it — so this effect must react to
  // the param appearing rather than fire once on mount, which would have run
  // before any capture intent existed.
  const [searchParams, setSearchParams] = useSearchParams();
  const capture = searchParams.get("capture");
  useEffect(() => {
    if (!capture) return;
    if (capture === "record") {
      setRecRevealed(true);
      requestStickyBarRecording();
    } else if (capture === "lyrics") {
      setLyricsRevealed(true);
      focusFirstLyricLine();
    }
    const next = new URLSearchParams(searchParams);
    next.delete("capture");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:items-start md:gap-6">
      {/* Left column — recordings (2 of 5) */}
      <div className="md:col-span-2" ref={recStripRef}>
        {showRecordings ? (
          <RecordingsStrip />
        ) : (
          <EmptyTapCard
            anchorRef={recCardRef}
            icon={<Mic className="h-6 w-6" strokeWidth={1.75} />}
            label="Add Recording"
            hint={`${tapVerb} to start recording`}
            onClick={() => {
              setRecRevealed(true);
              // Within the tap gesture so the mic prompt/keyboard rules apply.
              requestStickyBarRecording();
            }}
          />
        )}
      </div>

      {/* Right column — lyrics (3 of 5) */}
      <div className="md:col-span-3 min-w-0">
        {showLyrics ? (
          <LyricsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />
        ) : (
          <EmptyTapCard
            anchorRef={lyricsCardRef}
            icon={<Pencil className="h-6 w-6" strokeWidth={1.75} />}
            label="Write Lyrics"
            hint={`${tapVerb} to start typing`}
            onClick={() => {
              setLyricsRevealed(true);
              focusFirstLyricLine();
              revealLyricsForTour();
            }}
          />
        )}
      </div>

      <WriteStickyBar onEditorAction={() => { setLyricsRevealed(true); revealLyricsForTour(); }} />

      {canCoach && onboarding.captureStep === 1 && !showRecordings && onboarding.dismissedKey !== "capture-1" && (
        <AnchoredCoachMark
          anchorRef={recCardRef}
          step="3/13"
          message={`${tapVerb} Add Recording to capture a vocal idea — your first take.`}
          arrowSide="top"
          onDismiss={() => onboarding.dismissCoachMark("capture-1")}
        />
      )}
      {canCoach && onboarding.captureStep === 2 && onboarding.dismissedKey !== "capture-2" && (
        <AnchoredCoachMark
          anchorRef={recStripRef}
          step="4/13"
          message="Your takes live here — tap the ★ to mark your favourite."
          arrowSide="top"
          actionLabel="Next"
          onAction={() => onboarding.setCaptureStep(3)}
          onDismiss={() => onboarding.dismissCoachMark("capture-2")}
        />
      )}
      {canCoach && onboarding.captureStep === 3 && !showLyrics && onboarding.dismissedKey !== "capture-3" && (
        <AnchoredCoachMark
          anchorRef={lyricsCardRef}
          step="5/13"
          message={`${tapVerb} Write Lyrics to open the editor.`}
          arrowSide="top"
          onDismiss={() => onboarding.dismissCoachMark("capture-3")}
        />
      )}
    </div>
  );
}
