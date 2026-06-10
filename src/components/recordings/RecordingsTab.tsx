import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Plus, Upload, Trash2, Volume2, RefreshCw, Pencil, ChevronLeft, ChevronRight, Settings2, Timer, Music2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSongStore } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import {
  MAX_TRACKS,
  TRACK_COLOR_PRESETS,
  clipEndSec,
  useRecordingsStore,
  type RecClip,
  type RecTrack,
} from "@/store/recordings";
import { startMetronome, stopMetronome } from "@/lib/audio/metronome";
import { putAudioBlob, deleteAudioBlob } from "@/lib/audio/blob-store";
import { decodeBlob, cachedPeaks, invalidatePeaks } from "@/lib/audio/waveform";
import { startRecording, type RecorderHandle } from "@/lib/audio/recorder";
import { clearDecodedCache, getLoopSec, getLoopStartCtxTime, isEngineRunning } from "@/lib/audio/recordings-engine";
import { getAudioContext } from "@/lib/audio/context";
import { toast } from "sonner";

const PX_PER_SEC = 40;
const ROW_HEIGHT_MOBILE = 80;
const ROW_HEIGHT_DESKTOP = 96;
const TRACK_PANEL_WIDTH = 224; // w-56, must match TrackRow left panel

function computeLoopBeats(): number {
  const { sections, progression } = useSongStore.getState();
  let total = 0;
  for (const sec of sections) {
    const patterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    for (const p of patterns) total += p.bars * p.beatsPerBar;
  }
  return total;
}

function useLoopSec(): number {
  const sections = useSongStore((s) => s.sections);
  const progression = useSongStore((s) => s.progression);
  const bpm = useSongStore((s) => s.meta.bpm);
  return useMemo(() => {
    let total = 0;
    for (const sec of sections) {
      const patterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
      for (const p of patterns) total += p.bars * p.beatsPerBar;
    }
    if (total === 0) return 8; // sensible fallback while user has no chords
    return (total * 60) / bpm;
  }, [sections, progression, bpm]);
}

interface BarSegment {
  startSec: number;
  endSec: number;
  color: string;
}

function useBarsStrip(): BarSegment[] {
  const sections = useSongStore((s) => s.sections);
  const progression = useSongStore((s) => s.progression);
  const bpm = useSongStore((s) => s.meta.bpm);
  return useMemo(() => {
    const out: BarSegment[] = [];
    const spb = 60 / bpm;
    let cursorBeat = 0;
    for (const sec of sections) {
      const patterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
      for (const p of patterns) {
        const patternBeats = p.bars * p.beatsPerBar;
        const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
        if (sorted.length === 0) {
          out.push({
            startSec: cursorBeat * spb,
            endSec: (cursorBeat + patternBeats) * spb,
            color: "var(--paper-shade)",
          });
        } else {
          for (let i = 0; i < sorted.length; i++) {
            const c = sorted[i];
            const next = sorted[i + 1];
            const localEnd = next ? next.startBeat : patternBeats;
            out.push({
              startSec: (cursorBeat + c.startBeat) * spb,
              endSec: (cursorBeat + localEnd) * spb,
              color: chordColorHash(c.chord ? `${c.chord.root}${c.chord.quality ?? ""}` : ""),
            });
          }
        }
        cursorBeat += patternBeats;
      }
    }
    return out;
  }, [sections, progression, bpm]);
}

