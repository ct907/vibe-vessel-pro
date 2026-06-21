import { useEffect, useRef, useState } from "react";
import { Mic, ListMusic } from "lucide-react";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import type { TabName } from "@/store/ui";
import { useSongStore } from "@/store/song";
import { useRecordingsStore } from "@/store/recordings";
import { useTakesStore } from "@/store/takes";
import { useOnboardingStore } from "@/store/onboarding";
import { AnchoredCoachMark } from "@/components/onboarding/OnboardingCoachMark";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { WriteStickyBar, requestStickyBarRecording } from "@/components/write/WriteStickyBar";
import { useIsDesktop } from "@/hooks/use-mobile";
import { TrackTimeline } from "./TrackTimeline";

interface Props {
  sortMode: boolean;
  onSwitchTab: (t: TabName) => void;
  showOnboarding: boolean;
}

/**
 * Arrange mode (Refine) — a single page mirroring Write: a card-gated recording
 * area (the multitrack timeline; recording lands on the first track) stacked
 * above a card-gated chord-progression editor.
 */
export function ArrangeMode({ sortMode, onSwitchTab, showOnboarding }: Props) {
  const tracksEmpty = useRecordingsStore((s) => s.tracks.length === 0);
  const addTrack = useRecordingsStore((s) => s.addTrack);
  const recordToFirstTrack = useRecordingsStore((s) => s.recordToFirstTrack);
  const progressionsEmpty = useSongStore((s) => s.sections.every((sec) => sec.chords.length === 0));
  const hasTakes = useTakesStore((s) => s.takes.length > 0);

  const [trackRevealed, setTrackRevealed] = useState(false);
  const [chordsRevealed, setChordsRevealed] = useState(false);
  const isDesktop = useIsDesktop();
  const tapVerb = isDesktop ? "Click" : "Tap";

  // Once a recording exists, give the user a track ready to drop takes into.
  const autoAdded = useRef(false);
  useEffect(() => {
    if (hasTakes && tracksEmpty && !autoAdded.current) {
      autoAdded.current = true;
      addTrack();
    }
  }, [hasTakes, tracksEmpty, addTrack]);

  const showTrack = !tracksEmpty || trackRevealed || hasTakes;
  const showChords = !progressionsEmpty || chordsRevealed;

  const onboarding = useOnboardingStore();
  const canCoach = onboarding.enabled && showOnboarding && onboarding.globalPhase === 2;
  const recCardRef = useRef<HTMLButtonElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const chordsCardRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (canCoach && onboarding.captureStep === 1 && showTrack) onboarding.setCaptureStep(2);
  }, [canCoach, onboarding, showTrack]);

  // Revealing the progression editor ends the capture phase and hands the tour
  // to the progression steps inside ProgressionsTab.
  const revealChordsForTour = () => {
    if (canCoach && onboarding.captureStep !== 0) {
      onboarding.setCaptureStep(0);
      onboarding.setProgressionsStep(1);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:items-start md:gap-6">
      {/* Left column — multitrack timeline (2 of 5) */}
      <div className="md:col-span-2" ref={timelineRef}>
        {showTrack ? (
          <TrackTimeline />
        ) : (
          <EmptyTapCard
            anchorRef={recCardRef}
            icon={<Mic className="h-7 w-7" strokeWidth={1.75} />}
            label="Add Recording"
            hint={`${tapVerb} to start recording`}
            onClick={() => {
              setTrackRevealed(true);
              // Begin the take within the tap gesture so the mic prompt applies,
              // mirroring the Write-mode card.
              requestStickyBarRecording();
            }}
          />
        )}
      </div>

      {/* Right column — chord progressions (3 of 5) */}
      <div className="md:col-span-3 min-w-0">
        {showChords ? (
          <ProgressionsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />
        ) : (
          <EmptyTapCard
            anchorRef={chordsCardRef}
            icon={<ListMusic className="h-7 w-7" strokeWidth={1.75} />}
            label="Add Chords"
            onClick={() => { setChordsRevealed(true); revealChordsForTour(); }}
          />
        )}
      </div>

      <WriteStickyBar
        onRecordComplete={recordToFirstTrack}
        onEditorAction={() => { setChordsRevealed(true); revealChordsForTour(); }}
      />

      {canCoach && onboarding.captureStep === 1 && !showTrack && onboarding.dismissedKey !== "capture-1" && (
        <AnchoredCoachMark
          anchorRef={recCardRef}
          step="3/13"
          message={`${tapVerb} Add Recording to lay your first take on the timeline.`}
          arrowSide="top"
          onDismiss={() => onboarding.dismissCoachMark("capture-1")}
        />
      )}
      {canCoach && onboarding.captureStep === 2 && onboarding.dismissedKey !== "capture-2" && (
        <AnchoredCoachMark
          anchorRef={timelineRef}
          step="4/13"
          message="Your take lands on the timeline — drag it to arrange your tracks."
          arrowSide="top"
          actionLabel="Next"
          onAction={() => onboarding.setCaptureStep(3)}
          onDismiss={() => onboarding.dismissCoachMark("capture-2")}
        />
      )}
      {canCoach && onboarding.captureStep === 3 && !showChords && onboarding.dismissedKey !== "capture-3" && (
        <AnchoredCoachMark
          anchorRef={chordsCardRef}
          step="5/13"
          message={`${tapVerb} Add Chords to open the progression editor.`}
          arrowSide="top"
          onDismiss={() => onboarding.dismissCoachMark("capture-3")}
        />
      )}
    </div>
  );
}
