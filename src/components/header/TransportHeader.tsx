import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useSongStore } from "@/store/song";
import { downloadProjectJSON, loadProjectFromFile, type InspirationPhoto } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Play,
  Square,
  Save,
  Upload,
  BookOpen,
  Menu,
  Sun,
  Moon,
  Undo2,
  Redo2,
  FileText,
  FilePlus,
  Image as ImageIcon,
  Bookmark,
} from "lucide-react";
import { ALL_ROOTS, MODE_LABEL, type Mode } from "@/lib/music/chords";
import { ensureAudio, playProgression, stopProgression, ScheduledChord } from "@/lib/music/audio";
import { getAudioContext } from "@/lib/audio/context";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/hooks/use-theme";
import { useMetronomeStore } from "@/store/metronome";
import { startMetronome, stopMetronome, updateMetronome, previewClick } from "@/lib/audio/metronome";
import { SoundPanel } from "@/components/sound/SoundPanel";
import { ExportLyricsSheet } from "@/components/lyrics/ExportLyricsSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Music2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

async function convertToWebP(file: File, maxPx = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load")); };
    img.src = url;
  });
}

const PHOTO_SLOTS = [
  { left: "30%", top: -38, rotate: -7 },
  { left: "46%", top: -48, rotate: 5 },
  { left: "61%", top: -37, rotate: -3 },
] as const;

function InspirationLightbox({
  photos,
  initialIndex,
  onClose,
  onRemove,
  onRemoveAll,
}: {
  photos: InspirationPhoto[];
  initialIndex: number;
  onClose: () => void;
  onRemove: (id: string) => void;
  onRemoveAll: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const current = photos[idx] ?? photos[0];
  if (!current) return null;
  const prev = () => setIdx((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setIdx((i) => (i + 1) % photos.length);
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16,
      }}
      onClick={onClose}
    >
      {/* Photo */}
      <div
        style={{ position: "relative", maxWidth: "min(90vw, 480px)", maxHeight: "60vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.dataUrl}
          alt={`Inspiration photo ${idx + 1}`}
          draggable={false}
          style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", display: "block" }}
        />
      </div>
      {/* Inline nav: [‹] 1/3 [›] */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={(e) => e.stopPropagation()}>
        {photos.length > 1 && (
          <button
            type="button"
            onClick={prev}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)", color: "white",
              border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}
            aria-label="Previous photo"
          >‹</button>
        )}
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", minWidth: 36, textAlign: "center" }}>
          {idx + 1}/{photos.length}
        </span>
        {photos.length > 1 && (
          <button
            type="button"
            onClick={next}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)", color: "white",
              border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}
            aria-label="Next photo"
          >›</button>
        )}
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => { onRemove(current.id); if (idx >= photos.length - 1) setIdx(Math.max(0, photos.length - 2)); }}
          style={{
            padding: "8px 16px", borderRadius: 8, cursor: "pointer",
            background: "rgba(255,255,255,0.12)", color: "white",
            border: "1px solid rgba(255,255,255,0.25)", fontSize: 13,
          }}
        >Remove this photo</button>
        <button
          type="button"
          onClick={() => { onRemoveAll(); onClose(); }}
          style={{
            padding: "8px 16px", borderRadius: 8, cursor: "pointer",
            background: "rgba(220,50,50,0.75)", color: "white",
            border: "1px solid rgba(255,255,255,0.2)", fontSize: 13,
          }}
        >Remove all photos</button>
      </div>
      {/* Close hint */}
      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 4 }}>Tap outside to close</span>
    </div>
  );
}

interface Props {
  isPlaying: boolean;
  setIsPlaying: (b: boolean) => void;
  tab: "lyrics" | "chords" | "progressions";
  setTab: (t: "lyrics" | "chords" | "progressions") => void;
}

