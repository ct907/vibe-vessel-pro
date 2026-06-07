import { useState } from "react";
import { Mic, Pencil } from "lucide-react";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import type { TabName } from "@/store/ui";
import { useTakesStore } from "@/store/takes";
import { useSongStore } from "@/store/song";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
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
 *
 * Each area starts as a dashed tap card while it is empty; tapping reveals the
 * real editor inline. An untouched area reverts to its card on remount.
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

  const showRecordings = !recordingsEmpty || recRevealed;
  const showLyrics = !lyricsEmpty || lyricsRevealed;

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:items-start md:gap-6">
      {/* Left column — recordings (2 of 5) */}
      <div className="md:col-span-2">
        {showRecordings ? (
          <div>
            <RecordingsStrip />
            <RecordFab />
          </div>
        ) : (
          <EmptyTapCard icon={<Mic className="h-7 w-7" strokeWidth={1.75} />} label="Add Recording" onClick={() => setRecRevealed(true)} />
        )}
      </div>

      {/* Right column — lyrics (3 of 5) */}
      <div className="md:col-span-3 min-w-0">
        {showLyrics ? (
          <LyricsTab sortMode={sortMode} onSwitchTab={onSwitchTab} showOnboarding={showOnboarding} />
        ) : (
          <EmptyTapCard icon={<Pencil className="h-6 w-6" strokeWidth={1.75} />} label="Write Lyrics" onClick={() => setLyricsRevealed(true)} />
        )}
      </div>
    </div>
  );
}
