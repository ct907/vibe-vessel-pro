import { useEffect, useRef, useState } from "react";
import { Mic, ListMusic } from "lucide-react";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import type { TabName } from "@/store/ui";
import { useSongStore } from "@/store/song";
import { useRecordingsStore } from "@/store/recordings";
import { useTakesStore } from "@/store/takes";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { WriteStickyBar } from "@/components/write/WriteStickyBar";
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

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:items-start md:gap-6">
      {/* Left column — multitrack timeline (2 of 5) */}
      <div className="md:col-span-2">
        {showTrack ? (
          <TrackTimeline />
        ) : (
          <EmptyTapCard
            icon={<Mic className="h-7 w-7" strokeWidth={1.75} />}
            label="Add Recording"
            onClick={() => setTrackRevealed(true)}
          />
        )}
      </div>

      {/* Right column — chord progressions (3 of 5) */}
      <div className="md:col-span-3 min-w-0">
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

      <WriteStickyBar
        onSwitchTab={onSwitchTab}
        onRecordComplete={recordToFirstTrack}
        onEditorAction={() => setChordsRevealed(true)}
      />
    </div>
  );
}