export function TransportHeader({ isPlaying, setIsPlaying, tab, setTab }: Props) {
  const {
    meta,
    setKey,
    setBpm,
    setTimeSignature,
    transposeSong,
    progression,
    sections,
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
    resetSong,
    undo,
    redo,
    canUndo,
    canRedo,
    inspirationPhotos,
    addInspirationPhoto,
    removeInspirationPhoto,
  } = useSongStore();
  const setPlayingStore = usePlaybackStore((s) => s.setIsPlaying);
  const setCurrent = usePlaybackStore((s) => s.setCurrent);
  const [fileInputKey, setFileInputKey] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [soundOpen, setSoundOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmNewSong, setConfirmNewSong] = useState(false);
  const [bpmDraft, setBpmDraft] = useState<string>(String(meta.bpm));
  const isMobile = useIsMobile();
  const [transposeOffset, setTransposeOffset] = useState(0);
  const metronome = useMetronomeStore();
  const stopRequestedRef = useRef(false);
  const handlePlayRef = useRef<() => Promise<void>>(async () => {});

  // Drive the metronome from playback + meta. Starts/stops with isPlaying;
  // updates rate/time-signature live without needing a restart. The actual
  // start moment is set in handlePlay so it lines up with the first chord.
  useEffect(() => {
    if (!isPlaying) stopMetronome();
    return () => stopMetronome();
  }, [isPlaying]);

  useEffect(() => {
    updateMetronome({ bpm: meta.bpm, beatsPerBar: meta.beatsPerBar, volume: metronome.volume });
  }, [meta.bpm, meta.beatsPerBar, metronome.volume]);

  // Keep BPM input in sync if the store value changes externally (load, reset).
  useEffect(() => {
    setBpmDraft(String(meta.bpm));
  }, [meta.bpm]);

  const commitBpm = () => {
    const n = parseInt(bpmDraft, 10);
    if (Number.isNaN(n)) {
      setBpmDraft(String(meta.bpm));
      return;
    }
    const clamped = Math.max(40, Math.min(220, n));
    setBpm(clamped);
    setBpmDraft(String(clamped));
  };

  const handlePlay = async () => {
    stopRequestedRef.current = false;
    await ensureAudio();
    // Defensive: AudioContext may be suspended after autoplay-policy
    // restrictions (Safari, mobile). resume() is idempotent.
    try {
      const ac = getAudioContext();
      if (ac.state === "suspended") await ac.resume();
    } catch { /* ignore */ }
    const startFromChordId = usePlaybackStore.getState().startFromChordId;

    // Walk the SSOT (section.chords) directly instead of the legacy
    // pattern.chords mirror. The mirror is rebuilt by
    // deriveMirrorsFromSectionChords and can silently drop SectionChords
    // whose progressionPlacement.patternId no longer matches any block in
    // the section (orphaned placements, sections with no blocks, etc.).
    // Reading the SSOT keeps playback immune to those derivation gaps so
    // pressing Play always plays whatever chords actually exist.
    let cursorBeat = 0;
    const events: ScheduledChord[] = [];
    const meta2: Array<{ patternId: string; patternChordId: string; mirrorId?: string }> = [];
    for (const sec of sections) {
      // Patterns belonging to this section, in progression array order.
      const sectionPatterns = progression.filter(
        (p) => (p.sectionId ?? p.id) === sec.id,
      );
      if (sectionPatterns.length === 0) continue;

      // Cumulative beat offset of each pattern within this section.
      const patternOffset = new Map<string, number>();
      let accBeats = 0;
      for (const p of sectionPatterns) {
        patternOffset.set(p.id, accBeats);
        accBeats += p.bars * p.beatsPerBar;
      }

      // Emit one event per SectionChord that has a progressionPlacement
      // pointing at a block in THIS section, in SSOT array order.
      for (const sc of sec.chords) {
        const pp = sc.progressionPlacement;
        if (!pp) continue;
        const localOffset = patternOffset.get(pp.patternId);
        if (localOffset == null) continue;
        events.push({
          chord: sc.chord,
          startBeat: cursorBeat + localOffset + pp.startBeat,
          lengthBeats: pp.lengthBeats,
        });
        meta2.push({
          patternId: pp.patternId,
          patternChordId: sc.id,
          mirrorId: sc.lyricsPlacement ? sc.id : undefined,
        });
      }

      cursorBeat += accBeats;
    }

    if (!events.length) {
      toast({ title: "Nothing to play yet", description: "Add chords to a pattern in Progressions." });
      return;
    }

    let playEvents = events;
    let playMeta = meta2;
    if (startFromChordId) {
      const i = meta2.findIndex((m) => m.patternChordId === startFromChordId);
      if (i < 0) {
        // Stale start cursor — chord no longer exists. Clear it and fall
        // through to playing from the beginning.
        usePlaybackStore.getState().setStartFromChord(null, null);
      } else if (i > 0) {
        const offset = events[i].startBeat;
        const total = cursorBeat;
        playEvents = events.map((_, k) => {
          const src = events[(i + k) % events.length];
          const rawStart = src.startBeat - offset;
          const wrapped = rawStart < 0 ? rawStart + total : rawStart;
          return { chord: src.chord, startBeat: wrapped, lengthBeats: src.lengthBeats };
        });
        playMeta = playEvents.map((_, k) => meta2[(i + k) % meta2.length]);
      }
    }

    setIsPlaying(true);
    setPlayingStore(true);
    // Anchor metronome and progression to the SAME AudioContext time so the
    // first downbeat tick lines up with the first chord onset.
    const startAt = getAudioContext().currentTime + 0.12;
    if (metronome.enabled) {
      startMetronome({
        bpm: meta.bpm,
        beatsPerBar: meta.beatsPerBar,
        volume: metronome.volume,
        startAt,
      });
    }
    await playProgression(playEvents, meta.bpm, {
      onChordStart: (idx) => setCurrent(playMeta[idx] ?? null),
      onEnd: () => {
        if (!stopRequestedRef.current) {
          setCurrent(null);
          void handlePlayRef.current();
        }
      },
      startAt,
    });
  };
  handlePlayRef.current = handlePlay;

  const handleStop = () => {
    stopRequestedRef.current = true;
    stopProgression();
    setIsPlaying(false);
    setPlayingStore(false);
    setCurrent(null);
  };

  useEffect(() => {
    const onReq = () => {
      handlePlay();
    };
    window.addEventListener("lovable:request-play", onReq);
    return () => window.removeEventListener("lovable:request-play", onReq);
    // handlePlay is recreated on every render but reads startFromChordId
    // via getState(), so we only need to re-bind when the SSOT inputs
    // (sections, progression, bpm) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, progression, meta.bpm]);

  const handleLoad = async (file?: File) => {
    if (!file) return;
    try {
      await loadProjectFromFile(file);
      toast({ title: "Project loaded", description: file.name });
      setTransposeOffset(0);
    } catch {
      toast({ title: "Could not load file", description: "Make sure it's a valid song.json" });
    }
    setFileInputKey((k) => k + 1);
  };

  const stepTranspose = (delta: -1 | 1) => {
    transposeSong(delta);
    setTransposeOffset((n) => n + delta);
  };

  const fmtOffset = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const remaining = 3 - inspirationPhotos.length;
    const toProcess = files.slice(0, Math.max(0, remaining));
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const containerW = Math.min(vw - 32, 600);
    for (let i = 0; i < toProcess.length; i++) {
      try {
        const dataUrl = await convertToWebP(toProcess[i]);
        const currentCount = useSongStore.getState().inspirationPhotos.length;
        const x = Math.round(containerW * (0.12 + currentCount * 0.32));
        const y = 4 + (currentCount % 2) * 12;
        addInspirationPhoto({ id: nanoid(), dataUrl, x, y });
      } catch { /* ignore */ }
    }
  };

  return (
    <>
      {/* Bookmark — fixed, flows from above viewport top edge */}
      <Bookmark
        style={{
          position: "fixed",
          top: 0,
          left: 12,
          zIndex: 60,
          width: 48,
          height: 48,
          color: "var(--cocoa-deep)",
          fill: "var(--border)",
        }}
      />
      <div className="mx-2 sm:mx-4 mt-2 mb-2 flex items-center justify-end px-1">
        <button
          type="button"
          onClick={() => {
            if (inspirationPhotos.length > 0) {
              setLightboxIndex(0);
              setLightboxOpen(true);
            } else {
              photoInputRef.current?.click();
            }
          }}
          className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9"
          aria-label={inspirationPhotos.length > 0 ? "View inspiration photos" : "Add inspiration photo"}
          title={inspirationPhotos.length > 0 ? "View / manage inspiration photos" : "Add up to 3 inspiration photos"}
        >
          <ImageIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="sticky top-0 z-40 mx-2 sm:mx-4">
      <div className="relative">
        {/* Static inspiration photos — positioned behind header card */}
        {inspirationPhotos.map((photo, i) => {
          const slot = PHOTO_SLOTS[i] ?? PHOTO_SLOTS[0];
          return (
            <img
              key={photo.id}
              src={photo.dataUrl}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: slot.left,
                top: slot.top,
                maxWidth: 90,
                maxHeight: 90,
                display: "block",
                borderRadius: 8,
                boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
                transform: `rotate(${slot.rotate}deg)`,
                zIndex: 0,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          );
        })}

        {/* Lightbox portal */}
        {lightboxOpen && inspirationPhotos.length > 0 && (
          <InspirationLightbox
            photos={inspirationPhotos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxOpen(false)}
            onRemove={(id) => { removeInspirationPhoto(id); if (inspirationPhotos.length <= 1) setLightboxOpen(false); }}
            onRemoveAll={() => { inspirationPhotos.forEach((p) => removeInspirationPhoto(p.id)); setLightboxOpen(false); }}
          />
        )}

        <header id="main-header" className="rounded-xl backdrop-blur border border-border/60" style={{ boxShadow: "var(--shadow-paper)", background: "color-mix(in oklch, var(--paper-shade) 15%, var(--card))" }}>
          <div className="mx-auto max-w-6xl px-3 py-2 flex flex-col gap-2">
            {/* Row 1: SongNote wordmark + undo/redo + menu */}
            <div className="flex items-center gap-2">
              <span
                className="font-display shrink-0 leading-none select-none"
                style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--cocoa-deep)" }}
              >
                SongNote
              </span>

              <div className="flex-1" />

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9 disabled:opacity-30"
                  onClick={() => undo()}
                  disabled={!canUndo()}
                  aria-label="Undo"
                  title="Undo (⌘/Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9 disabled:opacity-30"
                  onClick={() => redo()}
                  disabled={!canRedo()}
                  aria-label="Redo"
                  title="Redo (⌘/Ctrl+Shift+Z)"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>

              <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <button className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              {/* Song Settings */}
              <div className="mt-6">
                <h3 className="uppercase tracking-wide text-muted-foreground mb-2 font-light font-mono text-sm">
                  Song Settings
                </h3>
                <div className="rounded-md border border-border p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Key</span>
                    <div className="flex items-center gap-1">
                      <Select value={meta.keyRoot} onValueChange={(v) => setKey(v, meta.keyMode)}>
                        <SelectTrigger className="h-9 w-auto min-w-0 px-2 gap-1 font-mono-chord">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_ROOTS.map((r) => (
                            <SelectItem key={r} value={r} className="font-mono-chord">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={meta.keyMode} onValueChange={(v) => setKey(meta.keyRoot, v as Mode)}>
                        <SelectTrigger className="h-9 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                            <SelectItem key={m} value={m}>
                              {MODE_LABEL[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-b border-border/60 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Metronome</span>
                      <Switch
                        checked={metronome.enabled}
                        onCheckedChange={(b) => {
                          metronome.setEnabled(b);
                          if (b && !isPlaying) previewClick(metronome.volume);
                        }}
                        aria-label="Toggle metronome"
                      />
                    </div>
                    {metronome.enabled && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Vol</span>
                        <Slider
                          value={[Math.round(metronome.volume * 100)]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) => metronome.setVolume((v[0] ?? 0) / 100)}
                          className="flex-1"
                        />
                        <span className="text-[10px] tabular-nums w-8 text-right text-muted-foreground">
                          {Math.round(metronome.volume * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">BPM</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={bpmDraft}
                      onChange={(e) => setBpmDraft(e.target.value.replace(/[^\d]/g, ""))}
                      onBlur={commitBpm}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitBpm();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="h-9 w-20 px-2 text-center font-mono-chord"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Time Signature
                    </span>
                    <Select
                      value={`${meta.beatsPerBar}/${meta.beatUnit}`}
                      onValueChange={(v) => {
                        const [n, d] = v.split("/").map((x) => parseInt(x, 10));
                        if (Number.isFinite(n) && Number.isFinite(d)) setTimeSignature(n, d);
                      }}
                    >
                      <SelectTrigger className="h-9 w-[110px] font-mono-chord">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["2/4", "3/4", "4/4", "5/4", "6/4", "6/8", "7/8", "9/8", "12/8"].map((ts) => (
                          <SelectItem key={ts} value={ts} className="font-mono-chord">
                            {ts}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Transpose
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => stepTranspose(-1)}
                        aria-label="Transpose down semitone"
                      >
                        <span aria-hidden className="text-base leading-none">
                          −
                        </span>
                      </Button>
                      <span className="font-mono-chord text-xs px-1.5 tabular-nums whitespace-nowrap min-w-[2.5rem] text-center">
                        {fmtOffset(transposeOffset)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => stepTranspose(1)}
                        aria-label="Transpose up semitone"
                      >
                        <span aria-hidden className="text-base leading-none">
                          +
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Other actions */}
              <div className="mt-6 flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 h-9">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    Dark mode
                  </div>
                  <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
                </div>
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => {
                    setSoundOpen(true);
                    setNavOpen(false);
                  }}
                >
                  <Music2 className="h-4 w-4" /> Sound
                </Button>
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => {
                    setExportOpen(true);
                    setNavOpen(false);
                  }}
                >
                  <FileText className="h-4 w-4" /> Export Lyrics
                </Button>
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => {
                    downloadProjectJSON(meta.title.replace(/\s+/g, "-").toLowerCase() + ".json");
                    setNavOpen(false);
                  }}
                >
                  <Save className="h-4 w-4" /> Save
                </Button>
                <label className="inline-flex">
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      handleLoad(e.target.files?.[0]);
                      setNavOpen(false);
                    }}
                  />
                  <span className="inline-flex w-full h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent">
                    <Upload className="h-4 w-4" /> Load
                  </span>
                </label>
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => {
                    setConfirmNewSong(true);
                    setNavOpen(false);
                  }}
                >
                  <FilePlus className="h-4 w-4" /> New song
                </Button>
                {suppressCrossTabDeleteWarning && (
                  <Button
                    variant="outline"
                    className="justify-start border border-border"
                    onClick={() => {
                      setSuppressCrossTabDeleteWarning(false);
                      toast({ title: "Delete warnings re-enabled" });
                      setNavOpen(false);
                    }}
                  >
                    Reset delete warnings
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Row 2: Play + Tabs */}
        <div className="flex items-center gap-3">
          {!isPlaying ? (
            <button
              onClick={handlePlay}
              className="btn-sculpt-amber shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 font-semibold text-sm"
              aria-label="Play"
            >
              <Play className="h-4 w-4 fill-current" />
              {!isMobile && <span>Play</span>}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="btn-sculpt-cocoa shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 font-semibold text-sm"
              aria-label="Stop"
            >
              <Square className="h-4 w-4" />
              {!isMobile && <span>Stop</span>}
            </button>
          )}

          {/* Tabs bar — recessed well with cocoa active pill */}
          <div
            className="inline-flex items-center gap-1"
            style={{
              padding: "5px 5px 7px",
              background: "var(--paper-shade)",
              borderRadius: 10,
              boxShadow: "var(--shadow-recess)",
            }}
          >
            {(["lyrics", "chords", "progressions"] as const).map((t) => {
              const active = tab === t;
              const label = t.charAt(0).toUpperCase() + t.slice(1);
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "7px 14px",
                    border: 0,
                    borderRadius: 7.6,
                    cursor: "pointer",
                    fontFamily: "var(--font-body, 'Nunito', sans-serif)",
                    fontWeight: 700,
                    fontSize: 14,
                    background: active ? "var(--cocoa)" : "transparent",
                    color: active ? "var(--cocoa-foreground)" : "var(--ink-soft)",
                    boxShadow: active ? "var(--shadow-sculpt-cocoa-rest)" : "none",
                    marginTop: active ? -2 : 0,
                    marginBottom: active ? 2 : 0,
                    transition: "all 120ms cubic-bezier(0.22,0.61,0.36,1)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
        </header>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handlePhotoUpload}
        />
      </div>
    </div>
    <SoundPanel open={soundOpen} onOpenChange={setSoundOpen} />
    <ExportLyricsSheet open={exportOpen} onOpenChange={setExportOpen} />
    <AlertDialog open={confirmNewSong} onOpenChange={setConfirmNewSong}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new song?</AlertDialogTitle>
          <AlertDialogDescription>
            This will clear all lyrics, chords, and progressions in the current song. Make sure
            you've saved your work first — unsaved changes can't be recovered.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() =>
              downloadProjectJSON(meta.title.replace(/\s+/g, "-").toLowerCase() + ".json")
            }
          >
            <Save className="h-4 w-4" /> Save first
          </Button>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              resetSong();
              setTransposeOffset(0);
              setConfirmNewSong(false);
              toast({ title: "New song started" });
            }}
          >
            Start new song
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
