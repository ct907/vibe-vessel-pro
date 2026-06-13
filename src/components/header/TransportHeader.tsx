import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useSongStore } from "@/store/song";
import { useUIStore, type TabName, type AppMode } from "@/store/ui";
import { downloadProjectJSON, downloadProjectZip, loadProjectFromFile, type InspirationPhoto } from "@/store/song";
import { useDriveStore, saveProject, loadProjectFromDrive, loadLocalVersionIntoSong } from "@/store/drive";
import { listLocalVersions, type LocalVersionMeta } from "@/lib/local-versions";
import type { DriveFile } from "@/lib/drive/drive";
import { startRecordingsEngine, stopRecordingsEngine, updateEngineBpm } from "@/lib/audio/recordings-engine";
import { usePlaybackStore } from "@/store/playback";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Play,
  Square,
  Save,
  Upload,
  Menu,
  Sun,
  Moon,
  Undo2,
  Redo2,
  FileText,
  FilePlus,
  Image as ImageIcon,
  Palette,
  HelpCircle,
  Compass,
  Piano,
  Layers,
  Cloud,
  CloudOff,
  RotateCcw,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ensureAudio, playProgression, stopProgression, updateScheduledProgression, updateScheduledBpm, ScheduledChord } from "@/lib/music/audio";
import { transposeChord } from "@/lib/music/chords";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { getAudioContext } from "@/lib/audio/context";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { useMetronomeStore } from "@/store/metronome";
import { startMetronome, stopMetronome, updateMetronome } from "@/lib/audio/metronome";
import { SoundPanel } from "@/components/sound/SoundPanel";
import { useSoundStore, SOUND_PRESETS, type SoundPreset } from "@/store/sound";
import { useAppTintStore } from "@/store/appTint";
import { useAppBackgroundStore } from "@/store/appBackground";
import { SectionColorPicker, type SectionColor } from "@/components/section/SectionColorPicker";
import { PatternPicker } from "@/components/bg/PatternPicker";
import { MaskToggle } from "@/components/bg/MaskToggle";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Music2 } from "lucide-react";
import { useIsMobile, useIsDesktop } from "@/hooks/use-mobile";
import { useOnboardingStore } from "@/store/onboarding";
import { AnchoredCoachMark } from "@/components/onboarding/OnboardingCoachMark";
import { useRecordingsStore } from "@/store/recordings";
import { useTakesStore } from "@/store/takes";
import { downloadMidi } from "@/lib/export/midi";
import { exportStemsAsZip, type StemExportProgress } from "@/lib/export/wav-stems";

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
  { left: "30%", top: -48, rotate: -7 },
  { left: "46%", top: -58, rotate: 5 },
  { left: "61%", top: -47, rotate: -3 },
] as const;

const DESKTOP_PHOTO_SLOTS = [
  { left: "calc(30% + 240px)", top: -48, rotate: -7 },
  { left: "calc(30% + 390px)", top: -58, rotate: 5 },
  { left: "calc(30% + 540px)", top: -47, rotate: -3 },
] as const;

const TABLET_PHOTO_SLOTS = [
  { left: "calc(30% + 100px)", top: -48, rotate: -7 },
  { left: "calc(30% + 220px)", top: -58, rotate: 5 },
  { left: "calc(30% + 340px)", top: -47, rotate: -3 },
] as const;

type PlaybackMeta = {
  patternId: string;
  patternChordId: string;
  mirrorId?: string;
};

type BuiltPlayback = {
  events: ScheduledChord[];
  meta: PlaybackMeta[];
  loopBeats: number;
  /** True when no rotation was applied because the anchor chord no longer exists. */
  startAnchorStale: boolean;
};

