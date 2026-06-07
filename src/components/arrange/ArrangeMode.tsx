import { useState } from "react";
import { ListMusic } from "lucide-react";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import type { ArrangeView, TabName } from "@/store/ui";
import { useSongStore } from "@/store/song";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { TrackTimeline } from "./TrackTimeline";

interface Props {
  view: ArrangeView;
  sortMode: boolean;
  onSwitchTab: (t: TabName) => void;
  showOnboarding: boolean;
}

/**
 * Arrange mode (Refine). The Track view is the BandLab-style timeline; the
 * Chords view reuses the existing Progressions pattern-block editor (with its
 * Add-Spice sheet). The Chords view starts as a dashed tap card while no chords
 * exist; tapping reveals the editor inline.
 */
export function ArrangeMode({ view, sortMode, onSwitchTab, showOnboarding }: Props) {
  const progressionsEmpty = useSongStore((s) => s.sections.every((sec) => sec.chords.length === 0));
  const [revealed, setRevealed] = useState(false);

  if (view === "chords") {
    if (progressionsEmpty && !revealed) {
      return (
        <EmptyTapCard
          icon={<ListMusic className="h-7 w-7" strokeWidth={1.75} />}
          label="Add Chord Progressions"
          onClick={() => setRevealed(true)}
        />
      );
    }
    return <ProgressionsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />;
  }
  return <TrackTimeline />;
}
