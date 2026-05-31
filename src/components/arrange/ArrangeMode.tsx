import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import type { ArrangeView, TabName } from "@/store/ui";
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
 * Add-Spice sheet).
 */
export function ArrangeMode({ view, sortMode, onSwitchTab, showOnboarding }: Props) {
  if (view === "chords") {
    return <ProgressionsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />;
  }
  return <TrackTimeline />;
}
