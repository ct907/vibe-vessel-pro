import { useState } from "react";
import { Play, Pause, Star, Mic } from "lucide-react";
import { useTakesStore, MAX_BEST_TAKES, type Take } from "@/store/takes";
import { Waveform } from "@/components/common/Waveform";

/**
 * Pinned, swipeable strip of song-level takes at the top of Write mode
 * (Apple-Notes-style). Each card can be starred as one of the best takes;
 * the counter caps the selection at {@link MAX_BEST_TAKES}.
 */
export function RecordingsStrip() {
  const takes = useTakesStore((s) => s.takes);
  const toggleBest = useTakesStore((s) => s.toggleBest);
  const addTake = useTakesStore((s) => s.addTake);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const bestCount = takes.filter((t) => t.best).length;
  const atMax = bestCount >= MAX_BEST_TAKES;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-4 pb-1.5">
        <span className="font-mono-chord text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
          Recordings
        </span>
        <span
          className="inline-flex items-center gap-1 text-[11px] font-bold"
          style={{ color: atMax ? "var(--primary-strong)" : "var(--ink-soft)" }}
        >
          <Star className="h-3 w-3 fill-[var(--star,#e8a838)] text-[var(--star,#e8a838)]" />
          {bestCount} of {MAX_BEST_TAKES} best takes
        </span>
      </div>

      <div className="hide-scroll flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {takes.map((take) => (
          <TakeCard
            key={take.id}
            take={take}
            playing={playingId === take.id}
            onPlay={() => setPlayingId((p) => (p === take.id ? null : take.id))}
            onStar={() => toggleBest(take.id)}
            starDisabled={atMax && !take.best}
          />
        ))}

        {/* New-take affordance */}
        <button
          type="button"
          onClick={() => addTake()}
          className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-ink-soft"
          style={{ border: "2px dashed var(--border)" }}
          aria-label="New take"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "var(--primary)", boxShadow: "var(--shadow-sculpt-amber-rest)" }}
          >
            <Mic className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.04em]">New</span>
        </button>
      </div>
    </div>
  );
}

function TakeCard({
  take,
  playing,
  onPlay,
  onStar,
  starDisabled,
}: {
  take: Take;
  playing: boolean;
  onPlay: () => void;
  onStar: () => void;
  starDisabled: boolean;
}) {
  return (
    <div
      className="flex w-[168px] shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5"
      style={{ boxShadow: "var(--shadow-card)", scrollSnapAlign: "start" }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-ink">{take.name}</div>
          <div className="mt-0.5 font-mono-chord text-[9.5px] text-ink-soft">{take.date}</div>
        </div>
        <button
          type="button"
          onClick={onStar}
          disabled={starDisabled}
          aria-label={take.best ? "Unstar take" : "Mark as best take"}
          className="shrink-0 p-0.5 disabled:opacity-30"
        >
          <Star
            className="h-[17px] w-[17px]"
            style={
              take.best
                ? { fill: "var(--star,#e8a838)", color: "var(--star,#e8a838)" }
                : { color: "var(--ink-soft)" }
            }
          />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPlay}
          aria-label={playing ? "Pause take" : "Play take"}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--primary)", boxShadow: "var(--shadow-sculpt-amber-rest)" }}
        >
          {playing ? (
            <Pause className="h-2.5 w-2.5 fill-white text-white" />
          ) : (
            <Play className="h-2.5 w-2.5 fill-white text-white" />
          )}
        </button>
        <Waveform width={96} height={18} seed={take.seed} color="var(--primary)" />
        <span className="shrink-0 font-mono-chord text-[9.5px] text-ink-soft">{take.duration}</span>
      </div>
    </div>
  );
}
