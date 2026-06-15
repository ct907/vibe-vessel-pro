import { useMemo, useState } from "react";
import type { RefObject } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSongStore, getSectionDisplayName, getPatternChordsViaSSOT, type PatternBlock } from "@/store/song";
import {
  VIBES,
  STAR_MEANING,
  generateVibeSuggestions,
  type Vibe,
  type VibeSuggestion,
} from "@/lib/music/vibes";
import { ensureAudio, playProgression, stopProgression, type ScheduledChord } from "@/lib/music/audio";
import { ChordChip } from "@/components/chord/ChordChip";
import { Play, Square, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { ChordSymbol } from "@/lib/music/chords";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: PatternBlock;
  blockIndex: number;
  activeChordId: string | null;
  onAuditionChange?: (chords: ChordSymbol[] | null) => void;
  onVariationApplied?: () => void;
  headerRef?: RefObject<HTMLDivElement | null>;
}

const Stars = ({ n }: { n: 1 | 2 | 3 }) => (
  <span className="text-amber-500 text-xs tracking-tight" aria-label={`${n} stars`}>
    {"★".repeat(n)}
    {"☆".repeat(3 - n)}
  </span>
);

export function SpiceSheet({ open, onOpenChange, pattern, blockIndex, activeChordId, onAuditionChange, onVariationApplied, headerRef }: Props) {
  const meta = useSongStore((s) => s.meta);
  const replacePatternChords = useSongStore((s) => s.replacePatternChords);
  const removePatternChordsBatch = useSongStore((s) => s.removePatternChordsBatch);
  const addChordToPattern = useSongStore((s) => s.addChordToPattern);
  const ownerSection = useSongStore((s) =>
    s.sections.find((sec) => sec.id === (pattern.sectionId ?? pattern.id)),
  );
  const sections = useSongStore((s) => s.sections);
  const sectionId = pattern.sectionId ?? pattern.id;
  const sectionLabel = ownerSection ? getSectionDisplayName(sections, sectionId) : "Section";

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingStep, setPlayingStep] = useState<number | null>(null);
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [starFilter, setStarFilter] = useState<1 | 2 | 3 | null>(null);

  const sortedChords = useMemo(
    () => ownerSection ? getPatternChordsViaSSOT(ownerSection, pattern) : [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat),
    [ownerSection, pattern],
  );

  const focusedIndex = useMemo(() => {
    if (!activeChordId) return -1;
    return sortedChords.findIndex((c) => c.id === activeChordId);
  }, [activeChordId, sortedChords]);

  const suggestions: VibeSuggestion[] = useMemo(() => {
    if (!vibe || sortedChords.length < 2) return [];
    const scope = focusedIndex >= 0 ? { chordIndex: focusedIndex } : "whole_chain" as const;
    return generateVibeSuggestions(
      vibe,
      sortedChords.map((c) => c.chord),
      meta.keyRoot,
      meta.keyMode,
      scope,
      sortedChords.map((c) => c.lengthBeats),
    );
  }, [vibe, sortedChords, meta.keyRoot, meta.keyMode, focusedIndex]);

  const shown = starFilter ? suggestions.filter((s) => s.stars === starFilter) : suggestions;

  const stopPreview = () => {
    stopProgression();
    setPlayingId(null);
    setPlayingStep(null);
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

  const playSuggestion = async (s: VibeSuggestion) => {
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
    setPlayingStep(0);
    await playProgression(events, meta.bpm, {
      loopBeats: cursor,
      onChordStart: (idx) => setPlayingStep(idx),
      onEnd: () => {
        setPlayingId((id) => (id === s.id ? null : id));
        setPlayingStep(null);
        onAuditionChange?.(null);
      },
    });
  };

  const commitSuggestion = (s: VibeSuggestion) => {
    const previousChords = sortedChords.map((c) => c.chord);
    const previousDurations = sortedChords.map((c) => c.lengthBeats);
    if (playingId === s.id) stopPreview();

    if (s.kind === "voicing" || !s.countChanged) {
      // Simple replace — voicings and non-count-changing reharms.
      replacePatternChords(pattern.id, s.chords.map((c, i) => withOctave(c, i)));
    } else {
      // Count-changing reharm (espionage, step_between, etc.)
      const ids = sortedChords.map((c) => c.id);
      if (ids.length > 0) removePatternChordsBatch(pattern.id, ids);
      let cursor = 0;
      const durations = s.suggestedDurations ?? s.chords.map(() => 2);
      s.chords.forEach((c, i) => {
        const len = durations[i] ?? 2;
        addChordToPattern(pattern.id, withOctave(c, i), cursor, len);
        cursor += len;
      });
    }

    onVariationApplied?.();

    toast({
      title: `Applied "${s.label}"`,
      description: STAR_MEANING[s.stars],
      action: (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (s.countChanged && s.kind === "reharm") {
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

  const handleClose = () => {
    stopPreview();
    onOpenChange(false);
  };

  const renderCard = (s: VibeSuggestion) => {
    const isPlaying = playingId === s.id;
    return (
      <div
        key={s.id}
        className="rounded-lg p-2.5 space-y-2"
        style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
      >
        {/* Stars + meaning */}
        <div className="flex items-center gap-1.5">
          <Stars n={s.stars} />
          <span className="text-[11px] text-muted-foreground">{STAR_MEANING[s.stars]}</span>
        </div>

        {/* Label */}
        <p className="text-[11px] font-display text-foreground font-semibold truncate">
          {s.label}
        </p>

        {/* Chord chips + action buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {s.chords.map((c, i) => {
            const isPlayhead = isPlaying && i === playingStep;
            return (
              <span
                key={`${s.id}-${i}`}
                className={cn(
                  "rounded transition-shadow",
                  s.changedIndices.includes(i) && "ring-1 ring-primary/60",
                  isPlayhead && "ring-2 ring-primary shadow-[0_0_0_3px_var(--primary-halo)]",
                )}
              >
                <ChordChip chord={c} variant="ink" size="sm" />
              </span>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="icon"
              variant={isPlaying ? "secondary" : "outline"}
              className="h-7 w-7 shrink-0"
              onClick={() => playSuggestion(s)}
              title={isPlaying ? "Stop preview" : "Audition"}
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
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) stopPreview();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl overflow-hidden flex flex-col p-0 [&>button[type=button]]:hidden"
        style={{ background: "var(--paper)", maxHeight: "90vh", height: "90vh" }}
      >
        {/* Header */}
        <div
          ref={headerRef}
          className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 z-10"
          style={{ background: "var(--paper)" }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors hover:bg-accent shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground truncate">
              {sectionLabel} · Block {blockIndex + 1}
            </div>
            <div className="font-display text-lg font-semibold leading-tight">Add Spice</div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="btn-sculpt-amber inline-flex items-center gap-1 rounded-full px-4 h-9 text-sm font-display font-semibold shrink-0"
          >
            Done <span aria-hidden>💪</span>
          </button>
        </div>

        {/* Vibe chips — always shown */}
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {VIBES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => { setVibe(v.id); setStarFilter(null); }}
              className={cn(
                "h-9 px-3 rounded-full text-sm font-display font-semibold inline-flex items-center gap-1.5 transition-colors",
                vibe === v.id ? "btn-sculpt-amber" : "btn-sculpt-cream",
              )}
            >
              <span>{v.emoji}</span>
              <span>{v.label}</span>
            </button>
          ))}
        </div>

        {/* Star filter — only after a vibe is picked */}
        {vibe && suggestions.length > 0 && (
          <div className="px-4 pb-3 flex gap-2">
            {([null, 1, 2, 3] as const).map((n) => (
              <button
                key={String(n)}
                type="button"
                onClick={() => setStarFilter(n)}
                className={cn(
                  "h-7 px-2.5 rounded-full text-xs font-semibold transition-colors",
                  starFilter === n ? "btn-sculpt-amber" : "btn-sculpt-cream",
                )}
              >
                {n === null ? "All" : "★".repeat(n)}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable card list */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
          {focusedIndex >= 0 && vibe && (
            <div className="text-[11px] text-muted-foreground italic">
              Spicing chord {focusedIndex + 1} of {sortedChords.length}.
            </div>
          )}
          {!vibe ? (
            <p className="text-sm text-muted-foreground text-center pt-6">
              Pick a vibe to get started.
            </p>
          ) : shown.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-xs text-muted-foreground text-center">
              No suggestions for this progression right now.
            </div>
          ) : (
            shown.map(renderCard)
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
