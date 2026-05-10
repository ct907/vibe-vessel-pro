import { useEffect, useState } from "react";
import { useSongStore } from "@/store/song";
import { downloadProjectJSON, loadProjectFromFile } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
    resetSong,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSongStore();
  const focusedPatternId = usePlaybackStore((s) => s.focusedPatternId);
  const setPlayingStore = usePlaybackStore((s) => s.setIsPlaying);
  const setCurrent = usePlaybackStore((s) => s.setCurrent);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [soundOpen, setSoundOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmNewSong, setConfirmNewSong] = useState(false);
  const [bpmDraft, setBpmDraft] = useState<string>(String(meta.bpm));
  const isMobile = useIsMobile();
  const [transposeOffset, setTransposeOffset] = useState(0);
  const metronome = useMetronomeStore();

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
    await ensureAudio();
    // Defensive: AudioContext may be suspended after autoplay-policy
    // restrictions (Safari, mobile). resume() is idempotent.
    try {
      const ac = getAudioContext();
      if (ac.state === "suspended") await ac.resume();
    } catch { /* ignore */ }
    // Drop a stale focused-pattern cursor that no longer exists in the
    // current progression (e.g. after section delete or cross-tab edit).
    let activeFocusedId = focusedPatternId;
    if (activeFocusedId && !progression.some((p) => p.id === activeFocusedId)) {
      usePlaybackStore.getState().setStartFromChord(null, null);
      activeFocusedId = null;
    }
    const startIdx = activeFocusedId
      ? Math.max(0, progression.findIndex((p) => p.id === activeFocusedId))
      : 0;
    const ordered =
      startIdx > 0 ? [...progression.slice(startIdx), ...progression.slice(0, startIdx)] : progression;

    let cursorBeat = 0;
    const events: ScheduledChord[] = [];
    const meta2: Array<{ patternId: string; patternChordId: string; mirrorId?: string }> = [];
    ordered.forEach((p) => {
      const totalBeats = p.bars * p.beatsPerBar;
      [...p.chords]
        .sort((a, b) => a.startBeat - b.startBeat)
        .forEach((c) => {
          events.push({ chord: c.chord, startBeat: cursorBeat + c.startBeat, lengthBeats: c.lengthBeats });
          meta2.push({ patternId: p.id, patternChordId: c.id, mirrorId: c.mirrorId });
        });
      cursorBeat += totalBeats;
    });
    if (!events.length) {
      toast({ title: "Nothing to play yet", description: "Add chords to a pattern in Progressions." });
      return;
    }

    const startFromChordId = usePlaybackStore.getState().startFromChordId;
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
      loopBeats: cursorBeat,
      onChordStart: (idx) => setCurrent(playMeta[idx] ?? null),
      startAt,
    });
  };

  const handleStop = () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progression, focusedPatternId, meta.bpm]);

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

  return (
    <header id="main-header" className="sticky top-2 z-40 mx-2 sm:mx-4 mt-2 rounded-xl bg-card/95 backdrop-blur border border-border/60 shadow-[0_8px_24px_-8px_color-mix(in_oklch,var(--primary)_45%,transparent),0_2px_8px_-2px_color-mix(in_oklch,var(--primary)_25%,transparent)]">
      <div className="mx-auto max-w-6xl px-3 py-2 flex flex-col gap-2">
        {/* Row 1: Bookmark icon + Gallery placeholder + Menu */}
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 ink-chord shrink-0" />

          {/* Gallery placeholder (deferred) */}
          <div className="flex-1 flex items-center gap-1.5">
            <button
              type="button"
              disabled
              aria-label="Add inspiration image (coming soon)"
              title="Add up to 3 inspiration images — coming soon"
              className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-dashed border-border text-xs text-muted-foreground/70 hover:bg-accent/40 disabled:opacity-60"
            >
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Add inspiration</span>
            </button>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => undo()}
              disabled={!canUndo()}
              aria-label="Undo"
              title="Undo (⌘/Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => redo()}
              disabled={!canRedo()}
              aria-label="Redo"
              title="Redo (⌘/Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              {/* Song Settings */}
              <div className="mt-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
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
        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <Button size="sm" onClick={handlePlay} className="btn-neumorphic-play shrink-0">
              <Play className="h-4 w-4" />
              {!isMobile && "Play"}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handleStop} className="shrink-0">
              <Square className="h-4 w-4" />
              {!isMobile && "Stop"}
            </Button>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex justify-center">
            <TabsList className="bg-paper-shade/70 gap-1.5 p-1.5">
              <TabsTrigger value="lyrics" className="px-3 sm:px-4">Lyrics</TabsTrigger>
              <TabsTrigger value="chords" className="px-3 sm:px-4">Chords</TabsTrigger>
              <TabsTrigger value="progressions" className="px-3 sm:px-4">Progressions</TabsTrigger>
            </TabsList>
          </Tabs>
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
    </header>
  );
}