function chordColorHash(label: string): string {
  if (!label) return "var(--paper-shade)";
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `oklch(0.78 0.10 ${hue})`;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${String(Math.floor(r)).padStart(2, "0")}`;
}

function WaveformCanvas({
  blobId,
  width,
  height,
  color,
}: {
  blobId: string;
  width: number;
  height: number;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@/lib/audio/blob-store");
        const blob = await mod.getAudioBlob(blobId);
        if (!blob || cancelled) return;
        const buf = await decodeBlob(blob);
        if (!cancelled) setBuffer(buf);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blobId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!buffer) {
      ctx.fillStyle = "var(--paper-shade)";
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const peaks = cachedPeaks(blobId, buffer, Math.max(1, Math.floor(width)));
    ctx.fillStyle = color;
    const mid = height / 2;
    for (let i = 0; i < peaks.length; i++) {
      const h = peaks[i] * (height * 0.85);
      ctx.fillRect(i, mid - h / 2, 1, h);
    }
  }, [buffer, width, height, color, blobId]);

  return <canvas ref={canvasRef} className="block rounded-md" />;
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {TRACK_COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border-2 transition-transform ${
            value === c ? "border-foreground scale-110" : "border-transparent"
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function DelayCompensationControl({
  startSec,
  onChange,
  maxSec,
}: {
  startSec: number;
  onChange: (sec: number) => void;
  maxSec: number;
}) {
  const nudge = (deltaMs: number) => {
    const next = Math.max(0, Math.min(maxSec - 0.01, startSec + deltaMs / 1000));
    onChange(next);
  };
  const Row = ({ label, deltaMs }: { label: string; deltaMs: number }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground w-12">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => nudge(-deltaMs)}
          aria-label={`Back ${label}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => nudge(deltaMs)}
          aria-label={`Forward ${label}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Delay compensation
      </div>
      <Row label="±1 s" deltaMs={1000} />
      <Row label="±100 ms" deltaMs={100} />
      <Row label="±10 ms" deltaMs={10} />
      <div className="text-xs text-muted-foreground mt-1">
        Offset: <span className="font-mono">{(startSec >= 0 ? "+" : "") + startSec.toFixed(3)} s</span>
      </div>
    </div>
  );
}

function OverflowDialog({
  open,
  onChoose,
  factor,
  durationSec,
  loopSec,
}: {
  open: boolean;
  onChoose: (choice: "trim" | "expand" | "cancel") => void;
  factor: number;
  durationSec: number;
  loopSec: number;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onChoose("cancel")}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recording is longer than the song</DialogTitle>
          <DialogDescription>
            Your take is {durationSec.toFixed(1)}s but the loop is only {loopSec.toFixed(1)}s.
            Trim the take to the song length, or expand the song to fit (×{factor})?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onChoose("trim")}>
            Trim to song length
          </Button>
          <Button onClick={() => onChoose("expand")} className="btn-sculpt-amber">
            Expand song ×{factor}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Playhead({ loopSec, waveformWidth }: { loopSec: number; waveformWidth: number }) {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const [x, setX] = useState(0);
  useEffect(() => {
    if (!isPlaying) {
      setX(0);
      return;
    }
    let raf = 0;
    const update = () => {
      if (isEngineRunning()) {
        const ac = getAudioContext();
        const loopStart = getLoopStartCtxTime();
        const ls = getLoopSec() || loopSec;
        const elapsed = ac.currentTime - loopStart;
        const rel = ((elapsed % ls) + ls) % ls;
        setX(TRACK_PANEL_WIDTH + (rel / ls) * waveformWidth);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, loopSec, waveformWidth]);
  if (!isPlaying) return null;
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
      style={{ left: x, boxShadow: "0 0 4px var(--primary)" }}
    />
  );
}

function TimelineHeader({
  loopSec,
  segments,
  waveformWidth,
}: {
  loopSec: number;
  segments: BarSegment[];
  waveformWidth: number;
}) {
  const ticks: number[] = [];
  const step = loopSec > 60 ? 20 : loopSec > 30 ? 10 : 5;
  for (let s = 0; s <= loopSec; s += step) ticks.push(s);
  return (
    <div className="sticky top-0 z-10 bg-paper-card border-b flex" style={{ width: TRACK_PANEL_WIDTH + waveformWidth }}>
      <div className="shrink-0" style={{ width: TRACK_PANEL_WIDTH }} />
      <div className="flex-1">
        <div className="relative h-5">
          {ticks.map((s) => (
            <div
              key={s}
              className="absolute top-0 text-[10px] text-muted-foreground"
              style={{ left: s * PX_PER_SEC }}
            >
              <div className="h-2 w-px bg-border" />
              <div className="pl-0.5">{fmtTime(s)}</div>
            </div>
          ))}
        </div>
        <div className="relative h-4">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-r border-white/30"
              style={{
                left: seg.startSec * PX_PER_SEC,
                width: Math.max(1, (seg.endSec - seg.startSec) * PX_PER_SEC),
                background: seg.color,
              }}
              title={`${fmtTime(seg.startSec)} – ${fmtTime(seg.endSec)}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TrackRowProps {
  track: RecTrack;
  isSelected: boolean;
  isRecording: boolean;
  onSelect: () => void;
  onRecordToggle: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onRename: (name: string) => void;
  onSetColor: (color: string) => void;
  onSetGainDb: (db: number) => void;
  onSetPan: (pan: number) => void;
  onReplace: () => void;
  onReRecord: () => void;
  onDelete: () => void;
  onOpenDelay: () => void;
  onOpenDeviceSettings: () => void;
  pxPerSec: number;
  height: number;
}

function TrackRow({
  track,
  isSelected,
  isRecording,
  onSelect,
  onRecordToggle,
  onToggleMute,
  onToggleSolo,
  onRename,
  onSetColor,
  onSetGainDb,
  onSetPan,
  onReplace,
  onReRecord,
  onDelete,
  onOpenDelay,
  onOpenDeviceSettings,
  pxPerSec,
  height,
}: TrackRowProps) {
  const hasClip = track.clips.length > 0;
  return (
    <div
      className={`flex items-stretch border-b cursor-pointer ${
        isSelected ? "bg-paper-shade-soft" : "bg-paper-card"
      }`}
      style={{ height }}
      onClick={onSelect}
    >
      <div className="flex flex-col justify-center gap-1 px-2 w-56 shrink-0 border-r">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRecordToggle();
            }}
            className={`h-7 w-7 rounded-full flex items-center justify-center border border-destructive bg-destructive text-destructive-foreground${isRecording ? " animate-pulse" : ""}`}
            aria-label={isRecording ? "Stop recording" : "Record"}
          >
            {isRecording ? <Square className="h-3 w-3" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
          <span
            className="h-4 w-4 rounded-full shrink-0"
            style={{ background: track.color }}
          />
          <Input
            value={track.name}
            onChange={(e) => onRename(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
            className="h-7 px-2 text-sm font-display flex-1 min-w-0 border-transparent focus:border-input bg-transparent"
            aria-label="Track name"
          />
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDeviceSettings();
            }}
            className="h-[26px] w-[26px] rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Input device settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className={`h-[26px] w-[26px] rounded text-[13px] font-bold border ${
              track.muted ? "bg-destructive/20 border-destructive text-destructive" : "border-transparent text-muted-foreground"
            }`}
            aria-label="Mute"
          >
            M
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSolo();
            }}
            className={`h-[26px] w-[26px] rounded text-[13px] font-bold border ${
              track.soloed ? "bg-primary/30 border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
            aria-label="Solo"
          >
            S
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="h-[26px] w-[26px] rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Edit track"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Color</div>
                <ColorSwatches value={track.color} onChange={onSetColor} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                  <Volume2 className="h-3 w-3" /> Volume ({track.gainDb.toFixed(1)} dB)
                </div>
                <Slider
                  value={[track.gainDb]}
                  min={-60}
                  max={6}
                  step={0.5}
                  onValueChange={(v) => onSetGainDb(v[0])}
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Pan ({track.pan.toFixed(2)})
                </div>
                <Slider
                  value={[track.pan]}
                  min={-1}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => onSetPan(v[0])}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                <Button variant="outline" size="sm" onClick={onReplace}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Replace
                </Button>
                <Button variant="outline" size="sm" onClick={onReRecord}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Re-record
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/40"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDelay();
            }}
            disabled={!hasClip}
            className="h-[26px] w-[26px] rounded flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Delay compensation"
          >
            <Timer className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {hasClip ? (
          track.clips.map((clip) => {
            const clipW = Math.max(4, (clip.trimEndSec - clip.trimStartSec) * pxPerSec);
            return (
              <div
                key={clip.blobId}
                className="absolute top-1 bottom-1 rounded-md overflow-hidden"
                style={{
                  left: clip.startSec * pxPerSec,
                  width: clipW,
                  background: `color-mix(in oklch, ${track.color} 30%, transparent)`,
                  border: `1px solid ${track.color}`,
                }}
              >
                <WaveformCanvas
                  blobId={clip.blobId}
                  width={clipW}
                  height={height - 8}
                  color={track.color}
                />
              </div>
            );
          })
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Press record or use Replace to add audio
          </div>
        )}
      </div>
    </div>
  );
}

