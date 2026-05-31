import { LyricsTab } from "@/components/lyrics/LyricsTab";
import type { TabName } from "@/store/ui";
import { RecordingsStrip } from "./RecordingsStrip";
import { RecordFab } from "./RecordFab";

interface Props {
  sortMode: boolean;
  onSwitchTab: (t: TabName) => void;
  showOnboarding: boolean;
}

/**
 * Write mode (Capture) — the Apple-Notes-style surface: a pinned recordings
 * strip on top, the existing chord-over-lyric editor below, and a floating
 * Record pill for one-tap capture.
 */
export function WriteMode({ sortMode, onSwitchTab, showOnboarding }: Props) {
  return (
    <div>
      <RecordingsStrip />
      <LyricsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />
      <RecordFab />
    </div>
  );
}
