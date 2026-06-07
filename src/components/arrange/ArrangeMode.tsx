import { useState } from "react";
import { Mic, ListMusic } from "lucide-react";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import type { TabName } from "@/store/ui";
import { useSongStore } from "@/store/song";
import { useRecordingsStore } from "@/store/recordings";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { RecordFab } from "@/components/write/RecordFab";
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
  const recordToFirstTrack = useRecordingsStore((s) => s.recordToFirstTrack);
  const progressionsEmpty = useSongStore((s) => s.sections.every((sec) => sec.chords.length === 0));

  const [trackRevealed, setTrackRevealed] = useState(false);
  const [chordsRevealed, setChordsRevealed] = useState(false);

  const showTrack = !tracksEmpty || trackRevealed;
  const showChords = !progressionsEmpty || chordsRevealed;

  return (
    <div className="flex flex-col gap-4">
      {showTrack ? (
        <div>
          <TrackTimeline />
          <RecordFab onComplete={recordToFirstTrack} />
        </div>
      ) : (
        <EmptyTapCard
          icon={<Mic className="h-7 w-7" strokeWidth={1.75} />}
          label="Add Recording"
          onClick={() => setTrackRevealed(true)}
        />
      )}

      {showChords ? (
        <ProgressionsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />
      ) : (
        <EmptyTapCard
          icon={<ListMusic className="h-7 w-7" strokeWidth={1.75} />}
          label="Add Chords"
          onClick={() => setChordsRevealed(true)}
        />
      )}
    </div>
  );
}
