import { useState } from "react";
import { Mic, ListMusic, Star } from "lucide-react";
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
  const recordToFirstTrack = useRecordingsStore((s) => s.recordToFirstTrack);
  const progressionsEmpty = useSongStore((s) => s.sections.every((sec) => sec.chords.length === 0));
  const hasTakes = useTakesStore((s) => s.takes.length > 0);
  const hasBestTakes = useTakesStore((s) => s.takes.some((t) => t.best));

  const [trackRevealed, setTrackRevealed] = useState(false);
  const [chordsRevealed, setChordsRevealed] = useState(false);

  const showTrack = !tracksEmpty || trackRevealed || hasBestTakes;
  const showChords = !progressionsEmpty || chordsRevealed;

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:items-start md:gap-6">
      {/* Left column — multitrack timeline (2 of 5) */}
      <div className="md:col-span-2">
        {showTrack ? (
          <TrackTimeline />
        ) : hasTakes ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center" style={{ borderColor: "var(--primary)", background: "color-mix(in oklch, var(--primary) 6%, transparent)" }}>
            <Star className="h-8 w-8" style={{ color: "var(--primary)" }} strokeWidth={1.5} />
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Waiting for starred recordings</p>
            <p className="text-xs max-w-[18rem]" style={{ color: "var(--ink-soft)" }}>
              Star your best takes in the Write tab and they'll appear here ready to arrange.
            </p>
          </div>
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
        actionsEnabled={showChords}
        onSwitchTab={onSwitchTab}
        onRecordComplete={recordToFirstTrack}
      />
    </div>
  );
}