function buildPlayback(
  sections: ReturnType<typeof useSongStore.getState>["sections"],
  progression: ReturnType<typeof useSongStore.getState>["progression"],
  startFromChordId: string | null,
): BuiltPlayback | null {
  let cursorBeat = 0;
  const events: ScheduledChord[] = [];
  const meta: PlaybackMeta[] = [];
  const effectiveOffsets = computeEffectiveOffsets(sections);
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const sectionOffset = effectiveOffsets[sIdx] ?? 0;
    const sectionPatterns = progression.filter(
      (p) => (p.sectionId ?? p.id) === sec.id,
    );
    if (sectionPatterns.length === 0) continue;
    const patternOffset = new Map<string, number>();
    let accBeats = 0;
    for (const p of sectionPatterns) {
      patternOffset.set(p.id, accBeats);
      accBeats += p.bars * p.beatsPerBar;
    }
    if (sec.chords.length > 0) {
      for (const sc of sec.chords) {
        const pp = sc.progressionPlacement;
        if (!pp) continue;
        const localOffset = patternOffset.get(pp.patternId);
        if (localOffset == null) continue;
        events.push({
          chord: sectionOffset ? transposeChord(sc.chord, sectionOffset) : sc.chord,
          startBeat: cursorBeat + localOffset + pp.startBeat,
          lengthBeats: pp.lengthBeats,
          sectionId: sec.id,
        });
        meta.push({
          patternId: pp.patternId,
          patternChordId: sc.id,
          mirrorId: sc.lyricsPlacement ? sc.id : undefined,
        });
      }
    } else {
      // sec.chords not yet populated (e.g. duplicated section) — fall back to
      // pattern.chords so the playhead advances across all sections.
      for (const p of sectionPatterns) {
        const localOffset = patternOffset.get(p.id) ?? 0;
        for (const pc of [...p.chords].sort((a, b) => a.startBeat - b.startBeat)) {
          events.push({ chord: sectionOffset ? transposeChord(pc.chord, sectionOffset) : pc.chord, startBeat: cursorBeat + localOffset + pc.startBeat, lengthBeats: pc.lengthBeats, sectionId: sec.id });
          meta.push({ patternId: p.id, patternChordId: pc.id, mirrorId: pc.mirrorId });
        }
      }
    }
    cursorBeat += accBeats;
  }
  if (!events.length) return null;

  let outEvents = events;
  let outMeta = meta;
  let startAnchorStale = false;
  if (startFromChordId) {
    const i = meta.findIndex((m) => m.patternChordId === startFromChordId);
    if (i < 0) {
      startAnchorStale = true;
    } else if (i > 0) {
      const offset = events[i].startBeat;
      outEvents = events.map((_, k) => {
        const src = events[(i + k) % events.length];
        const rawStart = src.startBeat - offset;
        const wrapped = rawStart < 0 ? rawStart + cursorBeat : rawStart;
        return { chord: src.chord, startBeat: wrapped, lengthBeats: src.lengthBeats, sectionId: src.sectionId };
      });
      outMeta = outEvents.map((_, k) => meta[(i + k) % meta.length]);
    }
  }
  return { events: outEvents, meta: outMeta, loopBeats: cursorBeat, startAnchorStale };
}

const GALLERY_URLS = [1, 2, 3, 4, 5].map(
  (n) => `https://www.gstatic.com/webp/gallery/${n}.webp`,
);

