import { useMemo, useState } from "react";
import { useSongStore, type PatternBlock, getPatternChordsViaSSOT } from "@/store/song";
import { generateSpiceSuggestions, type SpiceSuggestion, type SpiceCategory } from "@/lib/music/spice";
import { ensureAudio, playProgression, stopProgression, type ScheduledChord } from "@/lib/music/audio";
import { ChordChip } from "@/components/chord/ChordChip";
import { Sparkles, Play, Square, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { ChordSymbol } from "@/lib/music/chords";

interface Props {
  pattern: PatternBlock;
  activeChordId: string | null;
  onAuditionChange?: (chords: ChordSymbol[] | null) => void;
  /** When provided, the trigger button is hidden and parent controls open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const CATEGORY_ORDER: SpiceCategory[] = [
  "cinematic", "espionage", "cosmic_drift", "borrowed_colour", "gateway",
  "step_between", "hypnotic_drone", "amplify", "break_pattern",
];

const CATEGORY_EMOJI: Record<SpiceCategory, string> = {
  cinematic: "🎬",
  espionage: "🕵️",
  cosmic_drift: "🌌",
  gateway: "✨",
  step_between: "🛤️",
  hypnotic_drone: "🧘",
  amplify: "🔥",
  break_pattern: "💥",
  borrowed_colour: "🎨",
};


export function SpicePanel({ pattern, activeChordId, onAuditionChange, open: openProp, onOpenChange, hideTrigger }: Props) {
  const meta = useSongStore((s) => s.meta);
  const replacePatternChords = useSongStore((s) => s.replacePatternChords);
  const removePatternChordsBatch = useSongStore((s) => s.removePatternChordsBatch);
  const addChordToPattern = useSongStore((s) => s.addChordToPattern);
  const ownerSection = useSongStore((s) =>
    s.sections.find((sec) => sec.id === (pattern.sectionId ?? pattern.id)),
  );
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setOpenInternal(v);
  };
  const [playingId, setPlayingId] = useState<string | null>(null);

  const sortedChords = useMemo(
    () => ownerSection ? getPatternChordsViaSSOT(ownerSection, pattern) : [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat),
    [ownerSection, pattern],
  );

  const focusedIndex = useMemo(() => {
    if (!activeChordId) return -1;
    return sortedChords.findIndex((c) => c.id === activeChordId);
  }, [activeChordId, sortedChords]);

  const suggestions: SpiceSuggestion[] = useMemo(() => {
    if (sortedChords.length < 2) return [];
    const scope = focusedIndex >= 0 ? { chordIndex: focusedIndex } : "whole_chain" as const;
    return generateSpiceSuggestions(
      sortedChords.map((c) => c.chord),
      meta.keyRoot,
      meta.keyMode,
      scope,
      sortedChords.map((c) => c.lengthBeats),
    );
  }, [sortedChords, meta.keyRoot, meta.keyMode, focusedIndex]);

  const grouped = useMemo(() => {
    const m = new Map<SpiceCategory, SpiceSuggestion[]>();
    for (const s of suggestions) {
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return m;
  }, [suggestions]);

  const stopPreview = () => {
    stopProgression();
    setPlayingId(null);
    onAuditionChange?.(null);
  };

  const octaveFor = (i: number): number => {
    for (let k = Math.min(i, sortedChords.length - 1); k >= 0; k--) {
      const o = sortedChords[k]?.chord.octave;
      if (typeof o === "number") return o;
    }
    return 3;
  };

  const withOctave = (c: ChordSymbol, i: number): ChordSymbol => ({ ...c, octave: octaveFor(i) });

  const playSuggestion = async (s: SpiceSuggestion) => {
    if (playingId === s.id) { stopPreview(); return; }
    stopProgression();
    await ensureAudio();
    onAuditionChange?.(s.chords);
    let cursor = 0;
    const events: ScheduledChord[] = s.chords.map((c, i) => {
      const len = s.suggestedDurations?.[i] ?? sortedChords[i]?.lengthBeats ?? 2;
      const ev: ScheduledChord = { chord: withOctave(c, i), startBeat: cursor, lengthBeats: len };
      cursor += len;
      return ev;
    });
    setPlayingId(s.id);
    await playProgression(events, meta.bpm, {
      loopBeats: cursor,
      onEnd: () => {
        setPlayingId((id) => (id === s.id ? null : id));
        onAuditionChange?.(null);
      },
    });
  };

  const commitSuggestion = (s: SpiceSuggestion) => {
    const previousChords = sortedChords.map((c) => c.chord);
    const previousDurations = sortedChords.map((c) => c.lengthBeats);
    if (playingId === s.id) stopPreview();

    if (s.countChanged) {
      const ids = sortedChords.map((c) => c.id);
      if (ids.length > 0) removePatternChordsBatch(pattern.id, ids);
      let cursor = 0;
      const durations = s.suggestedDurations ?? s.chords.map(() => 2);
      s.chords.forEach((c, i) => {
        const len = durations[i] ?? 2;
        addChordToPattern(pattern.id, withOctave(c, i), cursor, len);
        cursor += len;
      });
    } else {
      replacePatternChords(pattern.id, s.chords.map((c, i) => withOctave(c, i)));
    }


    toast({
      title: `Applied "${CATEGORY_EMOJI[s.category]} ${s.emotiveLabel}"`,
      description: s.theoryLabel,
      action: (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (s.countChanged) {
              const currentIds = useSongStore.getState().progression
                .find((p) => p.id === pattern.id)?.chords.map((c) => c.id) ?? [];
              if (currentIds.length > 0) removePatternChordsBatch(pattern.id, currentIds);
              let cursor = 0;
              previousChords.forEach((c, i) => {
                const len = previousDurations[i] ?? 2;
                addChordToPattern(pattern.id, c, cursor, len);
                cursor += len;
              });
            } else {
              replacePatternChords(pattern.id, previousChords);
            }
          }}
        >
          Undo
        </Button>
      ),
      duration: 5000,
    });
  };

  if (sortedChords.length < 2) return null;

  return (
    <div className={hideTrigger ? "" : "mt-2 pt-2"}>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (!next) stopPreview();
          }}
          className="inline-flex items-center gap-1.5 font-display text-sm text-foreground hover:text-primary transition-colors py-1 px-2 rounded-md"
          style={{ color: open ? "var(--primary-strong)" : undefined }}
        >
          <Sparkles className="h-4 w-4" style={{ color: "var(--primary)" }} />
          ✧ Add Spice
        </button>
      )}

      {open && (
        <div className="mt-2 space-y-3">
          {focusedIndex >= 0 && (
            <div className="text-[11px] text-muted-foreground italic">
              Spicing chord {focusedIndex + 1} of {sortedChords.length} — tap background for whole-chain.
            </div>
          )}
          {suggestions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              No spice ideas for this progression right now.
            </div>
          ) : (
            CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
              const items = grouped.get(cat)!;
              const first = items[0];
              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-baseline gap-2 px-1">
                    <span className="text-sm font-display font-semibold">
                      {CATEGORY_EMOJI[cat]} {first.emotiveLabel}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {first.theoryLabel.includes(" ") ? first.theoryLabel : items[0].theoryLabel}
                    </span>
                  </div>
                  {items.map((s) => {
                    const isPlaying = playingId === s.id;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                            {s.theoryLabel}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {s.chords.map((c, i) => (
                              <span
                                key={`${s.id}-${i}`}
                                className={cn(
                                  "rounded",
                                  s.changedIndices.includes(i) && "ring-1 ring-primary/60",
                                )}
                              >
                                <ChordChip chord={c as ChordSymbol} variant="ink" size="sm" />
                              </span>
                            ))}
                          </div>
                          {s.frictionDelta !== 0 && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              friction {s.frictionDelta > 0 ? "+" : ""}{s.frictionDelta.toFixed(1)}
                            </p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant={isPlaying ? "secondary" : "outline"}
                          className="h-7 w-7 shrink-0"
                          onClick={() => playSuggestion(s)}
                          title={isPlaying ? "Stop preview" : "Audition"}
                          aria-label={isPlaying ? "Stop preview" : "Audition"}
                        >
                          {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                        <button
                          type="button"
                          onClick={() => commitSuggestion(s)}
                          className={cn(
                            "inline-flex items-center justify-center rounded-md h-7 w-7 shrink-0 transition-all",
                            isPlaying ? "btn-sculpt-amber" : "btn-sculpt-cream",
                          )}
                          title="Apply"
                          aria-label="Apply suggestion"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
