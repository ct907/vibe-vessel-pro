import { useState, useRef, useEffect } from "react";
import { nanoid } from "nanoid";
import { Plus, Trash2, Timer, GripVertical, Copy, Star, Repeat, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { useSongStore } from "@/store/song";
import {
  useRecordingsStore,
  type RecTrack,
  type RecClip,
  clipEndSec,
  clipBodySec,
  clipSpanSec,
} from "@/store/recordings";
import { useTakesStore } from "@/store/takes";
import { useIsMobile } from "@/hooks/use-mobile";
import { Waveform } from "@/components/common/Waveform";
import { startRecording, type RecorderHandle } from "@/lib/audio/recorder";
import { putAudioBlob, deleteAudioBlob, getAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";
import { decodeBlob, cachedPeaks, invalidatePeaks } from "@/lib/audio/waveform";
import { clearDecodedCache } from "@/lib/audio/recordings-engine";

const PX_PER_BAR = 26;

const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Hash a string into a stable waveform seed. */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100;
  return h;
}

/** Real decoded-peaks waveform for a clip. Falls back to a seed placeholder
 *  while the blob decodes. `tileWidth`, when set, repeats the peaks every
 *  `tileWidth` px (used to draw looped clips). */
function ClipWaveform({
  blobId,
  width,
  height,
  color,
  opacity = 1,
  tileWidth,
}: {
  blobId: string;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  tileWidth?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const blob = await getAudioBlob(blobId);
        if (!blob || cancelled) return;
        const buf = await decodeBlob(blob);
        if (!cancelled) setBuffer(buf);
      } catch {
        /* keep placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blobId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const tile = Math.max(1, Math.floor(tileWidth ?? w));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const peaks = cachedPeaks(blobId, buffer, tile);
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    const mid = h / 2;
    for (let i = 0; i < w; i++) {
      const p = peaks[i % tile] ?? 0;
      const bar = Math.max(1, p * h);
      ctx.fillRect(i, mid - bar / 2, 1, bar);
    }
    if (tileWidth && tile < w) {
      ctx.globalAlpha = opacity * 0.5;
      for (let x = tile; x < w; x += tile) ctx.fillRect(x, 0, 1, h);
    }
  }, [buffer, blobId, width, height, color, opacity, tileWidth]);

  if (!buffer) {
    return (
      <Waveform width={width} height={height} seed={seedFromId(blobId)} color={color} opacity={opacity} />
    );
  }
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

/** Bars for a section = sum of its pattern bars, or a sensible default. */
function useSectionBars() {
  const sections = useSongStore((s) => s.sections);
  const progression = useSongStore((s) => s.progression);
  const beatsPerBar = useSongStore((s) => s.meta.beatsPerBar);
  let cursor = 0;
  const layout = sections.map((sec) => {
    const bars =
      progression
        .filter((p) => (p.sectionId ?? p.id) === sec.id)
        .reduce((a, p) => a + p.bars, 0) || 4;
    const chords = [...new Map(sec.chords.map((c) => [c.chord.display, c.chord])).values()].slice(0, 4);
    const tintKey = sec.color;
    const block = { id: sec.id, label: sec.label, bars, chords, startBar: cursor, tintKey };
    cursor += bars;
    return block;
  });
  return { layout, totalBars: cursor, beatsPerBar };
}

/** Takes clipboard tray, pinned at the top of Track view. Shows every take
 *  (starred ones first) so any recording can be dragged in without a trip back
 *  to Write to star it. */
function BestTakesTray() {
  const takes = useTakesStore((s) => s.takes);
  const ordered = [...takes].sort((a, b) => Number(!!b.best) - Number(!!a.best));
  return (
    <div className="px-4 pb-3">
      <div className="rounded-xl border border-border p-2.5" style={{ background: "var(--paper-shade-soft)" }}>
        <div className="mb-2 flex items-center gap-1.5">
          <Copy className="h-3.5 w-3.5 text-ink-soft" />
          <span className="font-mono-chord text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Takes — drag into a track
          </span>
        </div>
        <Droppable droppableId="takes-tray" type="take" direction="horizontal" isDropDisabled={true}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="hide-scroll flex gap-2 overflow-x-auto"
            >
              {ordered.length === 0 ? (
                <span className="py-1.5 text-xs italic text-ink-soft">Record takes in Write to drag them here.</span>
              ) : (
                ordered.map((take, i) => (
                  <Draggable key={take.id} draggableId={`take:${take.id}`} index={i}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        className="flex shrink-0 cursor-grab items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-2 pr-2.5"
                        style={{
                          boxShadow: snapshot.isDragging ? "var(--shadow-sculpt-amber)" : "var(--shadow-card)",
                          opacity: snapshot.isDragging ? 0.85 : 1,
                          ...dragProvided.draggableProps.style,
                        }}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-ink-soft" />
                        {take.best && (
                          <Star className="h-3 w-3" style={{ fill: "var(--star,#e8a838)", color: "var(--star,#e8a838)" }} />
                        )}
                        <span className="whitespace-nowrap text-xs font-bold text-ink">{take.name}</span>
                        <Waveform width={44} height={14} seed={take.seed} color="var(--primary)" />
                        <span className="font-mono-chord text-[9px] text-ink-soft">{take.duration}</span>
                      </div>
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );
}

/** Delay-compensation stepper panel (±1s / ±100ms / ±10ms). UI state only. */
function DelayPanel({ offsetMs, onNudge }: { offsetMs: number; onNudge: (d: number) => void }) {
  const rows: Array<{ label: string; delta: number }> = [
    { label: "±1 s", delta: 1000 },
    { label: "±100 ms", delta: 100 },
    { label: "±10 ms", delta: 10 },
  ];
  return (
    <div
      className="flex flex-col gap-1.5 border-t border-border p-3"
      style={{ background: "var(--paper-shade-soft)" }}
    >
      <div className="font-mono-chord text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
        Delay compensation
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2">
            <span className="w-14 text-[11px] text-ink-soft">{r.label}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNudge(-r.delta)}
                aria-label={`Back ${r.label}`}
                className="inline-flex h-7 w-[30px] items-center justify-center rounded-md border border-border bg-paper text-base font-bold text-ink"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onNudge(r.delta)}
                aria-label={`Forward ${r.label}`}
                className="inline-flex h-7 w-[30px] items-center justify-center rounded-md border border-border bg-paper text-base font-bold text-ink"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-soft">
        Offset:{" "}
        <span className="font-mono-chord text-ink">
          {(offsetMs >= 0 ? "+" : "") + (offsetMs / 1000).toFixed(3)} s
        </span>
      </div>
    </div>
  );
}

/** BandLab-style rolling timeline. */
export function TrackTimeline() {
  const isMobile = useIsMobile();
  const { layout, totalBars, beatsPerBar } = useSectionBars();
  const bpm = useSongStore((s) => s.meta.bpm);
  const tracks = useRecordingsStore((s) => s.tracks);
  const addTrack = useRecordingsStore((s) => s.addTrack);
  const addClip = useRecordingsStore((s) => s.addClip);
  const removeClip = useRecordingsStore((s) => s.removeClip);
  const setClipStart = useRecordingsStore((s) => s.setClipStart);
  const setClipTrim = useRecordingsStore((s) => s.setClipTrim);
  const setClipLoop = useRecordingsStore((s) => s.setClipLoop);
  const setTrackOffsetMs = useRecordingsStore((s) => s.setTrackOffsetMs);
  const clearTrackClips = useRecordingsStore((s) => s.clearTrackClips);
  const recUndo = useRecordingsStore((s) => s.undo);
  const moveClip = useRecordingsStore((s) => s.moveClip);
  const beginClipEdit = useRecordingsStore((s) => s.beginClipEdit);
  const recordingTrackId = useRecordingsStore((s) => s.recordingTrackId);
  const setRecording = useRecordingsStore((s) => s.setRecording);
  const playheadSec = useRecordingsStore((s) => s.playheadSec);
  const setPlayheadSec = useRecordingsStore((s) => s.setPlayheadSec);

  const recorderRef = useRef<RecorderHandle | null>(null);
  const [pendingTid, setPendingTid] = useState<string | null>(null);
  const [recLevel, setRecLevel] = useState(0);
  const [recElapsed, setRecElapsed] = useState(0);

  // Live elapsed-time readout while a track is recording.
  useEffect(() => {
    if (!recordingTrackId) {
      setRecElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setRecElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [recordingTrackId]);

  const [delayOpen, setDelayOpen] = useState<string | null>(null);

  const [selected, setSelected] = useState<{ trackId: string; blobId: string } | null>(null);
  const [hoverTrackId, setHoverTrackId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTargetRef = useRef<string | null>(null);

  const dragRef = useRef<
    | {
        mode: "move" | "trim-left" | "trim-right" | "loop";
        trackId: string;
        blobId: string;
        durationSec: number;
        grabOffsetSec: number;
        origStart: number;
        origTrimStart: number;
        origTrimEnd: number;
        origClientX: number;
        moved: boolean;
      }
    | null
  >(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef(false);

  const selectedClip = selected
    ? tracks.find((t) => t.id === selected.trackId)?.clips.find((c) => c.blobId === selected.blobId) ?? null
    : null;
  const selectedTrack = selected ? tracks.find((t) => t.id === selected.trackId) ?? null : null;

  // Deferred-destroy: removing a clip is undoable (store history), but the audio
  // blob in IndexedDB is not. Hold off on deleting the bytes so Undo can restore
  // the clip with its audio intact; prune only if the toast wasn't undone and the
  // blob is no longer referenced.
  const pruneBlobsUnlessUndone = (blobIds: string[], message: string) => {
    let undone = false;
    toast(message, { action: { label: "Undo", onClick: () => { undone = true; recUndo(); } } });
    window.setTimeout(() => {
      if (undone) return;
      const referenced = new Set(
        useRecordingsStore.getState().tracks.flatMap((tr) => tr.clips.map((c) => c.blobId)),
      );
      blobIds.forEach((id) => { if (!referenced.has(id)) void deleteAudioBlob(id); });
    }, 8000);
  };

  const deleteClip = (trackId: string, blobId: string) => {
    removeClip(trackId, blobId);
    clearDecodedCache(blobId);
    invalidatePeaks(blobId);
    setSelected((s) => (s?.blobId === blobId ? null : s));
    pruneBlobsUnlessUndone([blobId], "Clip deleted");
  };

  const duplicateClip = async (track: RecTrack, clip: RecClip) => {
    const blob = await getAudioBlob(clip.blobId);
    if (!blob) return;
    const newId = nanoid();
    await putAudioBlob(newId, blob);
    const copy: RecClip = { ...clip, blobId: newId, startSec: clipEndSec(clip) };
    addClip(track.id, copy);
    setSelected({ trackId: track.id, blobId: newId });
  };

  const triggerImport = (trackId: string) => {
    importTargetRef.current = trackId;
    fileInputRef.current?.click();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const trackId = importTargetRef.current;
    e.target.value = "";
    importTargetRef.current = null;
    if (!file || !trackId) return;
    let durationSec = 0;
    try {
      const buf = await decodeBlob(file);
      durationSec = buf.duration;
    } catch {
      toast.error("Could not decode audio file");
      return;
    }
    const blobId = nanoid();
    await putAudioBlob(blobId, file);
    const startSec = useRecordingsStore.getState().playheadSec;
    const clip: RecClip = {
      blobId,
      mime: file.type || "audio/mpeg",
      durationSec,
      startSec,
      trimStartSec: 0,
      trimEndSec: durationSec,
    };
    addClip(trackId, clip);
    setSelected({ trackId, blobId });
    toast.success(`Imported ${file.name}`);
  };

  const onClipPointerDown = (e: React.PointerEvent, track: RecTrack, clip: RecClip) => {
    e.stopPropagation();
    e.preventDefault();
    const mode = ((e.target as HTMLElement).dataset.handle as
      | "trim-left"
      | "trim-right"
      | "loop"
      | undefined) ?? "move";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      trackId: track.id,
      blobId: clip.blobId,
      durationSec: clip.durationSec,
      grabOffsetSec: clientXToSec(e.clientX) - clip.startSec,
      origStart: clip.startSec,
      origTrimStart: clip.trimStartSec,
      origTrimEnd: clip.trimEndSec,
      origClientX: e.clientX,
      moved: false,
    };
  };

  const onClipPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const sec = clientXToSec(e.clientX);
    if (!d.moved && Math.abs(e.clientX - d.origClientX) > 4) {
      d.moved = true;
      beginClipEdit();
      if (d.mode === "move") (e.currentTarget as HTMLElement).style.pointerEvents = "none";
    }
    if (d.mode === "move") {
      setClipStart(d.trackId, d.blobId, Math.max(0, sec - d.grabOffsetSec));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const lane = el?.closest("[data-lane-track]");
      setHoverTrackId(lane?.getAttribute("data-lane-track") ?? d.trackId);
    } else if (d.mode === "trim-left") {
      let nStart = Math.max(0, sec);
      let nTrimStart = d.origTrimStart + (nStart - d.origStart);
      nTrimStart = Math.max(0, Math.min(nTrimStart, d.origTrimEnd - 0.05));
      nStart = d.origStart + (nTrimStart - d.origTrimStart);
      setClipTrim(d.trackId, d.blobId, nTrimStart, d.origTrimEnd);
      setClipStart(d.trackId, d.blobId, nStart);
    } else if (d.mode === "trim-right") {
      let nTrimEnd = d.origTrimStart + (sec - d.origStart);
      nTrimEnd = Math.max(d.origTrimStart + 0.05, Math.min(nTrimEnd, d.durationSec));
      setClipTrim(d.trackId, d.blobId, d.origTrimStart, nTrimEnd);
    } else if (d.mode === "loop") {
      setClipLoop(d.trackId, d.blobId, Math.max(0, sec - d.origStart));
    }
  };

  const onClipPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    (e.currentTarget as HTMLElement).style.pointerEvents = "";
    if (d.mode === "move" && d.moved) {
      const st = useRecordingsStore.getState();
      const cur = st.tracks.find((t) => t.id === d.trackId)?.clips.find((c) => c.blobId === d.blobId);
      const ns = cur?.startSec ?? d.origStart;
      const dest = hoverTrackId ?? d.trackId;
      moveClip(d.trackId, dest, d.blobId, ns);
      setSelected({ trackId: dest, blobId: d.blobId });
    } else if (!d.moved) {
      setSelected({ trackId: d.trackId, blobId: d.blobId });
    }
    setHoverTrackId(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteClip(selected.trackId, selected.blobId);
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const LANE_H = isMobile ? 114 : 78;
  const LABEL_W = isMobile ? 138 : 156;
  const secPerBar = (60 / bpm) * beatsPerBar;

  // Default the timeline to 10 minutes, extending to fit the longest clip.
  const MIN_TIMELINE_SEC = 600;
  const maxClipEnd = tracks.reduce(
    (m, t) => t.clips.reduce((mm, c) => Math.max(mm, clipEndSec(c)), m),
    0,
  );
  const displayBars = Math.max(
    totalBars,
    Math.ceil(Math.max(MIN_TIMELINE_SEC, maxClipEnd) / secPerBar),
  );
  const timelineW = displayBars * PX_PER_BAR;

  const nudge = (tid: string, d: number) => {
    const cur = tracks.find((t) => t.id === tid)?.offsetMs ?? 0;
    setTrackOffsetMs(tid, cur + d);
  };

  const clearTrack = (t: RecTrack) => {
    const blobIds = t.clips.map((c) => c.blobId);
    if (blobIds.length === 0) return;
    clearTrackClips(t.id);
    blobIds.forEach((id) => { clearDecodedCache(id); invalidatePeaks(id); });
    setSelected((s) => (s && s.trackId === t.id ? null : s));
    pruneBlobsUnlessUndone(blobIds, "Track cleared");
  };

  /** Convert a pointer clientX to a timeline position in seconds, accounting for scroll. */
  const clientXToSec = (clientX: number): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const xInContent = clientX - rect.left + el.scrollLeft - LABEL_W;
    return Math.max(0, (xInContent / PX_PER_BAR) * secPerBar);
  };

  const handleRulerClick = (e: React.MouseEvent) => {
    if (isDraggingPlayhead.current) return;
    setPlayheadSec(clientXToSec(e.clientX));
  };

  const handleLaneClick = (e: React.MouseEvent) => {
    if (isDraggingPlayhead.current) return;
    // Only set playhead when clicking the bare lane background, not on clips
    if ((e.target as HTMLElement).closest("[data-clip]")) return;
    setSelected(null);
    setPlayheadSec(clientXToSec(e.clientX));
  };

  const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingPlayhead.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePlayheadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPlayhead.current) return;
    setPlayheadSec(clientXToSec(e.clientX));
  };

  const handlePlayheadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingPlayhead.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  const playheadX = LABEL_W + (playheadSec / secPerBar) * PX_PER_BAR;
  const playheadBar = Math.floor(playheadSec / secPerBar) + 1;

  const toggleRecord = async (tid: string) => {
    if (recordingTrackId === tid) {
      const handle = recorderRef.current;
      recorderRef.current = null;
      setRecording(false, null);
      setRecLevel(0);
      if (!handle) return;
      setPendingTid(tid);
      try {
        const { blob, durationSec, mime } = await handle.stop();
        const blobId = nanoid();
        await putAudioBlob(blobId, blob);
        const startSec = useRecordingsStore.getState().playheadSec;
        const clip: RecClip = { blobId, mime, durationSec, startSec, trimStartSec: 0, trimEndSec: durationSec };
        addClip(tid, clip);
        setPlayheadSec(startSec + durationSec);
      } catch {
        toast.error("Couldn't save that recording", {
          description: "Something went wrong storing the audio. Please try recording again.",
        });
      } finally {
        setPendingTid(null);
      }
      return;
    }
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
      setRecording(false, null);
      setRecLevel(0);
      setPendingTid(null);
    }
    try {
      const ac = getAudioContext();
      if (ac.state === "suspended") await ac.resume();
      const handle = await startRecording({ onLevel: setRecLevel });
      recorderRef.current = handle;
      setRecording(true, tid);
    } catch {
      setRecording(false, null);
    }
  };

  // Phone locked or app backgrounded mid-recording: finalize and save the clip
  // instead of letting the browser kill the recorder and lose the audio.
  const stopOnHideRef = useRef<() => void>(() => {});
  stopOnHideRef.current = () => {
    if (recorderRef.current && recordingTrackId) void toggleRecord(recordingTrackId);
  };
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stopOnHideRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return (
    <div className="pb-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        className="hidden"
        onChange={handleFilePicked}
      />
      <BestTakesTray />

      <div className="flex items-center gap-2.5 px-4 pb-2.5">
        <span className="font-mono-chord text-[11px] text-ink-soft">
          {totalBars} bars · {beatsPerBar}/4
        </span>
        <div className="flex-1" />
        <span className="text-[11px] font-bold text-ink-soft">{tracks.length} tracks</span>
      </div>

      <div ref={scrollRef} className="hide-scroll overflow-x-auto border-t border-border">
        <div style={{ width: timelineW + LABEL_W, position: "relative" }}>
          {/* Bar ruler — click to set playhead */}
          <div
            className="flex h-[18px] cursor-col-resize"
            style={{ paddingLeft: LABEL_W, background: "var(--paper-shade-soft)" }}
            onClick={handleRulerClick}
          >
            {Array.from({ length: Math.ceil(displayBars / 4) }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 border-l border-border pl-1 font-mono-chord text-[9px] text-ink-soft"
                style={{ width: PX_PER_BAR * 4, boxSizing: "border-box" }}
              >
                {i * 4 + 1}
              </div>
            ))}
          </div>

          {/* Section / chord lane */}
          <div className="flex gap-0.5 py-1" style={{ paddingLeft: LABEL_W }}>
            {layout.map((sec) => (
              <div
                key={sec.id}
                className="shrink-0 overflow-hidden rounded-md px-1.5 py-1"
                style={{
                  width: sec.bars * PX_PER_BAR - 2,
                  background: sec.tintKey ? `var(--section-tint-${sec.tintKey})` : "var(--paper-shade)",
                  boxSizing: "border-box",
                }}
              >
                <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.04em] text-cocoa-deep">
                  {sec.label}
                </span>
                <div className="mt-0.5 flex gap-0.5">
                  {sec.chords.map((c, i) => (
                    <span
                      key={i}
                      className="whitespace-nowrap rounded px-1 py-px font-mono-chord text-[8.5px] font-bold text-cocoa-deep"
                      style={{ background: "rgba(255,255,255,0.45)" }}
                    >
                      {c.display}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Track lanes */}
          <div className="relative">
            {/* Playhead */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-[6] w-0.5"
              style={{ left: playheadX, background: "var(--destructive)" }}
            >
              {/* Draggable handle — overlaps ruler so the user can grab it */}
              <div
                className="pointer-events-auto absolute -top-[18px] flex cursor-col-resize flex-col items-center"
                style={{ left: -9, width: 18 }}
                onPointerDown={handlePlayheadPointerDown}
                onPointerMove={handlePlayheadPointerMove}
                onPointerUp={handlePlayheadPointerUp}
              >
                {/* Bar label */}
                <span
                  className="font-mono-chord select-none whitespace-nowrap text-[8px] font-bold leading-none"
                  style={{ color: "var(--destructive)" }}
                >
                  {playheadBar}
                </span>
                {/* Circle */}
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: "var(--destructive)", marginTop: 1 }}
                />
              </div>
            </div>

            {tracks.map((track) => {
              const isRec = recordingTrackId === track.id;
              const showDelay = delayOpen === track.id;
              const offBars = ((track.offsetMs || 0) / 1000 / secPerBar);
              return (
                <div key={track.id}>
                  <div className="flex items-stretch border-b border-border" style={{ minHeight: LANE_H }}>
                    {/* Sticky label + controls */}
                    <div
                      className="sticky left-0 z-[5] flex shrink-0 flex-col justify-center gap-3 border-r border-border px-2.5 py-2"
                      style={{ width: LABEL_W, background: isRec ? "#fbe9e9" : "var(--paper-shade-soft)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: track.color }}
                        />
                        <span className="truncate text-xs font-bold text-ink">{track.name}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => void toggleRecord(track.id)}
                          aria-label={isRec ? "Stop recording" : "Record"}
                          disabled={pendingTid === track.id}
                          className={
                            "inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-destructive" +
                            (isRec ? " animate-rec-pulse" : "") +
                            (pendingTid === track.id ? " opacity-50" : "")
                          }
                          style={{ background: "var(--destructive)" }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: isRec ? 2 : 5,
                              background: "#fff",
                            }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => clearTrack(track)}
                          aria-label="Clear track"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerImport(track.id)}
                          aria-label="Import audio"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:text-ink"
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDelayOpen(showDelay ? null : track.id)}
                          aria-label="Delay compensation"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:text-ink"
                        >
                          <Timer className="h-3.5 w-3.5" />
                        </button>
                        {track.offsetMs ? (
                          <span className="font-mono-chord text-[8.5px] text-ink-soft">
                            {(track.offsetMs > 0 ? "+" : "") + track.offsetMs}ms
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Lane — droppable for takes */}
                    <Droppable droppableId={`track:${track.id}`} type="take" direction="horizontal">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          data-lane-track={track.id}
                          className="relative flex-1"
                          style={{
                            background: snapshot.isDraggingOver || hoverTrackId === track.id
                              ? "var(--primary-halo)"
                              : isRec
                              ? "#fdf3f3"
                              : "var(--card)",
                          }}
                          onClick={handleLaneClick}
                        >
                          {Array.from({ length: Math.ceil(displayBars / 4) }).map((_, i) => (
                            <div
                              key={i}
                              className="absolute bottom-0 top-0"
                              style={{
                                left: i * 4 * PX_PER_BAR,
                                width: 1,
                                background: "var(--border)",
                                opacity: 0.6,
                              }}
                            />
                          ))}
                          {track.clips.map((clip) => {
                            const body = clipBodySec(clip);
                            const span = clipSpanSec(clip);
                            const looped = (clip.loopSec ?? 0) > body + 0.001;
                            const startBar = clip.startSec / secPerBar + offBars;
                            const spanBars = Math.max(0.5, span / secPerBar);
                            const bodyBars = Math.max(0.5, body / secPerBar);
                            const widthPx = spanBars * PX_PER_BAR - 4;
                            const bodyWidthPx = bodyBars * PX_PER_BAR - 4;
                            const innerW = Math.max(8, widthPx - 12);
                            const isSel = selected?.blobId === clip.blobId && selected?.trackId === track.id;
                            const handleW = isMobile ? 14 : 9;
                            const trimRightLeft = (looped ? bodyWidthPx : widthPx) - handleW;
                            return (
                              <div
                                key={clip.blobId}
                                data-clip="1"
                                onPointerDown={(e) => onClipPointerDown(e, track, clip)}
                                onPointerMove={onClipPointerMove}
                                onPointerUp={onClipPointerUp}
                                className="absolute flex touch-none cursor-grab flex-col justify-center overflow-hidden rounded-md px-1.5"
                                style={{
                                  top: 6,
                                  bottom: 6,
                                  left: startBar * PX_PER_BAR + 2,
                                  width: widthPx,
                                  background: track.color,
                                  boxShadow: isSel
                                    ? "0 0 0 2px var(--paper), 0 0 0 4px var(--primary), 0 1px 4px rgba(61,43,26,0.18)"
                                    : "0 1px 4px rgba(61,43,26,0.18)",
                                  zIndex: isSel ? 3 : 1,
                                }}
                              >
                                <span
                                  className="pointer-events-none truncate text-[9px] font-bold text-white"
                                  style={{ textShadow: "0 1px 1px rgba(0,0,0,0.2)" }}
                                >
                                  {track.name}
                                  {looped ? ` · ${Math.round(span / Math.max(0.01, body) * 10) / 10}×` : ""}
                                </span>
                                <div className="pointer-events-none">
                                  <ClipWaveform
                                    blobId={clip.blobId}
                                    width={innerW}
                                    height={isMobile ? 34 : 22}
                                    color="#fff"
                                    opacity={0.55}
                                    tileWidth={looped ? Math.max(4, (body / span) * innerW) : undefined}
                                  />
                                </div>
                                {isSel && (
                                  <>
                                    <div
                                      data-handle="trim-left"
                                      className="absolute bottom-0 left-0 top-0 cursor-ew-resize"
                                      style={{ width: handleW, background: "rgba(255,255,255,0.35)" }}
                                    />
                                    <div
                                      data-handle="trim-right"
                                      className="absolute bottom-0 top-0 cursor-ew-resize"
                                      style={{ left: trimRightLeft, width: handleW, background: "rgba(255,255,255,0.35)" }}
                                    />
                                    <div
                                      data-handle="loop"
                                      aria-label="Loop clip"
                                      className="absolute flex cursor-ew-resize items-center justify-center rounded"
                                      style={{
                                        top: 2,
                                        right: 2,
                                        width: 16,
                                        height: 16,
                                        background: looped ? "var(--primary-strong)" : "rgba(0,0,0,0.25)",
                                      }}
                                    >
                                      <Repeat className="pointer-events-none h-2.5 w-2.5 text-white" />
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                          {track.clips.length === 0 && !isRec && !snapshot.isDraggingOver && (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] italic text-ink-soft">
                              Drop a take or record
                            </div>
                          )}
                          {snapshot.isDraggingOver && (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: "var(--primary)" }}>
                              Drop here
                            </div>
                          )}
                          {isRec && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                              <span className="text-[11px] font-bold text-destructive">● Recording… {fmtElapsed(recElapsed)}</span>
                              <div className="h-1 w-20 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.12)" }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.round(recLevel * 100)}%`,
                                    background: "var(--destructive)",
                                    transition: "width 80ms linear",
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                  {showDelay && (
                    <div className="flex border-b border-border">
                      <div className="sticky left-0 z-[5]" style={{ width: "min(92vw, 320px)" }}>
                        <DelayPanel offsetMs={track.offsetMs || 0} onNudge={(d) => nudge(track.id, d)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add track */}
            <div className="flex h-10 items-center">
              <div className="sticky left-0 z-[5] shrink-0 px-2" style={{ width: LABEL_W }}>
                <button
                  type="button"
                  onClick={() => addTrack()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold text-ink-soft"
                  style={{ border: "1.5px dashed var(--border)" }}
                >
                  <Plus className="h-3 w-3" /> Add track
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedClip && selectedTrack && (
        <div className="px-4 pt-3">
          <div
            className="flex items-center gap-2 rounded-xl border border-border p-2"
            style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selectedTrack.color }} />
            <span className="truncate text-xs font-bold text-ink">{selectedTrack.name}</span>
            <span className="font-mono-chord text-[10px] text-ink-soft">
              {clipBodySec(selectedClip).toFixed(1)}s
              {(selectedClip.loopSec ?? 0) > clipBodySec(selectedClip) + 0.001
                ? ` · loop ${clipSpanSec(selectedClip).toFixed(1)}s`
                : ""}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void duplicateClip(selectedTrack, selectedClip)}
              className="btn-sculpt-cream inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            {(selectedClip.loopSec ?? 0) > clipBodySec(selectedClip) + 0.001 && (
              <button
                type="button"
                onClick={() => setClipLoop(selectedTrack.id, selectedClip.blobId, undefined)}
                className="btn-sculpt-cream inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
              >
                <Repeat className="h-3.5 w-3.5" /> Unloop
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteClip(selectedTrack.id, selectedClip.blobId)}
              className="btn-sculpt-destructive inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Deselect clip"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
