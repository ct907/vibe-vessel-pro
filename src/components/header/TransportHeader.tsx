import { useState } from "react";
import { useSongStore } from "@/store/song";
import { downloadProjectJSON, loadProjectFromFile } from "@/store/song";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Play, Square, Minus, Plus, Save, Upload, BookOpen, Menu } from "lucide-react";
import { ALL_ROOTS } from "@/lib/music/chords";
import { ensureAudio, playProgression, stopProgression, ScheduledChord } from "@/lib/music/audio";
import { toast } from "@/hooks/use-toast";

interface Props {
  isPlaying: boolean;
  setIsPlaying: (b: boolean) => void;
}

export function TransportHeader({ isPlaying, setIsPlaying }: Props) {
  const { meta, setTitle, setKey, setBpm, transposeSong, progression } = useSongStore();
  const [fileInputKey, setFileInputKey] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  // Track total semitones the user has shifted from the original key in this session.
  const [transposeOffset, setTransposeOffset] = useState(0);

  const handlePlay = async () => {
    await ensureAudio();
    let cursorBeat = 0;
    const events: ScheduledChord[] = [];
    progression.forEach((p) => {
      const totalBeats = p.bars * p.beatsPerBar;
      p.chords.forEach((c) => {
        events.push({
          chord: c.chord,
          startBeat: cursorBeat + c.startBeat,
          lengthBeats: c.lengthBeats,
        });
      });
      cursorBeat += totalBeats;
    });
    if (!events.length) {
      toast({ title: "Nothing to play yet", description: "Add chords to a pattern in Progressions." });
      return;
    }
    setIsPlaying(true);
    await playProgression(events, meta.bpm, undefined, cursorBeat);
  };

  const handleStop = () => {
    stopProgression();
    setIsPlaying(false);
  };

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
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 ink-chord" />
          <span className="font-display text-xl font-bold">Notebook</span>
          <span className="text-muted-foreground">›</span>
          <Input
            value={meta.title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 flex-1 min-w-0 max-w-xs font-display text-base bg-transparent border-0 border-b border-transparent rounded-none px-1 focus-visible:border-primary focus-visible:ring-0"
          />
          {/* Nav menu (top right of first row) */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 ml-auto" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="justify-start border border-border"
                  onClick={() => {
                    downloadProjectJSON(
                      meta.title.replace(/\s+/g, "-").toLowerCase() + ".json",
                    );
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
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Row 2 (was row 3): Transpose + Play */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Transpose</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => stepTranspose(-1)}
              aria-label="Down semitone"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="font-mono-chord text-sm w-8 text-center tabular-nums">
              {fmtOffset(transposeOffset)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => stepTranspose(1)}
              aria-label="Up semitone"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {!isPlaying ? (
              <Button size="sm" onClick={handlePlay}>
                <Play className="h-4 w-4" /> Play
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
              <SelectTrigger className="h-8 w-auto min-w-0 px-2 gap-1 font-mono-chord">
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
            <Select value={meta.keyMode} onValueChange={(v) => setKey(meta.keyRoot, v as "maj" | "min")}>
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maj">major</SelectItem>
                <SelectItem value="min">minor</SelectItem>
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
              className="h-8 w-16 font-mono-chord"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
