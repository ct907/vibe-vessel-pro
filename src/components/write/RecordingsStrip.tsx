import { useEffect, useRef, useState } from "react";
import { Play, Pause, Star, Trash2, Save } from "lucide-react";
import { useTakesStore, MAX_BEST_TAKES, type Take } from "@/store/takes";
import { getAudioBlob, deleteAudioBlob } from "@/lib/audio/blob-store";
import { Waveform } from "@/components/common/Waveform";

export function RecordingsStrip() {
  const takes = useTakesStore((s) => s.takes);
  const toggleBest = useTakesStore((s) => s.toggleBest);
  const removeTake = useTakesStore((s) => s.removeTake);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  useEffect(() => () => stopAudio(), []);

  const handlePlay = async (take: Take) => {
    if (playingId === take.id) {
      stopAudio();
      setPlayingId(null);
      return;
    }
    stopAudio();
    setPlayingId(take.id);

    if (take.blobId) {
      const blob = await getAudioBlob(take.blobId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
          audioRef.current = null;
          setPlayingId(null);
        };
        audio.play().catch(() => setPlayingId(null));
      }
    }
  };

  const handleDelete = (take: Take) => {
    if (playingId === take.id) {
      stopAudio();
      setPlayingId(null);
    }
    removeTake(take.id);
    if (take.blobId) deleteAudioBlob(take.blobId);
  };

  const bestCount = takes.filter((t) => t.best).length;
  const atMax = bestCount >= MAX_BEST_TAKES;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-4 pb-1.5">
        <span className="font-mono-chord text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
          Recordings
        </span>
        {takes.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold"
            style={{ color: atMax ? "var(--primary-strong)" : "var(--ink-soft)" }}
          >
            <Star className="h-3 w-3 fill-[var(--star,#e8a838)] text-[var(--star,#e8a838)]" />
            {bestCount} of {MAX_BEST_TAKES} best takes
          </span>
        )}
      </div>

      {takes.length > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "color-mix(in oklch, var(--primary) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--primary) 20%, transparent)" }}>
          <Save className="h-3 w-3 shrink-0" style={{ color: "var(--primary-strong)" }} />
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--ink-soft)" }}>
            Recordings are cleared on page refresh — use{" "}
            <span className="font-bold" style={{ color: "var(--ink)" }}>Menu → Save</span>{" "}
            to keep them.
          </p>
        </div>
      )}

      {takes.length > 0 ? (
        <div className="hide-scroll flex gap-2 overflow-x-auto px-4 pb-2" style={{ scrollSnapType: "x mandatory" }}>
          {takes.map((take) => (
            <TakeCard
              key={take.id}
              take={take}
              playing={playingId === take.id}
              onPlay={() => handlePlay(take)}
              onStar={() => toggleBest(take.id)}
              onDelete={() => handleDelete(take)}
              starDisabled={atMax && !take.best}
            />
          ))}
        </div>
      ) : (
        <div className="mx-4 mb-2 rounded-lg border border-dashed border-border/60 bg-[var(--paper-card)]/40 flex flex-col items-center justify-center gap-3 py-5 px-4 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            To record a take, press the{" "}
            <span
              className="btn-sculpt-destructive inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold pointer-events-none select-none"
              aria-hidden="true"
            >
              <span className="rounded-full bg-white" style={{ width: 8, height: 8, flexShrink: 0 }} />
              Record
            </span>{" "}
            button below!
          </p>
        </div>
      )}
    </div>
  );
}

function TakeCard({
  take,
  playing,
  onPlay,
  onStar,
  onDelete,
  starDisabled,
}: {
  take: Take;
  playing: boolean;
  onPlay: () => void;
  onStar: () => void;
  onDelete: () => void;
  starDisabled: boolean;
}) {
  return (
    <div
      className="flex w-[168px] shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5"
      style={{ boxShadow: "var(--shadow-card)", scrollSnapAlign: "start" }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-ink">{take.name}</div>
          <div className="mt-0.5 font-mono-chord text-[9.5px] text-ink-soft">{take.date}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onStar}
            disabled={starDisabled}
            aria-label={take.best ? "Unstar take" : "Mark as best take"}
            className="p-0.5 disabled:opacity-30"
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
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete take"
            className="p-0.5 text-ink-soft hover:text-destructive transition-colors"
          >
            <Trash2 className="h-[15px] w-[15px]" />
          </button>
        </div>
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
