import { useMemo, useState } from "react";
import { useSongStore, type PatternBlock } from "@/store/song";
import { generateProgressionSuggestions, buildGoogleSearchUrl } from "@/lib/music/suggestions";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Play, Square, ExternalLink, Sparkles, Check } from "lucide-react";
import { ensureAudio, playProgression, stopProgression, type ScheduledChord } from "@/lib/music/audio";
import { cn } from "@/lib/utils";

interface Props {
  pattern: PatternBlock;
}

/**
 * Collapsible panel that lists up to 4 deterministic chord-progression
 * variations that preserve the source pattern's chord lengths exactly. Each
 * row has its own play/stop button and a Replace action.
 */
export function SuggestionsPanel({ pattern }: Props) {
  const meta = useSongStore((s) => s.meta);
  const replacePatternChords = useSongStore((s) => s.replacePatternChords);
  const [open, setOpen] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  const sortedChords = useMemo(() => [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat), [pattern.chords]);

  const suggestions = useMemo(
    () =>
      generateProgressionSuggestions(
        sortedChords.map((c) => c.chord),
        meta.keyRoot,
        meta.keyMode,
      ),
    [sortedChords, meta.keyRoot, meta.keyMode],
  );

  const stopPreview = () => {
    stopProgression();
    setPlayingIdx(null);
  };

  const playSuggestion = async (
    idx: number,
    chords: ReturnType<typeof generateProgressionSuggestions>[number]["chords"],
  ) => {
    if (playingIdx === idx) {
      stopPreview();
      return;
    }
    stopProgression();
    await ensureAudio();
    const events: ScheduledChord[] = sortedChords.map((c, i) => ({
      chord: chords[i] ?? c.chord,
      startBeat: c.startBeat,
      lengthBeats: c.lengthBeats,
    }));
    setPlayingIdx(idx);
    await playProgression(events, meta.bpm, {
      onEnd: () => setPlayingIdx(null),
    });
  };

  const handleReplace = (idx: number, chords: ReturnType<typeof generateProgressionSuggestions>[number]["chords"]) => {
    if (playingIdx === idx) stopPreview();
    replacePatternChords(pattern.id, chords);
  };

  if (sortedChords.length < 2) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) stopPreview();
      }}
      className="mt-1 pt-2"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-auto flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Suggest variations
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform w-auto px-1", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-1.5">
        {suggestions.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground space-y-2">
            <p>No variations found for this progression.</p>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <a
                href={buildGoogleSearchUrl(
                  sortedChords.map((c) => c.chord),
                  meta.keyRoot,
                  meta.keyMode,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Search Google for similar progressions
              </a>
            </Button>
          </div>
        ) : (
          suggestions.map((s, idx) => {
            const isPlaying = playingIdx === idx;
            return (
              <div key={idx} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{s.label}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {s.chords.map((c, i) => (
                      <span
                        key={i}
                        className="font-mono-chord text-xs font-semibold px-1.5 py-0.5 rounded bg-chord-chip/40 text-chord-chip-foreground"
                      >
                        {c.display}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleReplace(idx, s.chords)}
                  title="Replace pattern with this variation"
                  aria-label="Replace pattern with this variation"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant={isPlaying ? "secondary" : "outline"}
                  className="h-7 w-7 shrink-0"
                  onClick={() => playSuggestion(idx, s.chords)}
                  title={isPlaying ? "Stop preview" : "Play this variation"}
                  aria-label={isPlaying ? "Stop preview" : "Play this variation"}
                >
                  {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
              </div>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
