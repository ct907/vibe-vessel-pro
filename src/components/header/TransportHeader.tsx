import { useState } from "react";
import { useSongStore } from "@/store/song";
import {
  downloadProjectJSON,
  loadProjectFromFile,
} from "@/store/song";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Minus, Plus, Save, Upload, BookOpen } from "lucide-react";
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

  const handlePlay = async () => {
    await ensureAudio();
    // Flatten the entire progression into scheduled chords end-to-end.
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
    } catch {
      toast({ title: "Could not load file", description: "Make sure it's a valid song.json" });
    }
    setFileInputKey((k) => k + 1);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <BookOpen className="h-5 w-5 ink-chord" />
          <span className="font-display text-lg font-semibold">Notebook</span>
          <span className="text-muted-foreground">›</span>
          <Input
            value={meta.title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 w-44 font-display text-base bg-transparent border-0 border-b border-transparent rounded-none px-1 focus-visible:border-primary focus-visible:ring-0"
          />
        </div>

        {/* Key */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Key</span>
          <Select value={meta.keyRoot} onValueChange={(v) => setKey(v, meta.keyMode)}>
            <SelectTrigger className="h-8 w-[78px] font-mono-chord">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROOTS.map((r) => (
                <SelectItem key={r} value={r} className="font-mono-chord">{r}</SelectItem>
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

        {/* BPM */}
        <div className="flex items-center gap-2 min-w-[180px]">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">BPM</span>
          <Input
            type="number"
            min={40}
            max={220}
            value={meta.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="h-8 w-16 font-mono-chord"
          />
          <Slider
            min={40}
            max={220}
            step={1}
            value={[meta.bpm]}
            onValueChange={([v]) => setBpm(v)}
            className="w-28"
          />
        </div>

        {/* Transpose */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Transpose</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => transposeSong(-1)} aria-label="Down semitone">
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => transposeSong(1)} aria-label="Up semitone">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Transport */}
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

          <Button size="sm" variant="ghost" onClick={() => downloadProjectJSON(meta.title.replace(/\s+/g, "-").toLowerCase() + ".json")}>
            <Save className="h-4 w-4" /> Save
          </Button>
          <label className="inline-flex">
            <input
              key={fileInputKey}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleLoad(e.target.files?.[0])}
            />
            <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent">
              <Upload className="h-4 w-4" /> Load
            </span>
          </label>
        </div>
      </div>
    </header>
  );
}