function InspirationOnboardingModal({
  open,
  onClose,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: () => void;
}) {
  const [sampleUrls, setSampleUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const shuffled = [...GALLERY_URLS].sort(() => Math.random() - 0.5);
    setSampleUrls(shuffled.slice(0, 3));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Inspiration photos</DialogTitle>
          <DialogDescription>
            Upload up to 3 photos to keep your creative vision in focus.
            They float above your workspace while you write.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2" style={{ paddingTop: 64 }}>
          {sampleUrls.map((url, i) => {
            const slot = PHOTO_SLOTS[PHOTO_SLOTS.length - 1 - i] ?? PHOTO_SLOTS[0];
            return (
              <img
                key={i}
                src={url}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: slot.left,
                  top: 64 + slot.top,
                  maxWidth: 72,
                  maxHeight: 72,
                  borderRadius: 7,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
                  transform: `rotate(${slot.rotate}deg)`,
                  zIndex: 1,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            );
          })}
          <div
            className="noise-texture rounded-xl border border-border/60 w-full relative z-0"
            style={{
              boxShadow: "var(--shadow-paper)",
              background: "color-mix(in oklch, var(--card) 20%, transparent)",
            }}
          >
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="btn-sculpt-amber inline-flex items-center justify-center gap-1 rounded-lg px-3 h-8 font-semibold text-sm shrink-0 pointer-events-none select-none">
                <Play className="h-3 w-3 fill-current" />
                <span>Play</span>
              </div>
              <div className="flex items-center gap-1 ml-auto">
                {[Undo2, Redo2, ImageIcon].map((Icon, k) => (
                  <div key={k} className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-8 w-8 pointer-events-none select-none">
                    <Icon className="h-3 w-3" />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-3 pb-2 flex gap-1.5">
              {["Lyrics", "Chords", "Progressions"].map((t) => (
                <div key={t} className="btn-sculpt-cream rounded-lg px-3 h-7 text-xs flex items-center pointer-events-none select-none">
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col mt-2">
          <button
            type="button"
            className="btn-sculpt-amber inline-flex items-center justify-center gap-2 rounded-lg px-4 h-9 font-semibold text-sm w-full"
            onClick={() => { onClose(); onUpload(); }}
          >
            <ImageIcon className="h-4 w-4" />
            Choose photos
          </button>
          <p className="text-xs text-center" style={{ color: "var(--ink-soft)" }}>
            Save your project after uploading to preserve your photos.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InspirationLightbox({
  photos,
  initialIndex,
  onClose,
  onRemove,
  onRemoveAll,
  onAddPhotos,
}: {
  photos: InspirationPhoto[];
  initialIndex: number;
  onClose: () => void;
  onRemove: (id: string) => void;
  onRemoveAll: () => void;
  onAddPhotos: () => void;
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
        {photos.length < 3 && (
          <button
            type="button"
            onClick={onAddPhotos}
            style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.18)", color: "white",
              border: "1px solid rgba(255,255,255,0.35)", fontSize: 13,
            }}
          >Add photos</button>
        )}
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
  tab: TabName;
  setTab: (t: TabName) => void;
  onTabSelect?: (t: string) => void;
  /** Direction A primary navigation. */
  mode: AppMode;
  onSelectMode: (m: AppMode) => void;
}

export function TransportHeader({ isPlaying, setIsPlaying, tab, setTab, onTabSelect, mode, onSelectMode }: Props) {
  const toolbarExpanded = useUIStore((s) => s.toolbarExpanded);
  const setToolbarExpanded = useUIStore((s) => s.setToolbarExpanded);
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
  const closeChordToolbar = () => {
    if (toolbarExpanded) {
      setToolbarExpanded(false);
      setChordToolbarOpen(false);
    }
  };
  const guardedSetTab = (t: "lyrics" | "chords" | "progressions" | "recordings") => {
    closeChordToolbar();
    if (onTabSelect) onTabSelect(t);
    else setTab(t);
  };
  const {
    meta,
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
    setBpm,
  } = useSongStore();
  const setPlayingStore = usePlaybackStore((s) => s.setIsPlaying);
  const setCurrent = usePlaybackStore((s) => s.setCurrent);
  const { preset, setPreset } = useSoundStore();
  const recUndo = useRecordingsStore((s) => s.undo);
  const recRedo = useRecordingsStore((s) => s.redo);
  const recCanUndo = useRecordingsStore((s) => s.canUndo);
  const recCanRedo = useRecordingsStore((s) => s.canRedo);
  const [fileInputKey, setFileInputKey] = useState(0);
  const driveConfigured = useDriveStore((s) => s.configured);
  const driveOnline = useDriveStore((s) => s.online);
  const driveConnected = useDriveStore((s) => s.connected);
  const driveConnect = useDriveStore((s) => s.connect);
  const driveDisconnect = useDriveStore((s) => s.disconnect);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [localVersions, setLocalVersions] = useState<LocalVersionMeta[]>([]);
  const [hasLocalVersions, setHasLocalVersions] = useState(false);
  const [inspirationModalOpen, setInspirationModalOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [soundOpen, setSoundOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmNewSong, setConfirmNewSong] = useState(false);
  const [stemsProgress, setStemsProgress] = useState<StemExportProgress | null>(null);
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const metronome = useMetronomeStore();
  const appTint = useAppTintStore();
  const appBg = useAppBackgroundStore();
  const onboarding = useOnboardingStore();
  const location = useLocation();
  const stopRequestedRef = useRef(false);
  const playMetaRef = useRef<PlaybackMeta[]>([]);
  const startFromChordIdAtPlayRef = useRef<string | null>(null);
  const loopBeatsRef = useRef<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tapBpm, setTapBpm] = useState<number | null>(null);

  // Stop the metronome only on unmount. Don't return a cleanup keyed to
  // [isPlaying] — React would run it on the false→true transition AFTER
  // handlePlay scheduled the first tick, killing the metronome moments
  // before its first downbeat. handleStop drives the stop side directly.
  useEffect(() => () => stopMetronome(), []);
  useEffect(() => {
    if (!isPlaying) stopMetronome();
  }, [isPlaying]);

  useEffect(() => {
    updateMetronome({ bpm: meta.bpm, beatsPerBar: meta.beatsPerBar, volume: metronome.volume });
  }, [meta.bpm, meta.beatsPerBar, metronome.volume]);

  // Apply tempo changes to running playback without stopping it.
  useEffect(() => {
    if (!isPlaying) return;
    updateScheduledBpm(meta.bpm);
    if (loopBeatsRef.current != null) {
      updateEngineBpm(meta.bpm, loopBeatsRef.current);
    }
  }, [meta.bpm, isPlaying]);

  const handlePlay = async (requestedStartAt?: number) => {
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
    // pattern.chords mirror. Orphaned placements / empty sections are
    // tolerated so Play always plays whatever chords actually exist.
    const built = buildPlayback(sections, progression, startFromChordId);
    if (!built) {
      toast({ title: "Nothing to play yet", description: "Add chords to a pattern in Progressions." });
      return;
    }
    if (built.startAnchorStale) {
      usePlaybackStore.getState().setStartFromChord(null, null);
    }
    const anchorAtPlay = built.startAnchorStale ? null : startFromChordId;
    startFromChordIdAtPlayRef.current = anchorAtPlay;
    playMetaRef.current = built.meta;
    loopBeatsRef.current = built.loopBeats;

    setIsPlaying(true);
    setPlayingStore(true);
    // Seed the playhead to the first chord immediately so the visual indicator
    // appears even if the first draw callback is delayed.
    setCurrent(built.meta[0] ?? null);
    // Anchor metronome and progression to the SAME AudioContext time so the
    // first downbeat tick lines up with the first chord onset.
    // requestedStartAt comes from count-in (pre-calculated beat-1 AC time);
    // fall back to 40 ms from now for a regular press-play.
    const startAt = requestedStartAt ?? getAudioContext().currentTime + 0.04;
    const attack = Math.max(0, useSoundStore.getState().adsr.attack);
    if (metronome.enabled) {
      startMetronome({
        bpm: meta.bpm,
        beatsPerBar: meta.beatsPerBar,
        volume: metronome.volume,
        startAt: startAt + attack,
      });
    }
    await playProgression(built.events, meta.bpm, {
      onChordStart: (idx) => {
        const m = playMetaRef.current;
        setCurrent(m[idx % m.length] ?? null);
      },
      loopBeats: built.loopBeats,
      startAt,
    });
    // Start the recordings engine in lockstep with the progression. Compute
    // the seconds offset corresponding to startFromChordId so the audio
    // playhead aligns to the same musical position.
    let playheadOffsetSec = 0;
    if (anchorAtPlay) {
      const idx = built.meta.findIndex((m) => m.patternChordId === anchorAtPlay);
      if (idx >= 0) {
        const beat = built.events[idx]?.startBeat ?? 0;
        playheadOffsetSec = (beat * 60) / meta.bpm;
      }
    }
    startRecordingsEngine({
      bpm: meta.bpm,
      loopBeats: built.loopBeats,
      startAtCtxTime: startAt,
      playheadOffsetSec,
    });
  };

  // Live re-feed: while the loop is running, mirror SSOT edits into the
  // scheduler so quality / length / add / remove edits ahead of the playhead
  // take effect this iteration, and behind-the-playhead edits land on the
  // next loop wrap.
  useEffect(() => {
    if (!isPlaying) return;
    const built = buildPlayback(sections, progression, startFromChordIdAtPlayRef.current);
    if (!built) return;
    playMetaRef.current = built.meta;
    updateScheduledProgression(built.events, built.loopBeats);
  }, [sections, progression, isPlaying]);

  const handleStop = () => {
    stopRequestedRef.current = true;
    stopProgression();
    stopRecordingsEngine();
    stopMetronome();
    setIsPlaying(false);
    setPlayingStore(false);
    setCurrent(null);
    usePlaybackStore.getState().setStartFromChord(null, null);
  };

  const handleTap = () => {
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    const now = performance.now();
    const times = tapTimesRef.current;
    if (times.length > 0 && now - times[times.length - 1] > 3000) {
      tapTimesRef.current = [];
    }
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 8) tapTimesRef.current.shift();
    if (tapTimesRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b) / intervals.length;
      setTapBpm(Math.max(40, Math.min(220, Math.round(60000 / avg))));
    }
    tapResetRef.current = setTimeout(() => {
      tapTimesRef.current = [];
      setTapBpm(null);
    }, 3000);
  };

  useEffect(() => {
    const onReq = () => { handlePlay(); };
    const onReqAt = (e: Event) => {
      const t = (e as CustomEvent<{ startAtAcTime: number }>).detail?.startAtAcTime;
      handlePlay(t);
    };
    const onStop = () => { handleStop(); };
    window.addEventListener("lovable:request-play", onReq);
    window.addEventListener("lovable:request-play-at", onReqAt);
    window.addEventListener("lovable:request-stop", onStop);
    return () => {
      window.removeEventListener("lovable:request-play", onReq);
      window.removeEventListener("lovable:request-play-at", onReqAt);
      window.removeEventListener("lovable:request-stop", onStop);
    };
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
    } catch {
      toast({ title: "Could not load file", description: "Make sure it's a valid .zip or .json project file." });
    }
    setFileInputKey((k) => k + 1);
  };

  const handleSave = async () => {
    try {
      const result = await saveProject();
      if (result.target === "drive") {
        toast({ title: "Saved to Google Drive" });
      } else if (result.reason === "drive-failed") {
        toast({ title: "Saved offline", description: "Couldn't reach Drive — kept a local backup." });
      } else {
        toast({ title: "Saved offline", description: `Version saved locally (${listLocalVersions().length} of 3).` });
      }
    } catch {
      toast({ title: "Save failed", description: "Could not save the project." });
    }
  };

  const handleConnectDrive = async () => {
    try {
      await driveConnect();
      toast({ title: "Connected to Google Drive" });
      void refreshDriveFiles();
    } catch {
      toast({ title: "Could not connect to Drive" });
    }
  };

  const refreshDriveFiles = async () => {
    setDriveLoading(true);
    try {
      const { listProjects } = await import("@/lib/drive/drive");
      setDriveFiles(await listProjects());
    } catch {
      setDriveFiles([]);
    } finally {
      setDriveLoading(false);
    }
  };

  const openDriveDialog = () => {
    setLocalVersions(listLocalVersions());
    setDriveDialogOpen(true);
    if (driveConnected) void refreshDriveFiles();
  };

  useEffect(() => {
    if (navOpen) setHasLocalVersions(listLocalVersions().length > 0);
  }, [navOpen]);

  const handleOpenDriveFile = async (file: DriveFile) => {
    try {
      await loadProjectFromDrive(file.id);
      toast({ title: "Project loaded", description: file.name });
      setDriveDialogOpen(false);
    } catch {
      toast({ title: "Could not open from Drive" });
    }
  };

  const handleRestoreVersion = async (v: LocalVersionMeta) => {
    try {
      await loadLocalVersionIntoSong(v.slot);
      toast({ title: "Version restored", description: v.title });
      setDriveDialogOpen(false);
    } catch {
      toast({ title: "Could not restore version" });
    }
  };

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
      <div className="mx-auto mt-2 mb-2 flex w-full max-w-[1600px] items-center justify-between px-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="Return to introduction"
            style={{ display: "flex", alignItems: "center", textDecoration: "none", marginLeft: 8 }}
          >
            <span className="logomark-ink" style={{ fontFamily: '"Noto Music"', fontSize: 48, fontWeight: 400, lineHeight: "40px", marginTop: 4 }}>
              𝆑
            </span>
            <span className="logomark-ink" style={{ fontFamily: '"Noto Music"', fontSize: 32, fontStyle: "italic", fontWeight: 400, lineHeight: "40px", marginLeft: -8 }}>
              elt.
            </span>
          </Link>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              if (inspirationPhotos.length > 0) {
                setLightboxIndex(0);
                setLightboxOpen(true);
              } else {
                setInspirationModalOpen(true);
              }
            }}
            className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9"
            aria-label={inspirationPhotos.length > 0 ? "View inspiration photos" : "Add inspiration photo"}
            title={inspirationPhotos.length > 0 ? "View / manage inspiration photos" : "Add up to 3 inspiration photos"}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="sticky top-2 z-40 mx-2 sm:mx-4 mb-2">
      <div className="relative">
        {/* Static inspiration photos — positioned behind header card */}
        {inspirationPhotos.map((photo, i) => {
          const slots = isMobile ? PHOTO_SLOTS : isDesktop ? DESKTOP_PHOTO_SLOTS : TABLET_PHOTO_SLOTS;
          const slot = slots[slots.length - 1 - i] ?? slots[0];
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
            onAddPhotos={() => photoInputRef.current?.click()}
          />
        )}

        <header id="main-header" className="noise-texture rounded-xl border border-border/60 mx-auto w-full max-w-[1600px]" style={{ boxShadow: "var(--shadow-paper)", background: "color-mix(in oklch, var(--card) 20%, transparent)", backdropFilter: "blur(8px) saturate(200%)", WebkitBackdropFilter: "blur(8px) saturate(200%)" }}>
          <div className="mx-auto max-w-6xl px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between relative z-[1]">
            {/* Row 1: SongNote wordmark + undo/redo + menu */}
            <div className="flex items-center justify-between gap-2 sm:[display:contents]">
              {!isPlaying ? (
                <button
                  onClick={() => handlePlay()}
                  className="btn-sculpt-amber shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 font-semibold text-sm sm:order-1"
                  aria-label="Play"
                >
                  <Play className="h-4 w-4 fill-current" />
                  {!isMobile && <span>Play</span>}
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="btn-sculpt-cocoa animate-play-pulse shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 font-semibold text-sm sm:order-1"
                  aria-label="Stop"
                >
                  <Square className="h-4 w-4" />
                  {!isMobile && <span>Stop</span>}
                </button>
              )}

              <div className="flex items-center gap-1.5 shrink-0 sm:order-3">
                <button
                  className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9 disabled:opacity-30"
                  onClick={() => { if (!undo()) recUndo(); }}
                  disabled={!canUndo() && !recCanUndo()}
                  aria-label="Undo"
                  title="Undo (⌘/Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9 disabled:opacity-30"
                  onClick={() => { if (!redo()) recRedo(); }}
                  disabled={!canRedo() && !recCanRedo()}
                  aria-label="Redo"
                  title="Redo (⌘/Ctrl+Shift+Z)"
                >
                  <Redo2 className="h-4 w-4" />
                </button>

                <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <button className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="noise-texture-nav w-80 overflow-y-auto" style={{ background: theme === "dark" ? "color-mix(in oklch, var(--ink-soft) 60%, white 10%)" : "color-mix(in oklch, var(--ink-soft) 60%, transparent)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
              <SheetHeader>
                <SheetTitle className="text-[var(--paper-card)]">Menu</SheetTitle>
              </SheetHeader>

              {/* Project Settings */}
              <div className="mt-6">
                <h3 className="uppercase tracking-wide text-[var(--paper-card)] mb-2 font-light font-mono text-sm">Project Settings</h3>
                <div className="rounded-md border border-border p-3 flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 justify-start gap-2 border-0 whitespace-normal h-auto min-h-10 text-left"
                      style={{ background: "var(--primary-strong)", color: "var(--primary-foreground)" }}
                      onClick={() => { void handleSave(); setNavOpen(false); }}
                    >
                      <Save className="h-4 w-4" /> Save
                    </Button>
                    <label className="flex-1 flex">
                      <input
                        key={fileInputKey}
                        type="file"
                        accept=".zip,application/zip,application/json,.json"
                        className="hidden"
                        onChange={(e) => { handleLoad(e.target.files?.[0]); setNavOpen(false); }}
                      />
                      <span
                        className="inline-flex items-center gap-2 whitespace-normal rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-background hover:bg-accent hover:text-accent-foreground h-auto min-h-12 px-4 py-2 w-full justify-between border-0"
                      >
                        <Upload className="h-4 w-4" /> Load
                      </span>
                    </label>
                  </div>
                  {(driveConfigured || hasLocalVersions) && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 justify-start gap-2 border-0"
                        style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
                        onClick={openDriveDialog}
                      >
                        {driveConnected ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
                        {driveConfigured ? (driveConnected ? "Google Drive" : "Connect Drive") : "Saved versions"}
                      </Button>
                      {driveConfigured && (
                        <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">
                          {!driveOnline ? "Offline" : driveConnected ? "Synced" : "Online"}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 justify-start border-0 whitespace-normal h-auto min-h-10 text-left"
                      style={{ background: "var(--primary-inset)", color: "var(--primary-foreground)" }}
                      onClick={() => { setConfirmNewSong(true); setNavOpen(false); }}
                    >
                      <FilePlus className="h-4 w-4" /> New
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 justify-start border-0 whitespace-normal h-auto min-h-10 text-left"
                      style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
                      onClick={() => { setExportOpen(true); setNavOpen(false); }}
                    >
                      <FileText className="h-4 w-4" /> Export Lyrics
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 justify-start border-0 whitespace-normal h-auto min-h-10 text-left"
                      style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
                      onClick={() => {
                        const s = useSongStore.getState();
                        downloadMidi(s.sections, s.progression, s.meta);
                        setNavOpen(false);
                      }}
                    >
                      <Piano className="h-4 w-4" /> Export MIDI
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 justify-start border-0 whitespace-normal h-auto min-h-10 text-left"
                      disabled={stemsProgress !== null}
                      style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
                      onClick={async () => {
                        const tracks = useRecordingsStore.getState().tracks;
                        if (!tracks.some((t) => t.clips.length > 0)) {
                          toast({ title: "No recorded tracks to export" });
                          return;
                        }
                        setNavOpen(false);
                        toast({ title: "Rendering stems — this may take a moment…" });
                        try {
                          await exportStemsAsZip(
                            tracks,
                            useSongStore.getState().meta.title,
                            (p) => setStemsProgress(p),
                          );
                        } catch {
                          toast({ title: "Stem export failed", description: "Check the browser console for details." });
                        } finally {
                          setStemsProgress(null);
                        }
                      }}
                    >
                      <Layers className="h-4 w-4" />
                      {stemsProgress
                        ? `${stemsProgress.label} (${stemsProgress.current}/${stemsProgress.total})`
                        : "Export Stems"}
                    </Button>
                  </div>
                  <Link
                    to="/help"
                    onClick={() => setNavOpen(false)}
                    className="inline-flex items-center gap-2 h-9 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent"
                  >
                    <HelpCircle className="h-4 w-4" /> Help & User Manual
                  </Link>
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 h-9">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                      Dark mode
                    </div>
                    <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
                  </div>
                  {suppressCrossTabDeleteWarning && (
                    <Button
                      variant="outline"
                      className="justify-start border border-border"
                      onClick={() => { setSuppressCrossTabDeleteWarning(false); toast({ title: "Delete warnings re-enabled" }); setNavOpen(false); }}
                    >
                      Reset delete warnings
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="justify-start border border-border"
                    onClick={() => {
                      if (onboarding.enabled) {
                        onboarding.disable();
                        toast({ title: "Tutorial disabled" });
                      } else {
                        onboarding.enable();
                        toast({ title: "Tutorial enabled" });
                      }
                    }}
                  >
                    {onboarding.enabled ? "Turn off Tutorial" : "Turn on Tutorial"}
                  </Button>
                </div>
              </div>

              {/* Tempo */}
              <div className="mt-6">
                <h3 className="uppercase tracking-wide text-[var(--paper-card)] mb-2 font-light font-mono text-sm">Tempo</h3>
                <div className="rounded-md border border-border p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: "var(--paper-card)" }}>Current BPM</span>
                    <span className="font-mono-chord text-2xl font-bold" style={{ color: "var(--paper-card)" }}>{meta.bpm}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBpm(meta.bpm - 1)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-base font-bold text-ink"
                      aria-label="Decrease BPM"
                    >−</button>
                    <button
                      type="button"
                      onClick={handleTap}
                      className="flex-1 inline-flex items-center justify-center h-9 rounded-md border border-border bg-background text-sm font-bold text-ink"
                      aria-label="Tap tempo"
                    >
                      {tapBpm != null ? `${tapBpm} BPM — tap` : "Tap Tempo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBpm(meta.bpm + 1)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-base font-bold text-ink"
                      aria-label="Increase BPM"
                    >+</button>
                  </div>
                  {tapBpm != null && tapBpm !== meta.bpm && (
                    <button
                      type="button"
                      onClick={() => { setBpm(tapBpm); setTapBpm(null); tapTimesRef.current = []; if (tapResetRef.current) clearTimeout(tapResetRef.current); }}
                      className="btn-sculpt-amber inline-flex items-center justify-center h-9 rounded-lg text-sm font-bold"
                    >
                      Set {tapBpm} BPM
                    </button>
                  )}
                </div>
              </div>

              {/* Sound Settings */}
              <div className="mt-6 flex flex-col gap-2">
                <h3 className="uppercase tracking-wide text-[var(--paper-card)] mb-2 font-light font-mono text-sm">Sound Settings</h3>
                <Select value={preset} onValueChange={(v) => setPreset(v as SoundPreset)}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => { setSoundOpen(true); setNavOpen(false); }}
                >
                  <Music2 className="h-4 w-4" /> Sound
                </Button>
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => { guardedSetTab("chords"); setNavOpen(false); }}
                >
                  <Compass className="h-4 w-4" /> Explore Chords
                </Button>
              </div>

              {/* Background Customization */}
              <div className="mt-6">
                <h3 className="uppercase tracking-wide text-[var(--paper-card)] mb-2 font-light font-mono text-sm">Background Customization</h3>
                <div className="rounded-md border border-border p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <PatternPicker value={appBg.pattern} onChange={appBg.setPattern} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 h-9">
                    <MaskToggle value={appBg.mask} onChange={appBg.setMask} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 h-9">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
                      <Palette className="h-4 w-4" />
                      Background Tint
                    </div>
                    <SectionColorPicker
                      value={appTint.tint}
                      onChange={(c) => appTint.setTint(c as SectionColor | null)}
                    />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
              </div>
        </div>

        {/* Row 2: Tabs */}
        <div className="flex items-center justify-center gap-3 sm:order-2 sm:justify-start">

          {/* Tabs bar — recessed well with cocoa active pill */}
          <div className="relative" ref={tabsBarRef}>
            <div
              className="inline-flex items-center gap-1"
              style={{
                padding: "7px 5px 7px",
                background: "var(--paper-shade)",
                borderRadius: 10,
                boxShadow: "var(--shadow-recess)",
              }}
            >
              {(["write", "arrange"] as const).map((m) => {
                const isOnboardingPhase0 = onboarding.enabled && onboarding.globalPhase === 0;
                const onChordsOverlay = tab === "chords" || tab === "voicekey";
                const active = !isOnboardingPhase0 && !onChordsOverlay && mode === m;
                const LABEL: Record<AppMode, string> = { write: "1. Write and Record", arrange: "2. Arrange" };
                return (
                  <button
                    key={m}
                    onClick={() => {
                      closeChordToolbar();
                      onSelectMode(m);
                    }}
                    style={{
                      padding: "7px 16px",
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
                    {LABEL[m]}
                  </button>
                );
              })}
            </div>

            {onboarding.enabled && onboarding.globalPhase === 0 && onboarding.dismissedKey !== "phase-0" && location.pathname !== '/' && (
              <AnchoredCoachMark
                anchorRef={tabsBarRef}
                step="1/7"
                message="Write lyrics or build progressions? Tap a tab to begin"
                arrowSide="top"
                onDismiss={() => onboarding.dismissCoachMark("phase-0")}
              />
            )}
          </div>
        </div>
      </div>
        </header>
        <InspirationOnboardingModal
          open={inspirationModalOpen}
          onClose={() => setInspirationModalOpen(false)}
          onUpload={() => photoInputRef.current?.click()}
        />
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
              void downloadProjectZip(meta.title.replace(/\s+/g, "-").toLowerCase() + ".zip")
            }
          >
            <Save className="h-4 w-4" /> Save first
          </Button>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              resetSong();
              useTakesStore.getState().clear();
              useRecordingsStore.getState().clear();
              onboarding.resetForNewSong();
              onboarding.incrementNewSong();
              setConfirmNewSong(false);
              toast({ title: "New song started" });
            }}
          >
            Start new song
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={driveDialogOpen} onOpenChange={setDriveDialogOpen}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{driveConfigured ? "Google Drive" : "Saved versions"}</DialogTitle>
          <DialogDescription>
            {!driveConfigured
              ? "Restore a recent offline version of your project."
              : driveConnected
              ? "Open a project from your Drive, or restore a recent offline version."
              : "Connect your Google Drive to save and open projects across devices."}
          </DialogDescription>
        </DialogHeader>

        {driveConfigured && !driveConnected ? (
          <Button
            className="w-full justify-center gap-2"
            disabled={!driveOnline}
            onClick={() => void handleConnectDrive()}
          >
            <Cloud className="h-4 w-4" /> {driveOnline ? "Connect Google Drive" : "Offline — connect when online"}
          </Button>
        ) : driveConfigured && driveConnected ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Your Drive projects</span>
              <Button variant="ghost" size="sm" onClick={() => void refreshDriveFiles()} disabled={driveLoading}>
                <RotateCcw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
            {driveLoading ? (
              <p className="text-sm text-[var(--ink-soft)] py-2">Loading…</p>
            ) : driveFiles.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)] py-2">No projects saved to Drive yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {driveFiles.map((f) => (
                  <li key={f.id}>
                    <button
                      className="w-full text-left rounded-md px-3 py-2 hover:bg-accent flex items-center justify-between gap-2"
                      onClick={() => void handleOpenDriveFile(f)}
                    >
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">
                        {new Date(f.modifiedTime).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="ghost" size="sm" className="self-start" onClick={driveDisconnect}>
              <CloudOff className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </div>
        ) : null}

        {localVersions.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-sm font-medium">Offline versions</span>
            <ul className="flex flex-col gap-1">
              {localVersions.map((v) => (
                <li key={v.slot}>
                  <button
                    className="w-full text-left rounded-md px-3 py-2 hover:bg-accent flex items-center justify-between gap-2"
                    onClick={() => void handleRestoreVersion(v)}
                  >
                    <span className="truncate">{v.title}</span>
                    <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">
                      {new Date(v.savedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => void downloadProjectZip(meta.title.replace(/\s+/g, "-").toLowerCase() + ".zip")}>
            <Save className="h-4 w-4" /> Download a copy (.zip)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
