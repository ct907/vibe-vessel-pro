import { useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSongStore, getSectionDisplayName, getPatternChordsViaSSOT, type PatternBlock } from "@/store/song";
import { generateSpiceSuggestions, type SpiceSuggestion, type SpiceCategory } from "@/lib/music/spice";
import { ensureAudio, playProgression, stopProgression, type ScheduledChord } from "@/lib/music/audio";
import { ChordChip } from "@/components/chord/ChordChip";
import { VoiceLeadingOverlay } from "@/components/progressions/VoiceLeadingOverlay";
import { Play, Square, Check, Activity, X } from "lucide-react";
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
}

const CATEGORY_ORDER: SpiceCategory[] = [
  "cinematic", "espionage", "cosmic_drift", "gateway",
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
};

export function SpiceSheet({ open, onOpenChange, pattern, blockIndex, activeChordId, onAuditionChange }: Props) {
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
  const [filter, setFilter] = useState<SpiceCategory | "all">("all");
  const [overlayOpenIds, setOverlayOpenIds] = useState<Set<string>>(new Set());

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

  const presentCategories = CATEGORY_ORDER.filter((c) => grouped.has(c));

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
    return 4;
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

  const toggleOverlay = (id: string) => {
    setOverlayOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleClose = () => {
    stopPreview();
    onOpenChange(false);
  };

  const visibleCategories = filter === "all" ? presentCategories : presentCategories.filter((c) => c === filter);

  const originalChords = sortedChords.map((c) => c.chord);

  const renderCard = (s: SpiceSuggestion) => {
    const isPlaying = playingId === s.id;
    const overlayOpen = overlayOpenIds.has(s.id);
    return (
      <div
        key={s.id}
        className="rounded-lg p-2.5 space-y-2"
        style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-display text-foreground truncate">
              {s.theoryLabel}
              {s.frictionDelta !== 0 && (
                <span className="text-muted-foreground ml-2 text-[10px]">
                  · friction {s.frictionDelta > 0 ? "+" : ""}{s.frictionDelta.toFixed(1)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleOverlay(s.id)}
            className={cn(
              "inline-flex items-center justify-center rounded-md h-7 w-7 shrink-0 transition-colors",
              overlayOpen ? "btn-sculpt-amber" : "btn-sculpt-cream",
            )}
            title="Toggle voice-leading overlay"
            aria-label="Toggle voice-leading overlay"
          >
            <Activity className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
          <div className="ml-auto flex items-center gap-1.5">
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
        </div>
        <VoiceLeadingOverlay
          originalChords={originalChords}
          spicedChords={s.chords as ChordSymbol[]}
          isVisible={overlayOpen}
        />
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

        {/* Filter chips */}
        {presentCategories.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-display font-semibold transition-colors",
                filter === "all" ? "btn-sculpt-amber" : "btn-sculpt-cream",
              )}
            >
              All
            </button>
            {presentCategories.map((cat) => {
              const first = grouped.get(cat)![0];
              const active = filter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={cn(
                    "h-8 px-3 rounded-full text-xs font-display font-semibold inline-flex items-center gap-1 transition-colors",
                    active ? "btn-sculpt-amber" : "btn-sculpt-cream",
                  )}
                >
                  <span>{CATEGORY_EMOJI[cat]}</span>
                  <span>{first.emotiveLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          {focusedIndex >= 0 && (
            <div className="text-[11px] text-muted-foreground italic">
              Spicing chord {focusedIndex + 1} of {sortedChords.length}.
            </div>
          )}
          {suggestions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-xs text-muted-foreground text-center">
              No spice ideas for this progression right now.
            </div>
          ) : (
            visibleCategories.map((cat) => {
              const items = grouped.get(cat)!;
              const first = items[0];
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-baseline gap-2 px-0.5">
                    <span className="text-sm font-display font-semibold">
                      {CATEGORY_EMOJI[cat]} {first.emotiveLabel}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map(renderCard)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
