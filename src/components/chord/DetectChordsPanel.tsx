import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Upload, Trash2, Check, Play, Sparkles, Music2, ListMusic } from "lucide-react";
import { useTakesStore, type Take } from "@/store/takes";
import { useSongStore } from "@/store/song";
import { getAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import { parseChord, type ChordSymbol } from "@/lib/music/chords";
import { downmixMono, type DetectedChord } from "@/lib/music/detect-chords";
import type { DetectWorkerResponse } from "@/lib/music/detect-chords-worker-types";
import { cn } from "@/lib/utils";

type Phase = "source" | "analyzing" | "results";

interface EditableChord {
  id: string;
  chord: ChordSymbol;
  startSec: number;
  endSec: number;
  confidence: number;
  draft: string;
}

const FLAT_KEYS = ["F", "Bb", "Eb", "Ab", "Db", "Gb"];
const LOW_CONFIDENCE = 0.8;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DetectChordsPanel() {
  const takes = useTakesStore((s) => s.takes);
  const recordedTakes = takes.filter((t) => t.blobId);

  const [phase, setPhase] = useState<Phase>("source");
  const [progress, setProgress] = useState(0);
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EditableChord[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const teardownWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  useEffect(() => () => teardownWorker(), []);

  const reset = () => {
    teardownWorker();
    setPhase("source");
    setProgress(0);
    setError(null);
    setItems([]);
  };

  const analyze = async (blob: Blob, name: string) => {
    setError(null);
    setSourceName(name);
    setPhase("analyzing");
    setProgress(0);

    let audioBuf: AudioBuffer;
    try {
      const arrayBuf = await blob.arrayBuffer();
      audioBuf = await getAudioContext().decodeAudioData(arrayBuf);
    } catch {
      setError("Couldn't read that audio. Try a WAV, MP3, or M4A file.");
      setPhase("source");
      return;
    }

    const mono = downmixMono(audioBuf);
    const meta = useSongStore.getState().meta;
    const useFlat = meta.keyRoot.includes("b") || FLAT_KEYS.includes(meta.keyRoot);

    teardownWorker();
    const worker = new Worker(new URL("../../lib/music/detect-chords.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<DetectWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress(msg.progress);
      } else if (msg.type === "result") {
        setItems(msg.result.map(toEditable));
        setPhase("results");
        teardownWorker();
      } else {
        setError(msg.message || "Detection failed.");
        setPhase("source");
        teardownWorker();
      }
    };
    worker.postMessage({ channel: mono, sampleRate: audioBuf.sampleRate, useFlat }, [mono.buffer]);
  };

  const handleTake = async (take: Take) => {
    if (!take.blobId) return;
    const blob = await getAudioBlob(take.blobId);
    if (!blob) {
      setError("That recording's audio is no longer available.");
      return;
    }
    void analyze(blob, take.name);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void analyze(file, file.name);
  };

  const editDraft = (id: string, draft: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, draft, chord: parseChord(draft) ?? it.chord } : it)),
    );
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const addToLyrics = () => {
    if (!items.length) return;
    const store = useSongStore.getState();
    const sectionId = store.addSection("verse", "Detected");
    const pattern = useSongStore.getState().progression.find((p) => (p.sectionId ?? p.id) === sectionId);
    if (!pattern) return;
    const bpm = store.meta.bpm;
    // addChordToPattern populates the SectionChord projection, which mirrors
    // into BOTH the lyrics view and the progression pattern blocks.
    for (const it of items) {
      const beats = Math.max(1, Math.min(16, Math.round(((it.endSec - it.startSec) * bpm) / 60)));
      useSongStore.getState().addChordToPattern(pattern.id, it.chord, 0, beats);
    }
    toast.success(`Added ${items.length} chord${items.length > 1 ? "s" : ""} to a new “Detected” section`);
    reset();
  };

  return (
    <div
      className="mx-4 mb-3 rounded-xl border border-border bg-card p-3"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: "var(--primary-strong)" }} />
        <span className="text-[13px] font-bold text-ink">Detect Chords</span>
      </div>

      <div
        className="mt-2 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug"
        style={{ background: "color-mix(in oklch, var(--primary) 8%, transparent)", color: "var(--ink-soft)" }}
      >
        <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary-strong)" }} />
        <p>
          Runs on your device — nothing is uploaded. Best results come from{" "}
          <span className="font-bold" style={{ color: "var(--ink)" }}>clean recordings</span>: a single
          piano or guitar in a quiet room.
        </p>
      </div>

      {error && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--destructive, #c0392b)" }}>{error}</p>
      )}

      <div className="mt-3">
        {phase === "source" && (
          <SourceStep takes={recordedTakes} onTake={handleTake} onPickFile={() => fileInputRef.current?.click()} />
        )}
        {phase === "analyzing" && <AnalyzingStep name={sourceName} progress={progress} />}
        {phase === "results" && <ResultsStep items={items} onEdit={editDraft} onRemove={removeItem} />}
      </div>

      {phase === "results" && (
        <div className="mt-3 flex items-center gap-2 pt-3" style={{ borderTop: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}>
          <button
            type="button"
            onClick={reset}
            className="btn-sculpt-cream rounded-full px-4 py-1.5 text-xs font-bold"
          >
            Start over
          </button>
          <button
            type="button"
            onClick={addToLyrics}
            disabled={items.length === 0}
            className="btn-sculpt-amber ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            <ListMusic className="h-4 w-4" />
            Add Chords to Lyrics
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function toEditable(d: DetectedChord): EditableChord {
  return { id: nanoid(), chord: d.chord, startSec: d.startSec, endSec: d.endSec, confidence: d.confidence, draft: d.chord.display };
}

function SourceStep({ takes, onTake, onPickFile }: {
  takes: Take[];
  onTake: (t: Take) => void;
  onPickFile: () => void;
}) {
  return (
    <div className="space-y-3">
      {takes.length > 0 && (
        <div>
          <span className="font-mono-chord text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Choose a recording to analyze
          </span>
          <div className="mt-1.5 space-y-1.5">
            {takes.map((take) => (
              <button
                key={take.id}
                type="button"
                onClick={() => onTake(take)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
                style={{ background: "var(--paper-card)" }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary-strong)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-bold text-ink">{take.name}</div>
                  <div className="font-mono-chord text-[9px] text-ink-soft">{take.date}</div>
                </div>
                <span className="shrink-0 font-mono-chord text-[9.5px] text-ink-soft">{take.duration}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onPickFile}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-xs font-bold"
        style={{ borderColor: "color-mix(in oklch, var(--primary) 35%, transparent)", color: "var(--ink)" }}
      >
        <Upload className="h-4 w-4" style={{ color: "var(--primary-strong)" }} />
        Import an audio file
      </button>
    </div>
  );
}

function AnalyzingStep({ name, progress }: { name: string; progress: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
      <Sparkles className="h-7 w-7 animate-pulse" style={{ color: "var(--primary-strong)" }} />
      <div>
        <div className="text-[13px] font-bold text-ink">Listening to “{name}”…</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Analyzing on your device</div>
      </div>
      <div className="h-2 w-48 overflow-hidden rounded-full" style={{ background: "var(--paper-shade)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%`, background: "var(--primary)" }}
        />
      </div>
    </div>
  );
}

function ResultsStep({ items, onEdit, onRemove }: {
  items: EditableChord[];
  onEdit: (id: string, draft: string) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No chords detected. Try a cleaner recording — a single instrument with clear, sustained chords.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="mb-1 text-[11px] text-muted-foreground">
        {items.length} chord{items.length > 1 ? "s" : ""} detected. Tap any chord to correct it.
      </p>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {items.map((it) => {
          const colors = getChordColorClasses(it.chord);
          const low = it.confidence < LOW_CONFIDENCE;
          return (
            <div key={it.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--paper-card)" }}>
              <span className="w-16 shrink-0 font-mono-chord text-[9.5px] text-ink-soft">
                {fmtTime(it.startSec)}–{fmtTime(it.endSec)}
              </span>
              <span
                className={cn(colors.className, "noise-texture-chip inline-flex shrink-0 items-center rounded-md px-2 py-0.5")}
                style={colors.style}
              >
                <input
                  value={it.draft}
                  onChange={(e) => onEdit(it.id, e.target.value)}
                  className="w-14 bg-transparent font-mono-chord text-sm font-semibold outline-none"
                  style={{ color: "inherit" }}
                  aria-label="Edit detected chord"
                />
              </span>
              <button
                type="button"
                onClick={() => void playChord(it.chord)}
                aria-label="Preview chord"
                className="shrink-0 rounded-full p-1.5"
                style={{ background: "var(--paper-shade)" }}
              >
                <Play className="h-3.5 w-3.5" style={{ color: "var(--ink)" }} />
              </button>
              {low && (
                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in oklch, var(--primary) 18%, transparent)", color: "var(--primary-strong)" }}>
                  low
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                aria-label="Remove chord"
                className="ml-auto shrink-0 p-1 text-ink-soft hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
