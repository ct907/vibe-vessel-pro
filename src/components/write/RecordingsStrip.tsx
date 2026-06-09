import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Draggable, Droppable, type DraggableProvided } from "@hello-pangea/dnd";
import { Play, Pause, Star, Trash2, Save, Sparkles, MoreVertical, Pencil, RefreshCw, ListMusic, Upload } from "lucide-react";
import { useTakesStore, MAX_BEST_TAKES, type Take } from "@/store/takes";
import { useTranscriptionStore, type TranscribedChord } from "@/store/transcription";
import { useSongStore } from "@/store/song";
import { getAudioBlob, deleteAudioBlob, putAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";
import { transcribeBlob } from "@/lib/music/transcribe";
import { getChordColorClasses } from "@/lib/music/chordColor";
import type { ChordSymbol } from "@/lib/music/chords";
import { Waveform } from "@/components/common/Waveform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const FLAT_KEYS = ["F", "Bb", "Eb", "Ab", "Db", "Gb"];
const LOW_CONFIDENCE = 0.8;

export function RecordingsStrip() {
  const takes = useTakesStore((s) => s.takes);
  const toggleBest = useTakesStore((s) => s.toggleBest);
  const removeTake = useTakesStore((s) => s.removeTake);
  const renameTake = useTakesStore((s) => s.renameTake);
  const addTake = useTakesStore((s) => s.addTake);

  const status = useTranscriptionStore((s) => s.status);
  const chordsByTake = useTranscriptionStore((s) => s.chords);
  const setStatus = useTranscriptionStore((s) => s.setStatus);
  const setChords = useTranscriptionStore((s) => s.setChords);
  const clearTake = useTranscriptionStore((s) => s.clearTake);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    clearTake(take.id);
    if (take.blobId) deleteAudioBlob(take.blobId);
  };

  const runTranscription = async (takeId: string, blob: Blob) => {
    setStatus(takeId, "transcribing");
    try {
      const meta = useSongStore.getState().meta;
      const useFlat = meta.keyRoot.includes("b") || FLAT_KEYS.includes(meta.keyRoot);
      const result = await transcribeBlob(blob, useFlat);
      setChords(
        takeId,
        result.map((d) => ({ id: nanoid(), chord: d.chord, startSec: d.startSec, endSec: d.endSec, confidence: d.confidence })),
      );
      setStatus(takeId, "done");
      if (result.length === 0) toast("No chords detected — try a cleaner recording.");
    } catch {
      setStatus(takeId, "idle");
      toast.error("Couldn't transcribe that recording.");
    }
  };

  const handleTranscribe = async (take: Take) => {
    if (!take.blobId) return;
    const blob = await getAudioBlob(take.blobId);
    if (!blob) {
      toast.error("That recording's audio is no longer available.");
      return;
    }
    void runTranscription(take.id, blob);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blobId = nanoid();
      await putAudioBlob(blobId, file);
      let durationSec = 0;
      try {
        const buf = await getAudioContext().decodeAudioData(await file.arrayBuffer());
        durationSec = buf.duration;
      } catch {
        toast.error("Couldn't read that audio. Try a WAV, MP3, or M4A file.");
        await deleteAudioBlob(blobId);
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, "") || "Imported";
      const takeId = addTake({ name, blobId, durationSec, mime: file.type || "audio/*" });
      void runTranscription(takeId, file);
    } catch {
      toast.error("Couldn't import that audio file.");
    }
  };

  const bestCount = takes.filter((t) => t.best).length;
  const atMax = bestCount >= MAX_BEST_TAKES;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-4 pb-1.5">
        <span className="font-mono-chord text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
          Recordings
        </span>
        <div className="flex items-center gap-2">
          {takes.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{ color: atMax ? "var(--primary-strong)" : "var(--ink-soft)" }}
            >
              <Star className="h-3 w-3 fill-[var(--star,#e8a838)] text-[var(--star,#e8a838)]" />
              {bestCount} of {MAX_BEST_TAKES} best takes
            </span>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-sculpt-cream inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          >
            <Upload className="h-3 w-3" style={{ color: "var(--primary-strong)" }} />
            Import
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleImport} />

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
        <div className="hide-scroll flex items-start gap-2 overflow-x-auto px-4 pb-2" style={{ scrollSnapType: "x mandatory" }}>
          {takes.map((take) => {
            const st = status[take.id] ?? "idle";
            const detected = chordsByTake[take.id] ?? [];
            return (
              <div key={take.id} className="flex shrink-0 flex-col gap-1.5" style={{ scrollSnapAlign: "start" }}>
                <TakeCard
                  take={take}
                  playing={playingId === take.id}
                  transcribing={st === "transcribing"}
                  onPlay={() => handlePlay(take)}
                  onStar={() => toggleBest(take.id)}
                  onDelete={() => handleDelete(take)}
                  onTranscribe={() => void handleTranscribe(take)}
                  onRename={(name) => renameTake(take.id, name)}
                  starDisabled={atMax && !take.best}
                />
                {st === "done" && detected.length > 0 && (
                  <DetectedChordsStrip takeId={take.id} chords={detected} />
                )}
              </div>
            );
          })}
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
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary-strong)" }} />
            <span>
              Record a melody or play some chords on a piano or guitar (or{" "}
              <span className="font-bold" style={{ color: "var(--ink)" }}>Import</span> an audio file), then use a take's{" "}
              <span className="font-bold" style={{ color: "var(--ink)" }}>⋮ menu → Transcribe Chords from Audio</span>{" "}
              to detect and transcribe them — right on your device.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function TakeCard({
  take,
  playing,
  transcribing,
  onPlay,
  onStar,
  onDelete,
  onTranscribe,
  onRename,
  starDisabled,
}: {
  take: Take;
  playing: boolean;
  transcribing: boolean;
  onPlay: () => void;
  onStar: () => void;
  onDelete: () => void;
  onTranscribe: () => void;
  onRename: (name: string) => void;
  starDisabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(take.name);

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <div
      className="flex w-[168px] flex-col gap-2 rounded-xl border border-border bg-card p-2.5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setDraft(take.name); setEditing(false); }
              }}
              className="w-full rounded px-1 py-0.5 text-[13px] font-bold text-ink outline-none"
              style={{ background: "var(--paper-shade)" }}
              aria-label="Rename take"
            />
          ) : (
            <div className="truncate text-[13px] font-bold text-ink">{take.name}</div>
          )}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Take options" className="p-0.5 text-ink-soft transition-colors hover:text-ink">
                <MoreVertical className="h-[16px] w-[16px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => { setDraft(take.name); setEditing(true); }}>
                <Pencil className="h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTranscribe} disabled={transcribing || !take.blobId}>
                <Sparkles className="h-4 w-4" /> Transcribe Chords from Audio
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      {transcribing && (
        <div className="flex items-center justify-center gap-1.5 pt-0.5">
          <RefreshCw className="h-3 w-3 animate-spin" style={{ color: "var(--primary-strong)" }} />
          <span className="font-mono-chord text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
            Transcribing chords…
          </span>
        </div>
      )}
    </div>
  );
}

