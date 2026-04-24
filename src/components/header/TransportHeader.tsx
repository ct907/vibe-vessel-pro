import { useEffect, useState } from "react";
import { useSongStore } from "@/store/song";
import { downloadProjectJSON, loadProjectFromFile } from "@/store/song";
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
  Settings,
  FilePlus,
} from "lucide-react";
import { ALL_ROOTS, MODE_LABEL, type Mode } from "@/lib/music/chords";
import { ensureAudio, playProgression, stopProgression, ScheduledChord } from "@/lib/music/audio";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
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
import { Link } from "react-router-dom";
import { Music2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  isPlaying: boolean;
  setIsPlaying: (b: boolean) => void;
}

export function TransportHeader({ isPlaying, setIsPlaying }: Props) {
  const {
    meta,
    setTitle,
    setKey,
    setBpm,
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
  // Track total semitones the user has shifted from the original key in this session.
  const [transposeOffset, setTransposeOffset] = useState(0);

  const handlePlay = async () => {
    await ensureAudio();
    // Build a global, looping event list. If a pattern is focused,
    // start sequence at that pattern (loop continues from its position).
    const startIdx = focusedPatternId
      ? Math.max(
          0,
          progression.findIndex((p) => p.id === focusedPatternId),
        )
      : 0;
    const ordered = startIdx > 0 ? [...progression.slice(startIdx), ...progression.slice(0, startIdx)] : progression;

    let cursorBeat = 0;
    const events: ScheduledChord[] = [];
    const meta2: Array<{ patternId: string; patternChordId: string; mirrorId?: string }> = [];
    ordered.forEach((p) => {
      const totalBeats = p.bars * p.beatsPerBar;
      [...p.chords]
        .sort((a, b) => a.startBeat - b.startBeat)
        .forEach((c) => {
          events.push({
            chord: c.chord,
            startBeat: cursorBeat + c.startBeat,
            lengthBeats: c.lengthBeats,
          });
          meta2.push({ patternId: p.id, patternChordId: c.id, mirrorId: c.mirrorId });
        });
      cursorBeat += totalBeats;
    });
    if (!events.length) {
      toast({ title: "Nothing to play yet", description: "Add chords to a pattern in Progressions." });
      return;
    }

    // If the user invoked "Play from here" on a specific chord, rotate
    // events so that chord plays first while the loop length is preserved.
    const startFromChordId = usePlaybackStore.getState().startFromChordId;
    let playEvents = events;
    let playMeta = meta2;
    if (startFromChordId) {
      const i = meta2.findIndex((m) => m.patternChordId === startFromChordId);
      if (i > 0) {
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
    await playProgression(playEvents, meta.bpm, {
      loopBeats: cursorBeat,
      onChordStart: (idx) => setCurrent(playMeta[idx] ?? null),
    });
  };

  const handleStop = () => {
    stopProgression();
    setIsPlaying(false);
    setPlayingStore(false);
    setCurrent(null);
  };

  // Allow other components (e.g. ProgressionsTab "Play from here") to trigger playback.
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
    <header className="border-b border-border bg-paper/85">
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-3">
        {/* Row 1: Logo + Title + Nav menu */}
        <div className="flex items-center gap-2 justify-between">
          <BookOpen className="h-5 w-5 ink-chord" />
          <Input
            value={meta.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter song title..."
            className="text-center !text-2xl flex-1 min-w-0 max-w-xs font-display bg-transparent border-0 border-b border-transparent rounded-none px-1 focus-visible:border-primary focus-visible:ring-0"
          />
          {/* Nav menu (top right of first row) */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10
                "
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
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

        {/* Row 2 (was row 3): Transpose + Play + Undo/Redo */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button
              variant="outline"
              size="icon"
              className="w-10"
              onClick={() => stepTranspose(-1)}
              aria-label="Transpose down semitone"
            >
              <span aria-hidden className="text-base leading-none">
                −
              </span>
            </Button>
            <span className="font-mono-chord text-xs px-1.5 pt-1 text-center tabular-nums whitespace-nowrap">
              {isMobile ? "Transp" : "Transpose"} {fmtOffset(transposeOffset)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="w-10"
              onClick={() => stepTranspose(1)}
              aria-label="Transpose up semitone"
            >
              <span aria-hidden className="text-base leading-none">
                +
              </span>
            </Button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              onClick={() => undo()}
              disabled={!canUndo()}
              aria-label="Undo"
              title="Undo (⌘/Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              onClick={() => redo()}
              disabled={!canRedo()}
              aria-label="Redo"
              title="Redo (⌘/Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            {!isPlaying ? (
              <Button size="sm" onClick={handlePlay}>
                <Play className="h-4 w-4 shadow-lg shadow-primary/50" /> Play
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleStop}>
                <Square className="h-4 w-4" /> Stop
              </Button>
            )}
          </div>
        </div>

        {/* Row 3 (was row 2): Key + BPM */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Key</span>
            <Select value={meta.keyRoot} onValueChange={(v) => setKey(v, meta.keyMode)}>
              <SelectTrigger className="h-10 w-auto min-w-0 px-2 gap-1 font-mono-chord">
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
              <SelectTrigger className="h-10 w-[140px]">
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

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">BPM</span>
            <Input
              type="number"
              min={40}
              max={220}
              value={meta.bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="h-10 w-14 px-1 text-center font-mono-chord [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </div>
      </div>
      <SoundPanel open={soundOpen} onOpenChange={setSoundOpen} />
      <ExportLyricsSheet open={exportOpen} onOpenChange={setExportOpen} />
    </header>
  );
}