function TrackSettingsPanel({
  track,
  loopSec,
  onClose,
}: {
  track: RecTrack;
  loopSec: number;
  onClose: () => void;
}) {
  const store = useRecordingsStore();
  if (track.clips.length === 0) return null;
  return (
    <div className="border-t bg-paper-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-base truncate">{track.name}</h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {track.clips.map((clip) => (
        <div key={clip.blobId}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Clip @{fmtTime(clip.startSec)} — trim ({clip.trimStartSec.toFixed(2)}s – {clip.trimEndSec.toFixed(2)}s)
          </div>
          <Slider
            value={[clip.trimStartSec, clip.trimEndSec]}
            min={0}
            max={clip.durationSec}
            step={0.01}
            onValueChange={(v) =>
              store.setClipTrim(track.id, clip.blobId, v[0], v[1] ?? clip.trimEndSec)
            }
          />
        </div>
      ))}
    </div>
  );
}

function DelayCompensationSheet({
  track,
  loopSec,
  open,
  onClose,
}: {
  track: RecTrack | null;
  loopSec: number;
  open: boolean;
  onClose: () => void;
}) {
  const store = useRecordingsStore();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-0">
        {track && track.clips.length > 0 && (
          <>
            <div
              className="px-4 pt-6 pb-4 flex items-center gap-3"
              style={{ background: track.color, color: "white" }}
            >
              <Timer className="h-5 w-5 shrink-0" />
              <div>
                <div className="font-display text-base font-semibold">{track.name}</div>
                <div className="text-xs opacity-80">Delay Compensation</div>
              </div>
            </div>
            <div className="px-4 py-5 space-y-5 pb-10">
              <p className="text-sm text-muted-foreground">
                Nudge each clip's start time to fix recording latency.
              </p>
              {track.clips.map((clip) => (
                <div key={clip.blobId}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Clip @{fmtTime(clip.startSec)}
                  </div>
                  <DelayCompensationControl
                    startSec={clip.startSec}
                    maxSec={loopSec}
                    onChange={(sec) => store.setClipStart(track.id, clip.blobId, sec)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InputDeviceSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const selectedInputDeviceId = useRecordingsStore((s) => s.selectedInputDeviceId);
  const setSelectedInputDeviceId = useRecordingsStore((s) => s.setSelectedInputDeviceId);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === "audioinput")))
      .catch(() => setDevices([]));
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto p-0">
        <div className="px-4 pt-6 pb-4 flex items-center gap-3 bg-[var(--paper-card)] border-b">
          <Settings2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="font-display text-base font-semibold">Input Device</div>
        </div>
        <div className="px-4 py-4 pb-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSelectedInputDeviceId(null)}
            className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
              !selectedInputDeviceId
                ? "bg-[var(--primary)] text-[var(--paper)] font-semibold"
                : "bg-[var(--paper-card)] hover:bg-[var(--paper-shade)]"
            }`}
          >
            Default system microphone
          </button>
          {devices.map((d) => (
            <button
              key={d.deviceId}
              type="button"
              onClick={() => setSelectedInputDeviceId(d.deviceId)}
              className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                selectedInputDeviceId === d.deviceId
                  ? "bg-[var(--primary)] text-[var(--paper)] font-semibold"
                  : "bg-[var(--paper-card)] hover:bg-[var(--paper-shade)]"
              }`}
            >
              {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
            </button>
          ))}
          {devices.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              No devices found. Grant microphone permission first.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function RecordingsTab() {
  const isMobile = useIsMobile();
  const tracks = useRecordingsStore((s) => s.tracks);
  const selectedId = useRecordingsStore((s) => s.selectedTrackId);
  const addTrack = useRecordingsStore((s) => s.addTrack);
  const selectTrack = useRecordingsStore((s) => s.selectTrack);
  const addClip = useRecordingsStore((s) => s.addClip);
  const removeClip = useRecordingsStore((s) => s.removeClip);
  const toggleMute = useRecordingsStore((s) => s.toggleMute);
  const toggleSolo = useRecordingsStore((s) => s.toggleSolo);
  const removeTrack = useRecordingsStore((s) => s.removeTrack);
  const setRecording = useRecordingsStore((s) => s.setRecording);
  const setMonitorLevel = useRecordingsStore((s) => s.setMonitorLevel);
  const recordingTrackId = useRecordingsStore((s) => s.recordingTrackId);
  const monitorLevel = useRecordingsStore((s) => s.monitorLevel);
  const selectedInputDeviceId = useRecordingsStore((s) => s.selectedInputDeviceId);
  const songMeta = useSongStore((s) => s.meta);

  const loopSec = useLoopSec();
  const segments = useBarsStrip();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const waveformWidth = Math.max(800, loopSec * PX_PER_SEC + 200);
  const rowHeight = isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;

  const [delayTrackId, setDelayTrackId] = useState<string | null>(null);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const delayTrack = useMemo(() => tracks.find((t) => t.id === delayTrackId) ?? null, [tracks, delayTrackId]);

  const [countingInTrackId, setCountingInTrackId] = useState<string | null>(null);
  const countInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recorderRef = useRef<RecorderHandle | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingTrackIdRef = useRef<string | null>(null);

  const [overflow, setOverflow] = useState<{
    blob: Blob;
    durationSec: number;
    mime: string;
    startSec: number;
    trackId: string;
    blobId: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const selectedTrack = useMemo(() => tracks.find((t) => t.id === selectedId) ?? null, [tracks, selectedId]);

  const handleAddTrack = () => {
    if (tracks.length >= MAX_TRACKS) {
      toast.info("Maximum 4 tracks");
      return;
    }
    addTrack();
  };

  const finalizeClip = async (
    trackId: string,
    blob: Blob,
    durationSec: number,
    mime: string,
    startSec: number,
  ) => {
    const blobId = nanoid();
    await putAudioBlob(blobId, blob);
    const captured = durationSec || (blob.size / 16000); // rough fallback
    const ls = loopSec || captured;
    const startOffset = Math.max(0, Math.min(ls - 0.01, startSec));
    const clip: RecClip = {
      blobId,
      mime,
      durationSec: captured,
      startSec: startOffset,
      trimStartSec: 0,
      trimEndSec: captured,
    };
    if (captured > ls + 0.05) {
      setOverflow({ blob, durationSec: captured, mime, startSec: startOffset, trackId, blobId });
      addClip(trackId, clip);
      return;
    }
    addClip(trackId, clip);
  };

  const startTrackRecording = async (trackId: string, atStartSec = 0) => {
    try {
      const handle = await startRecording({
        onLevel: (l) => setMonitorLevel(l),
        deviceId: selectedInputDeviceId,
      });
      recorderRef.current = handle;
      recordingTrackIdRef.current = trackId;
      setRecording(true, trackId);
      recordingStartedAtRef.current = atStartSec;
      toast.success("Recording…");
    } catch (e) {
      console.error(e);
      toast.error("Microphone access denied");
    }
  };

  const beginCountIn = (trackId: string, startSec = 0) => {
    const { bpm, beatsPerBar } = songMeta;
    const barDurationSec = (beatsPerBar * 60) / bpm;
    // Note the exact AudioContext time beat-1 will fall on so the chord
    // engine can anchor to it precisely, independent of setTimeout jitter.
    // startMetronome internally uses currentTime + 0.05 for its first tick.
    const beat1AcTime = getAudioContext().currentTime + 0.05 + barDurationSec;
    setCountingInTrackId(trackId);
    stopMetronome();
    startMetronome({ bpm, beatsPerBar, volume: 0.8 });
    // Fire 150ms before the bar ends so handlePlay has time to do async work
    // and still start the chord engine exactly on beat 1.
    const fireMs = Math.max(0, barDurationSec * 1000 - 150);
    countInTimeoutRef.current = setTimeout(() => {
      setCountingInTrackId(null);
      stopMetronome();
      window.dispatchEvent(
        new CustomEvent("lovable:request-play-at", { detail: { startAtAcTime: beat1AcTime } }),
      );
      void startTrackRecording(trackId, startSec);
    }, fireMs);
  };

  const cancelCountIn = () => {
    if (countInTimeoutRef.current) {
      clearTimeout(countInTimeoutRef.current);
      countInTimeoutRef.current = null;
    }
    setCountingInTrackId(null);
    stopMetronome();
  };

  const stopTrackRecording = async () => {
    const handle = recorderRef.current;
    const trackId = recordingTrackIdRef.current;
    if (!handle || !trackId) return;
    recorderRef.current = null;
    recordingTrackIdRef.current = null;
    setRecording(false, null);
    setMonitorLevel(0);
    try {
      const { blob, durationSec, mime } = await handle.stop();
      await finalizeClip(trackId, blob, durationSec, mime, recordingStartedAtRef.current);
    } catch (e) {
      console.error(e);
      toast.error("Recording failed");
    }
  };

  useEffect(() => {
    return () => {
      cancelCountIn();
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
    };
  }, []);

  // Phone locked or app backgrounded mid-recording: finalize and save the clip
  // instead of letting the browser kill the recorder and lose the audio.
  const stopOnHideRef = useRef(stopTrackRecording);
  stopOnHideRef.current = stopTrackRecording;
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && recorderRef.current) void stopOnHideRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  useEffect(() => {
    const onSectionOverdub = (e: Event) => {
      const { trackId, startSec } = (e as CustomEvent<{ trackId: string; startSec: number }>).detail;
      if (recordingTrackId || countingInTrackId) {
        toast.info("Another track is recording");
        return;
      }
      if (isPlaying) {
        void startTrackRecording(trackId, startSec);
      } else {
        beginCountIn(trackId, startSec);
      }
    };
    window.addEventListener("lovable:begin-section-overdub", onSectionOverdub);
    return () => window.removeEventListener("lovable:begin-section-overdub", onSectionOverdub);
  }, [recordingTrackId, countingInTrackId, isPlaying]);

  const handleRecordToggle = (trackId: string) => {
    if (countingInTrackId === trackId) {
      cancelCountIn();
      return;
    }
    if (recordingTrackId === trackId) {
      void stopTrackRecording();
      window.dispatchEvent(new CustomEvent("lovable:request-stop"));
    } else if (recordingTrackId || countingInTrackId) {
      toast.info("Another track is recording");
    } else if (isPlaying) {
      // Already playing — start recording immediately at current playhead position.
      let startSec = 0;
      if (isEngineRunning()) {
        const ac = getAudioContext();
        const ls = getLoopSec();
        if (ls > 0) startSec = (((ac.currentTime - getLoopStartCtxTime()) % ls) + ls) % ls;
      }
      void startTrackRecording(trackId, startSec);
    } else {
      beginCountIn(trackId);
    }
  };

  const handleReplaceTrack = (trackId: string) => {
    setReplaceTargetId(trackId);
    fileInputRef.current?.click();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !replaceTargetId) return;
    try {
      const blob = file;
      let durationSec = 0;
      try {
        const buf = await decodeBlob(blob);
        durationSec = buf.duration;
      } catch {
        toast.error("Could not decode audio file");
        return;
      }
      await finalizeClip(replaceTargetId, blob, durationSec, file.type || "audio/mpeg", 0);
    } finally {
      setReplaceTargetId(null);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    const t = tracks.find((x) => x.id === trackId);
    if (t) {
      for (const clip of t.clips) {
        try {
          await deleteAudioBlob(clip.blobId);
          clearDecodedCache(clip.blobId);
          invalidatePeaks(clip.blobId);
        } catch {
          /* noop */
        }
      }
    }
    removeTrack(trackId);
  };

  const handleReRecord = async (trackId: string) => {
    const t = tracks.find((x) => x.id === trackId);
    if (t) {
      for (const clip of t.clips) {
        try {
          await deleteAudioBlob(clip.blobId);
          clearDecodedCache(clip.blobId);
          invalidatePeaks(clip.blobId);
        } catch {
          /* noop */
        }
        removeClip(trackId, clip.blobId);
      }
    }
    beginCountIn(trackId);
  };

  const handleOverflowChoice = (choice: "trim" | "expand" | "cancel") => {
    if (!overflow) return;
    const { trackId, blobId, durationSec, startSec } = overflow;
    if (choice === "trim") {
      const trimmedLen = Math.max(0.05, loopSec - startSec);
      useRecordingsStore.getState().setClipTrim(trackId, blobId, 0, Math.min(durationSec, trimmedLen));
      setOverflow(null);
    } else if (choice === "expand") {
      const factor = Math.max(2, Math.ceil((startSec + durationSec) / loopSec));
      expandSong(factor);
      setOverflow(null);
      setTimeout(() => {
        toast.success(`Song expanded ×${factor}. Try Add Spice to vary the new sections.`, {
          action: {
            label: "Add Spice",
            onClick: () => {
              window.dispatchEvent(new CustomEvent("lv-open-spice"));
            },
          },
          duration: 8000,
        });
      }, 200);
    } else {
      void deleteAudioBlob(blobId);
      useRecordingsStore.getState().removeClip(trackId, blobId);
      setOverflow(null);
    }
  };

  return (
    <div className="flex flex-col gap-0 min-h-[60vh]">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFilePicked}
      />
      <div className="flex items-center justify-between p-3 border-b bg-paper-card">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-lg">Recordings</h3>
          <span className="text-xs text-muted-foreground">
            {tracks.length}/{MAX_TRACKS} tracks · loop {fmtTime(loopSec)}
          </span>
        </div>
        {countingInTrackId && !recordingTrackId && (
          <div className="flex items-center gap-1 text-xs text-primary font-semibold">
            <Music2 className="h-3.5 w-3.5 animate-pulse" />
            Count in…
          </div>
        )}
        {recordingTrackId && (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            REC · level {(monitorLevel * 100).toFixed(0)}%
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div style={{ width: TRACK_PANEL_WIDTH + waveformWidth, position: "relative" }}>
          <TimelineHeader loopSec={loopSec} segments={segments} waveformWidth={waveformWidth} />
          <div className="relative">
            {tracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                isSelected={selectedId === t.id}
                isRecording={recordingTrackId === t.id || countingInTrackId === t.id}
                onSelect={() => selectTrack(t.id)}
                onRecordToggle={() => handleRecordToggle(t.id)}
                onToggleMute={() => toggleMute(t.id)}
                onToggleSolo={() => toggleSolo(t.id)}
                onRename={(name) => useRecordingsStore.getState().renameTrack(t.id, name)}
                onSetColor={(c) => useRecordingsStore.getState().setTrackColor(t.id, c)}
                onSetGainDb={(db) => useRecordingsStore.getState().setGainDb(t.id, db)}
                onSetPan={(p) => useRecordingsStore.getState().setPan(t.id, p)}
                onReplace={() => handleReplaceTrack(t.id)}
                onReRecord={() => handleReRecord(t.id)}
                onDelete={() => handleDeleteTrack(t.id)}
                onOpenDelay={() => setDelayTrackId(t.id)}
                onOpenDeviceSettings={() => setDeviceSettingsOpen(true)}
                pxPerSec={PX_PER_SEC}
                height={rowHeight}
              />
            ))}
            <Playhead loopSec={loopSec} waveformWidth={waveformWidth} />
          </div>
        </div>
      </div>

      {tracks.length < MAX_TRACKS ? (
        <button
          type="button"
          onClick={handleAddTrack}
          className="w-full rounded-lg border-2 border-dashed border-border/60 bg-[var(--paper-card)]/40 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-[var(--paper-card)] hover:border-border min-h-[80px] transition-colors mt-3"
        >
          <Plus className="h-4 w-4" />
          <span className="text-sm font-display uppercase tracking-wide">Add Track</span>
        </button>
      ) : (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Maximum {MAX_TRACKS} tracks reached
        </div>
      )}

      {selectedTrack && selectedTrack.clips.length > 0 && (
        <TrackSettingsPanel
          track={selectedTrack}
          loopSec={loopSec}
          onClose={() => selectTrack(null)}
        />
      )}

      <DelayCompensationSheet
        track={delayTrack}
        loopSec={loopSec}
        open={!!delayTrackId}
        onClose={() => setDelayTrackId(null)}
      />
      <InputDeviceSheet
        open={deviceSettingsOpen}
        onClose={() => setDeviceSettingsOpen(false)}
      />
      <OverflowDialog
        open={!!overflow}
        onChoose={handleOverflowChoice}
        factor={overflow ? Math.max(2, Math.ceil((overflow.startSec + overflow.durationSec) / loopSec)) : 1}
        durationSec={overflow?.durationSec ?? 0}
        loopSec={loopSec}
      />
    </div>
  );
}

