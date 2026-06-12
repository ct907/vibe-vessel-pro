import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mic, Pencil } from "lucide-react";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import type { TabName } from "@/store/ui";
import { useTakesStore } from "@/store/takes";
import { useSongStore } from "@/store/song";
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

  // Carry the capture intent picked on the landing page straight into the
  // editor so tapping its empty-state card starts the same gesture here — no
  // second tap. The param is consumed once, then cleared.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const capture = searchParams.get("capture");
    if (!capture) return;
    if (capture === "record") {
      setRecRevealed(true);
      requestStickyBarRecording();
    } else if (capture === "lyrics") {
      setLyricsRevealed(true);
      focusFirstLyricLine();
    }
    searchParams.delete("capture");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-5 md:items-start md:gap-6">
      {/* Left column — recordings (2 of 5) */}
      <div className="md:col-span-2">
        {showRecordings ? (
          <RecordingsStrip />
        ) : (
          <EmptyTapCard
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
            icon={<Pencil className="h-6 w-6" strokeWidth={1.75} />}
            label="Write Lyrics"
            hint={`${tapVerb} to start typing`}
            onClick={() => {
              setLyricsRevealed(true);
              focusFirstLyricLine();
            }}
          />
        )}
      </div>

      <WriteStickyBar onEditorAction={() => setLyricsRevealed(true)} />
    </div>
  );
}
