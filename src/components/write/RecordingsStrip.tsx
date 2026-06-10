import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Draggable, Droppable, type DraggableProvided } from "@hello-pangea/dnd";
import { Play, Pause, Star, Trash2, Save, Sparkles, MoreVertical, Pencil, RefreshCw, ListMusic, Upload, Music, Copy, Check, X } from "lucide-react";
import { useTakesStore, MAX_BEST_TAKES, type Take } from "@/store/takes";
import { useTranscriptionStore, type TranscribedChord } from "@/store/transcription";
import { useSongStore } from "@/store/song";
import { getAudioBlob, deleteAudioBlob, putAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";
import { transcribeBlob, transcribeMelodyBlob } from "@/lib/music/transcribe";
import type { MelodyNote } from "@/lib/music/detect-melody";
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
  const melodyStatus = useTranscriptionStore((s) => s.melodyStatus);
  const melodyByTake = useTranscriptionStore((s) => s.melody);
  const setMelodyStatus = useTranscriptionStore((s) => s.setMelodyStatus);
  const setMelody = useTranscriptionStore((s) => s.setMelody);
  const clearTake = useTranscriptionStore((s) => s.clearTake);
  const autoTranscribe = useTranscriptionStore((s) => s.autoTranscribe);
  const setAutoTranscribe = useTranscriptionStore((s) => s.setAutoTranscribe);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [backupHintDismissed, setBackupHintDismissed] = useState(() => {
    try {
      return localStorage.getItem("vv:backup-hint-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissBackupHint = () => {
    setBackupHintDismissed(true);
    try {
      localStorage.setItem("vv:backup-hint-dismissed", "1");
    } catch { /* ignore */ }
  };
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

  const handleTranscribeMelody = async (take: Take) => {
    if (!take.blobId) return;
    const blob = await getAudioBlob(take.blobId);
    if (!blob) {
      toast.error("That recording's audio is no longer available.");
      return;
    }
    setMelodyStatus(take.id, "transcribing");
    try {
      const meta = useSongStore.getState().meta;
      const useFlat = meta.keyRoot.includes("b") || FLAT_KEYS.includes(meta.keyRoot);
      const notes = await transcribeMelodyBlob(blob, useFlat);
      setMelody(take.id, notes);
      setMelodyStatus(take.id, "done");
      if (notes.length === 0) toast("No melody detected — works best with a single hummed or sung voice.");
    } catch {
      setMelodyStatus(take.id, "idle");
      toast.error("Couldn't detect the melody in that recording.");
    }
  };

  // Auto-detect: transcribe takes as they land in the strip. Takes present on
  // mount (hydrated from a previous session) are treated as already seen.
  const seenTakeIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seenTakeIds.current) {
      seenTakeIds.current = new Set(takes.map((t) => t.id));
      return;
    }
    const seen = seenTakeIds.current;
    for (const take of takes) {
      if (seen.has(take.id)) continue;
      seen.add(take.id);
      if (autoTranscribe && take.blobId && (status[take.id] ?? "idle") === "idle") {
        void handleTranscribe(take);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takes]);

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
      addTake({ name, blobId, durationSec, mime: file.type || "audio/*" });
      toast.success(
        useTranscriptionStore.getState().autoTranscribe
          ? "Imported — detecting chords…"
          : "Imported — press a take's ✨ button to detect chords.",
      );
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
            onClick={() => setAutoTranscribe(!autoTranscribe)}
            aria-pressed={autoTranscribe}
            title="Automatically detect chords on new recordings"
            className={cn(
              autoTranscribe ? "btn-sculpt-amber" : "btn-sculpt-cream",
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
            )}
          >
            <Sparkles className="h-3 w-3" style={autoTranscribe ? undefined : { color: "var(--primary-strong)" }} />
            Auto-detect
          </button>
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

      {takes.length > 0 && !backupHintDismissed && (
        <div className="mx-4 mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "color-mix(in oklch, var(--primary) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--primary) 20%, transparent)" }}>
          <Save className="h-3 w-3 shrink-0" style={{ color: "var(--primary-strong)" }} />
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--ink-soft)" }}>
            Recordings are saved on this device — use{" "}
            <span className="font-bold" style={{ color: "var(--ink)" }}>Menu → Save</span>{" "}
            to back them up or move to another device.
          </p>
          <button
            type="button"
            onClick={dismissBackupHint}
            aria-label="Dismiss backup reminder"
            className="ml-auto shrink-0 rounded p-0.5 text-ink-soft transition-colors hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {takes.length > 0 ? (
        <div className="hide-scroll flex items-start gap-2 overflow-x-auto px-4 pb-2" style={{ scrollSnapType: "x mandatory" }}>
          {takes.map((take) => {
            const st = status[take.id] ?? "idle";
            const detected = chordsByTake[take.id] ?? [];
            const melSt = melodyStatus[take.id] ?? "idle";
            const melNotes = melodyByTake[take.id] ?? [];
            return (
              <div key={take.id} className="flex shrink-0 flex-col gap-1.5" style={{ scrollSnapAlign: "start" }}>
                <TakeCard
                  take={take}
                  playing={playingId === take.id}
                  transcribing={st === "transcribing"}
                  melodyTranscribing={melSt === "transcribing"}
                  onPlay={() => handlePlay(take)}
                  onStar={() => toggleBest(take.id)}
                  onDelete={() => handleDelete(take)}
                  onTranscribe={() => void handleTranscribe(take)}
                  onTranscribeMelody={() => void handleTranscribeMelody(take)}
                  onRename={(name) => renameTake(take.id, name)}
                  starDisabled={atMax && !take.best}
                />
                {st === "done" && detected.length > 0 && (
                  <DetectedChordsStrip takeId={take.id} chords={detected} />
                )}
                {melSt === "done" && melNotes.length > 0 && (
                  <DetectedMelodyStrip notes={melNotes} />
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
              <span className="font-bold" style={{ color: "var(--ink)" }}>Import</span> an audio file), then press a take's{" "}
              <span className="font-bold" style={{ color: "var(--ink)" }}>✨ button</span>{" "}
              — or turn on <span className="font-bold" style={{ color: "var(--ink)" }}>Auto-detect</span> —{" "}
              to detect its chords right on your device.
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
  melodyTranscribing,
  onPlay,
  onStar,
  onDelete,
  onTranscribe,
  onTranscribeMelody,
  onRename,
  starDisabled,
}: {
  take: Take;
  playing: boolean;
  transcribing: boolean;
  melodyTranscribing: boolean;
  onPlay: () => void;
  onStar: () => void;
  onDelete: () => void;
  onTranscribe: () => void;
  onTranscribeMelody: () => void;
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
            onClick={onTranscribe}
            disabled={transcribing || !take.blobId}
            aria-label="Detect chords in this take"
            title="Detect chords"
            className="p-0.5 disabled:opacity-30"
          >
            <Sparkles className="h-[16px] w-[16px]" style={{ color: "var(--primary-strong)" }} />
          </button>
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
              <DropdownMenuItem onClick={onTranscribeMelody} disabled={melodyTranscribing || !take.blobId}>
                <Music className="h-4 w-4" /> Transcribe Melody from Audio
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

      {(transcribing || melodyTranscribing) && (
        <div className="flex items-center justify-center gap-1.5 pt-0.5">
          <RefreshCw className="h-3 w-3 animate-spin" style={{ color: "var(--primary-strong)" }} />
          <span className="font-mono-chord text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
            {transcribing ? "Transcribing chords…" : "Detecting melody…"}
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

function DetectedMelodyStrip({ notes }: { notes: MelodyNote[] }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(notes.map((n) => n.noteName).join(" "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="w-[168px]">
      <div className="mb-0.5 flex items-center justify-between gap-1 px-0.5">
        <div className="flex items-center gap-1">
          <Music className="h-3 w-3" style={{ color: "var(--primary-strong)" }} />
          <span className="font-mono-chord text-[9px] font-semibold uppercase tracking-wide text-ink-soft">
            Melody
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy melody notes"
          title="Copy notes"
          className="p-0.5 text-ink-soft transition-colors hover:text-ink"
        >
          {copied ? (
            <Check className="h-3 w-3" style={{ color: "var(--primary-strong)" }} />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
      <div
        className="hide-scroll flex gap-1 overflow-x-auto rounded-lg p-1.5"
        style={{ background: "var(--paper-shade)" }}
      >
        {notes.map((n, i) => (
          <span
            key={i}
            className="noise-texture-chip shrink-0 select-none rounded-md bg-card px-1.5 py-1 font-mono-chord text-[12px] font-semibold text-ink"
            style={{ boxShadow: "var(--shadow-paper)" }}
            title={`${n.startSec.toFixed(1)}s – ${n.endSec.toFixed(1)}s`}
          >
            {n.noteName}
          </span>
        ))}
      </div>
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