function expandSong(factor: number) {
  const songStore = useSongStore.getState();
  const sections = songStore.sections;
  const progression = songStore.progression;
  // Duplicate each section's patterns `factor-1` more times, in order.
  // For each section, duplicate the section's lyric lines as well.
  // We add new patterns immediately after the originals so the loop order
  // expands naturally.
  const newProgression = [...progression];
  const newSections = sections.map((sec) => {
    const sectionPatterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    const insertIndex = newProgression.findIndex((p) => p.id === sectionPatterns[sectionPatterns.length - 1]?.id);
    if (insertIndex >= 0) {
      for (let r = 1; r < factor; r++) {
        for (const p of sectionPatterns) {
          const dup = {
            ...p,
            id: nanoid(),
            chords: p.chords.map((c) => ({ ...c, id: nanoid(), mirrorId: undefined })),
          };
          newProgression.splice(insertIndex + 1 + (r - 1) * sectionPatterns.length + sectionPatterns.indexOf(p), 0, dup);
        }
      }
    }
    const dupLines = [];
    for (let r = 1; r < factor; r++) {
      for (const l of sec.lines) {
        dupLines.push({
          ...l,
          id: nanoid(),
          chords: l.chords.map((c) => ({ ...c, id: nanoid() })),
        });
      }
    }
    return { ...sec, lines: [...sec.lines, ...dupLines], chords: sec.chords };
  });
  useSongStore.setState({ sections: newSections, progression: newProgression });
}