function DetectedChordsStrip({ takeId, chords }: { takeId: string; chords: TranscribedChord[] }) {
  return (
    <div className="w-[168px]">
      <div className="mb-0.5 flex items-center gap-1 px-0.5">
        <ListMusic className="h-3 w-3" style={{ color: "var(--primary-strong)" }} />
        <span className="font-mono-chord text-[9px] font-semibold uppercase tracking-wide text-ink-soft">
          Detected — drag to lyrics
        </span>
      </div>
      <Droppable
        droppableId={`detected:${takeId}`}
        type="chord"
        direction="horizontal"
        isDropDisabled
        renderClone={(provided, _snapshot, rubric) => {
          const c = chords[rubric.source.index];
          return createPortal(<DetectedChip provided={provided} chord={c.chord} dragging />, document.body);
        }}
      >
        {(dropProvided) => (
          <div
            ref={dropProvided.innerRef}
            {...dropProvided.droppableProps}
            className="hide-scroll flex gap-1 overflow-x-auto rounded-lg p-1.5"
            style={{ background: "var(--paper-shade)" }}
          >
            {chords.map((c, i) => (
              <Draggable key={c.id} draggableId={`detected:${c.id}`} index={i}>
                {(dragProvided, dragSnapshot) => (
                  <DetectedChip
                    provided={dragProvided}
                    chord={c.chord}
                    dragging={dragSnapshot.isDragging}
                    low={c.confidence < LOW_CONFIDENCE}
                  />
                )}
              </Draggable>
            ))}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function DetectedChip({ provided, chord, dragging, low }: {
  provided: DraggableProvided;
  chord: ChordSymbol;
  dragging?: boolean;
  low?: boolean;
}) {
  const colors = getChordColorClasses(chord);
  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      className={cn(
        colors.className,
        "noise-texture-chip shrink-0 cursor-grab select-none rounded-md px-2 py-1 font-mono-chord text-[13px] font-semibold",
        dragging && "shadow-lg",
        low && "opacity-70",
      )}
      style={{ ...colors.style, ...provided.draggableProps.style }}
      title={low ? "Low confidence — double-check this chord" : undefined}
    >
      {chord.display}
    </div>
  );
}
