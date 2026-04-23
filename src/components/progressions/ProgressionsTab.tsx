import { useEffect, useRef, useState } from "react";
import { useSongStore, getSectionDisplayName, type PatternBlock as PatternBlockType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { SuggestionsPanel } from "@/components/progressions/SuggestionsPanel";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Minus, Trash2, ArrowLeft, ArrowRight, GripVertical, Play, ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { ensureAudio } from "@/lib/music/audio";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";

const LENGTH_STEP = 0.5;
const MIN_LEN = 0.5;

interface PatternProps {
  pattern: PatternBlockType;
  blockIndex: number;
  blocksInSection: number;
  otherPatterns: { id: string; label: string }[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
  onDragChordStart: (fromPatternId: string, chordId: string) => void;
  onDragChordEnd: () => void;
  onDropChordOnPattern: (toPatternId: string, toIndex: number) => void;
  draggingChordId: string | null;
  draggingFromPatternId: string | null;
  onRequestDeleteBlock: (patternId: string) => void;
}

function formatBeats(n: number) {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, "");
}

function PatternBlock({
  pattern, blockIndex, blocksInSection, otherPatterns, onPickerOpen,
  onDragChordStart, onDragChordEnd, onDropChordOnPattern,
  draggingChordId, draggingFromPatternId, onRequestDeleteBlock,
}: PatternProps) {
  const {
    updatePattern, basket, addChordToPattern,
    setPatternChordLength, movePatternChord,
    removePatternChordsBatch, shiftPatternChords, movePatternChordsTo,
    resizePatternChordsWithOverflow,
  } = useSongStore();
  const focusedPatternId = usePlaybackStore((s) => s.focusedPatternId);
  const setFocusedPattern = usePlaybackStore((s) => s.setFocusedPattern);
  const setStartFromChord = usePlaybackStore((s) => s.setStartFromChord);
  const setIsPlayingStore = usePlaybackStore((s) => s.setIsPlaying);
  const setCurrent = usePlaybackStore((s) => s.setCurrent);
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const isFocused = focusedPatternId === pattern.id;
  const playingChordId = isPlaying && playbackCurrent?.patternId === pattern.id ? playbackCurrent.patternChordId : null;

  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  const totalBeats = pattern.bars * pattern.beatsPerBar;
  const sortedChords = [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  const usedBeats = sortedChords.reduce((sum, c) => sum + c.lengthBeats, 0);
  const freeBeats = Math.max(0, totalBeats - usedBeats);
  const selectedIds = Array.from(selected);
  const canDeleteThisBlock = blocksInSection > 1;

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  useEffect(() => {
    if (!activeChord) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (blockRef.current && blockRef.current.contains(t)) return;
      if (t.closest("[data-radix-dialog-content]")) return;
      setActiveChord(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [activeChord]);

  useEffect(() => {
    if (!activeChord) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const c = sortedChords.find((x) => x.id === activeChord);
      if (!c) return;
      const otherSum = sortedChords.reduce((s, x) => s + (x.id === c.id ? 0 : x.lengthBeats), 0);
      const maxLen = totalBeats - otherSum;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (c.lengthBeats + LENGTH_STEP <= maxLen + 1e-9) {
          setPatternChordLength(pattern.id, c.id, c.lengthBeats + LENGTH_STEP);
        }
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        if (c.lengthBeats > MIN_LEN) {
          setPatternChordLength(pattern.id, c.id, c.lengthBeats - LENGTH_STEP);
        }
      } else if (e.key === "Escape") {
        setActiveChord(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeChord, sortedChords, totalBeats, pattern.id, setPatternChordLength]);

  const startPress = (chordId: string) => {
    longFiredRef.current = false;
    pressTimer.current = setTimeout(() => {
      longFiredRef.current = true;
      if (!selectMode) {
        setSelectMode(true);
        setSelected(new Set([chordId]));
        setActiveChord(null);
      } else if (!selected.has(chordId)) {
        // Long-press on an unselected chord adds it.
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(chordId);
          return next;
        });
      }
      // Long-press on an already-selected chord is a no-op (becomes the
      // drag-init gesture; HTML5 dragstart fires off the same pointerdown).
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const handleChordTap = (chordId: string) => {
    if (longFiredRef.current) return;
    setFocusedPattern(pattern.id);
    if (selectMode) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(chordId)) next.delete(chordId); else next.add(chordId);
        return next;
      });
      return;
    }
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === chordId && now - last.t < 350) {
      lastTapRef.current = null;
      const c = sortedChords.find((x) => x.id === chordId);
      if (c) onPickerOpen(pattern.id, c.startBeat, c.id);
      return;
    }
    lastTapRef.current = { id: chordId, t: now };
    setActiveChord(activeChord === chordId ? null : chordId);
  };

  const active = activeChord ? sortedChords.find((c) => c.id === activeChord) ?? null : null;
  const activeMaxLen = active ? totalBeats - (usedBeats - active.lengthBeats) : 0;
  const activeIdx = active ? sortedChords.findIndex((c) => c.id === active.id) : -1;

  return (
    <div
      ref={blockRef}
      className={cn(
        "rounded-lg border bg-card/60 p-3 transition-shadow",
        isFocused ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Block {blockIndex + 1}
        </span>
        {isFocused && (
          <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">▸ play start</span>
        )}
        <span className="text-xs text-muted-foreground">·</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          Bars
          <Input
            type="number"
            min={1}
            max={32}
            value={pattern.bars}
            onChange={(e) => updatePattern(pattern.id, { bars: Math.max(1, Math.min(32, Number(e.target.value) || 1)) })}
            onClick={(e) => e.stopPropagation()}
            className="h-7 w-14 font-mono-chord"
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatBeats(usedBeats)} / {totalBeats} beats
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive disabled:opacity-30"
          onClick={(e) => { e.stopPropagation(); onRequestDeleteBlock(pattern.id); }}
          disabled={!canDeleteThisBlock}
          title={canDeleteThisBlock ? "Delete pattern block" : "Cannot delete the only block in this section"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {selectMode && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/40 bg-card px-3 py-2 shadow-sm flex-wrap text-xs">
          <span className="font-medium">{selectedIds.length} selected</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
            onClick={() => shiftPatternChords(pattern.id, selectedIds, -1)} aria-label="Shift earlier">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
            onClick={() => shiftPatternChords(pattern.id, selectedIds, 1)} aria-label="Shift later">
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground ml-1">Length</span>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={!selectedIds.length}
            onClick={() => resizePatternChordsWithOverflow(pattern.id, selectedIds, -LENGTH_STEP)}
            aria-label="Decrease length" title="Decrease length">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={!selectedIds.length}
            onClick={() => resizePatternChordsWithOverflow(pattern.id, selectedIds, LENGTH_STEP)}
            aria-label="Increase length (overflows to next block)" title="Increase length · overflows to next block">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={!selectedIds.length}
            onClick={() => { removePatternChordsBatch(pattern.id, selectedIds); exitSelect(); }} aria-label="Delete selected">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {otherPatterns.length > 0 && (
            <Select
              value=""
              onValueChange={(toId) => { movePatternChordsTo(pattern.id, toId, selectedIds); exitSelect(); }}
            >
              <SelectTrigger className="h-7 w-[140px] text-xs" disabled={!selectedIds.length}>
                <SelectValue placeholder="Move to…" />
              </SelectTrigger>
              <SelectContent>
                {otherPatterns.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 ml-auto" onClick={exitSelect}>Done</Button>
        </div>
      )}

      <div className="relative">
        <div
          className={cn(
            "relative h-20 rounded-md border border-border bg-muted/30 overflow-hidden flex items-stretch",
            draggingChordId && draggingFromPatternId !== pattern.id && "ring-2 ring-primary/40",
          )}
          onDragOver={(e) => {
            if (!draggingChordId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropIndicator(null);
          }}
          onDrop={(e) => {
            if (!draggingChordId) return;
            e.preventDefault();
            const idx = dropIndicator ?? sortedChords.length;
            setDropIndicator(null);
            onDropChordOnPattern(pattern.id, idx);
          }}
        >
          {Array.from({ length: pattern.bars + 1 }).map((_, i) => (
            <div
              key={`bar-${i}`}
              className="absolute top-0 bottom-0 border-l border-border/70 pointer-events-none"
              style={{ left: `${(i / pattern.bars) * 100}%` }}
            />
          ))}

          {sortedChords.map((c, idx) => {
            const isSel = selected.has(c.id);
            const widthPct = (c.lengthBeats / totalBeats) * 100;
            const isBeingDragged = draggingChordId === c.id;
            return (
              <button
                key={c.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.chord.display);
                  onDragChordStart(pattern.id, c.id);
                }}
                onDragEnd={() => { onDragChordEnd(); setDropIndicator(null); }}
                onDragOver={(e) => {
                  if (!draggingChordId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const half = (e.clientX - rect.left) < rect.width / 2;
                  setDropIndicator(half ? idx : idx + 1);
                }}
                onMouseDown={(e) => { e.stopPropagation(); startPress(c.id); }}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={(e) => { e.stopPropagation(); startPress(c.id); }}
                onTouchEnd={cancelPress}
                onContextMenu={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.stopPropagation(); handleChordTap(c.id); }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onPickerOpen(pattern.id, c.startBeat, c.id);
                }}
                className={cn(
                  "relative my-1 mx-0.5 rounded-md border border-chord-chip/40 bg-chord-chip/50 text-chord-chip-foreground hover:bg-chord-chip/60 flex flex-col items-center justify-center px-1 overflow-hidden select-none transition-colors",
                  !selectMode && activeChord === c.id && "ring-2 ring-primary",
                  selectMode && isSel && "ring-2 ring-primary",
                  isBeingDragged && "opacity-40",
                )}
                style={{ width: `calc(${widthPct}% - 4px)`, minWidth: 32 }}
              >
                {dropIndicator === idx && draggingChordId && (
                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                )}
                {dropIndicator === idx + 1 && draggingChordId && (
                  <span className="absolute right-0 top-0 bottom-0 w-1 bg-primary" />
                )}
                <span className="font-mono-chord font-semibold text-sm leading-tight truncate max-w-full">
                  {c.chord.display}
                </span>
                <span className="font-mono-chord text-[10px] text-chord-chip-foreground/70 leading-tight">
                  {formatBeats(c.lengthBeats)}b
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPickerOpen(pattern.id, usedBeats)}
            onDragOver={(e) => {
              if (!draggingChordId) return;
              e.preventDefault();
              setDropIndicator(sortedChords.length);
            }}
            className="flex-1 min-w-0 my-1 mx-0.5 rounded-md border border-dashed border-border/70 text-[11px] text-muted-foreground hover:bg-accent/40 transition-colors"
            style={{ display: freeBeats > 0 ? "block" : "none" }}
            aria-label="Add chord at end"
          >
            {sortedChords.length === 0 ? "Click to add a chord" : `+ ${formatBeats(freeBeats)}b`}
          </button>
        </div>

        {playingChordId && (() => {
          const playing = sortedChords.find((c) => c.id === playingChordId);
          if (!playing) return null;
          const leftPct = (playing.startBeat / totalBeats) * 100;
          return (
            <div
              aria-hidden
              className="absolute pointer-events-none animate-pulse"
              style={{
                left: `calc(${leftPct}% + 1px)`,
                bottom: "4px",
                height: "86px",
                width: "3px",
              }}
            >
              <span className="absolute left-0 right-0 bottom-0 top-[7px] rounded-sm bg-[hsl(var(--chord-chip))] shadow-[0_0_8px_hsl(var(--chord-chip))]" />
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2"
                style={{
                  width: 0, height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "7px solid hsl(var(--chord-chip))",
                  filter: "drop-shadow(0 0 4px hsl(var(--chord-chip)))",
                }}
              />
            </div>
          );
        })()}

        {!selectMode && active && activeIdx >= 0 && (() => {
          const c = active;
          const canDecrease = c.lengthBeats > MIN_LEN;
          const canIncrease = c.lengthBeats + LENGTH_STEP <= activeMaxLen + 1e-9;
          const leftBeat = sortedChords.slice(0, activeIdx).reduce((s, x) => s + x.lengthBeats, 0);
          const leftPct = (leftBeat / totalBeats) * 100;
          const widthPct = (c.lengthBeats / totalBeats) * 100;
          return (
            <div
              className="absolute top-full mt-1 flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1 shadow-sm z-10"
              style={{ left: `calc(${leftPct}% + ${widthPct / 2}%)`, transform: "translateX(-50%)" }}
            >
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2 text-xs"
                onClick={async () => {
                  await ensureAudio();
                  setStartFromChord(pattern.id, c.id);
                  setActiveChord(null);
                  // Stop any current playback then request a fresh play.
                  setIsPlayingStore(false);
                  setCurrent(null);
                  window.dispatchEvent(new Event("lovable:request-play"));
                }}
                aria-label="Play from here"
                title="Play from here"
              >
                <Play className="h-3.5 w-3.5" /> Play from here
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => movePatternChord(pattern.id, c.id, -1)} aria-label="Move earlier" title="Move earlier">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={!canDecrease}
                onClick={() => setPatternChordLength(pattern.id, c.id, c.lengthBeats - LENGTH_STEP)}
                aria-label="Decrease length" title="Decrease length (-)">
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono-chord text-[10px] text-muted-foreground px-1 min-w-[28px] text-center">
                {formatBeats(c.lengthBeats)}b
              </span>
              <Button size="icon" variant="outline" className="h-7 w-7"
                onClick={() => {
                  if (canIncrease) {
                    setPatternChordLength(pattern.id, c.id, c.lengthBeats + LENGTH_STEP);
                  } else {
                    // No room left — overflow into the next pattern block.
                    resizePatternChordsWithOverflow(pattern.id, [c.id], LENGTH_STEP);
                  }
                }}
                aria-label="Increase length" title={canIncrease ? "Increase length (+)" : "Increase · overflow to next block"}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => movePatternChord(pattern.id, c.id, 1)} aria-label="Move later" title="Move later">
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })()}
      </div>

      <p className="mt-8 text-[10px] uppercase tracking-wide text-muted-foreground">
        Tap to focus · Long-press to multi-select · Double-tap to edit · Drag to reorder · +/- keys adjust length
      </p>

      {basket.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">From basket</p>
          <div className="flex flex-wrap gap-1.5">
            {basket.map((b) => (
              <ChordChip
                key={b.id}
                chord={b.chord}
                size="sm"
                onClick={() => addChordToPattern(pattern.id, b.chord, usedBeats, 2)}
              />
            ))}
          </div>
        </div>
      )}

      <SuggestionsPanel pattern={pattern} />
    </div>
  );
}

interface SectionGroupProps {
  sectionId: string;
  displayName: string;
  blocks: PatternBlockType[];
  totalSections: number;
  allPatterns: PatternBlockType[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
  onDragChordStart: (fromPatternId: string, chordId: string) => void;
  onDragChordEnd: () => void;
  onDropChordOnPattern: (toPatternId: string, toIndex: number) => void;
  draggingChordId: string | null;
  draggingFromPatternId: string | null;
  onSectionDragStart: (id: string) => void;
  onSectionDragOver: (overId: string) => void;
  onSectionDragEnd: () => void;
  isSectionDragOver: boolean;
  onRequestDeleteSection: (sectionId: string) => void;
  onRequestDeleteBlock: (patternId: string) => void;
}

function SectionGroup({
  sectionId, displayName, blocks, totalSections, allPatterns,
  onPickerOpen, onDragChordStart, onDragChordEnd, onDropChordOnPattern,
  draggingChordId, draggingFromPatternId,
  onSectionDragStart, onSectionDragOver, onSectionDragEnd, isSectionDragOver,
  onRequestDeleteSection, onRequestDeleteBlock,
}: SectionGroupProps) {
  const addPatternToSection = useSongStore((s) => s.addPatternToSection);
  const updateSection = useSongStore((s) => s.updateSection);
  const section = useSongStore((s) => s.sections.find((sec) => sec.id === sectionId));
  const collapsed = !!section?.collapsed;
  const cardRef = useRef<HTMLDivElement>(null);
  const canDeleteSection = totalSections > 1;

  return (
    <div
      ref={cardRef}
      className={cn(
        "paper-card rounded-xl px-4 py-4 space-y-3 transition-shadow",
        isSectionDragOver && "ring-2 ring-primary/60",
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-pattern-section-id")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onSectionDragOver(sectionId);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("application/x-pattern-section-id")) {
          e.preventDefault();
          onSectionDragEnd();
        }
      }}
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="font-display text-lg ink-chord font-semibold">{displayName}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {blocks.length} block{blocks.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-pattern-section-id", sectionId);
            if (cardRef.current) {
              const rect = cardRef.current.getBoundingClientRect();
              const clone = cardRef.current.cloneNode(true) as HTMLElement;
              clone.style.position = "absolute";
              clone.style.top = "-10000px";
              clone.style.left = "-10000px";
              clone.style.width = `${rect.width}px`;
              clone.style.pointerEvents = "none";
              clone.style.opacity = "0.9";
              clone.style.transform = "rotate(-1deg)";
              clone.style.boxShadow = "0 12px 32px -8px rgba(0,0,0,0.35)";
              document.body.appendChild(clone);
              try { e.dataTransfer.setDragImage(clone, 24, 24); } catch { /* ignore */ }
              setTimeout(() => { try { document.body.removeChild(clone); } catch { /* ignore */ } }, 0);
            }
            onSectionDragStart(sectionId);
          }}
          onDragEnd={onSectionDragEnd}
          className="ml-auto h-8 w-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder section"
          title="Drag to reorder section"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
          onClick={() => onRequestDeleteSection(sectionId)}
          disabled={!canDeleteSection}
          title="Delete entire section (affects Lyrics tab too)"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Pattern blocks within this section */}
      {blocks.map((p, i) => (
        <PatternBlock
          key={p.id}
          pattern={p}
          blockIndex={i}
          blocksInSection={blocks.length}
          otherPatterns={allPatterns
            .filter((q) => q.id !== p.id)
            .map((q) => ({ id: q.id, label: q.label }))}
          onPickerOpen={onPickerOpen}
          onDragChordStart={onDragChordStart}
          onDragChordEnd={onDragChordEnd}
          onDropChordOnPattern={onDropChordOnPattern}
          draggingChordId={draggingChordId}
          draggingFromPatternId={draggingFromPatternId}
          onRequestDeleteBlock={onRequestDeleteBlock}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => addPatternToSection(sectionId)}
      >
        <Plus className="h-3.5 w-3.5" /> Add pattern block
      </Button>
    </div>
  );
}

export function ProgressionsTab() {
  const {
    progression, sections, addSection, addChordToPattern, updatePatternChord,
    basket, reorderPatternChord, movePatternChordToPatternAt, reorderSection,
    removeSection, removePatternBlock,
    suppressCrossTabDeleteWarning, setSuppressCrossTabDeleteWarning,
  } = useSongStore();
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);
  const [drag, setDrag] = useState<{ fromPatternId: string; chordId: string } | null>(null);
  const [sectionDrag, setSectionDrag] = useState<{ id: string; overId?: string } | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);

  // Group pattern blocks by sectionId, preserving section order from `sections`.
  const groupedSections = sections.map((sec) => ({
    section: sec,
    blocks: progression.filter((p) => (p.sectionId ?? p.id) === sec.id),
  })).filter((g) => g.blocks.length > 0);

  useEffect(() => {
    if (basket.length > 0 && picker) setPicker(null);
  }, [basket.length, picker]);

  const openPicker = (patternId: string, atBeat: number, replaceChordId?: string) => {
    if (basket.length > 0) return;
    setPicker({ patternId, atBeat, replaceChordId });
  };

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    if (picker.replaceChordId) {
      updatePatternChord(picker.patternId, picker.replaceChordId, { chord });
    } else {
      addChordToPattern(picker.patternId, chord, picker.atBeat, 2);
    }
  };

  const handleDropChord = (toPatternId: string, toIndex: number) => {
    if (!drag) return;
    if (drag.fromPatternId === toPatternId) {
      reorderPatternChord(toPatternId, drag.chordId, toIndex);
    } else {
      movePatternChordToPatternAt(drag.fromPatternId, toPatternId, drag.chordId, toIndex);
    }
    setDrag(null);
  };

  const requestDeleteSection = (sectionId: string) => {
    if (suppressCrossTabDeleteWarning) {
      removeSection(sectionId);
    } else {
      setConfirmDeleteSection(sectionId);
    }
  };

  const requestDeleteBlock = (patternId: string) => {
    setConfirmDeleteBlock(patternId);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Each section can hold multiple pattern blocks. Adding a chord here also drops it into the matching section in the Lyrics tab.
      </p>

      {groupedSections.map(({ section, blocks }) => (
        <SectionGroup
          key={section.id}
          sectionId={section.id}
          displayName={getSectionDisplayName(sections, section.id)}
          blocks={blocks}
          totalSections={sections.length}
          allPatterns={progression}
          onPickerOpen={openPicker}
          onDragChordStart={(fromPatternId, chordId) => setDrag({ fromPatternId, chordId })}
          onDragChordEnd={() => setDrag(null)}
          onDropChordOnPattern={handleDropChord}
          draggingChordId={drag?.chordId ?? null}
          draggingFromPatternId={drag?.fromPatternId ?? null}
          onSectionDragStart={(id) => setSectionDrag({ id })}
          onSectionDragOver={(overId) => {
            setSectionDrag((prev) => (prev && prev.overId !== overId ? { ...prev, overId } : prev));
          }}
          onSectionDragEnd={() => {
            const sd = sectionDrag;
            if (sd && sd.overId && sd.overId !== sd.id) {
              const targetIdx = sections.findIndex((x) => x.id === sd.overId);
              if (targetIdx >= 0) reorderSection(sd.id, targetIdx);
            }
            setSectionDrag(null);
          }}
          isSectionDragOver={sectionDrag?.overId === section.id && sectionDrag?.id !== section.id}
          onRequestDeleteSection={requestDeleteSection}
          onRequestDeleteBlock={requestDeleteBlock}
        />
      ))}

      <Button variant="outline" onClick={() => addSection("custom")}>
        <Plus className="h-4 w-4" /> Add new section
      </Button>

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={handlePick}
      />

      <ConfirmDeleteDialog
        open={!!confirmDeleteSection}
        onOpenChange={(o) => { if (!o) setConfirmDeleteSection(null); }}
        title="Delete entire section?"
        description="This removes the section from BOTH the Progression and Lyrics tabs, including all chord pattern blocks and lyric lines inside it."
        confirmLabel="Delete section"
        showSuppressOption
        onConfirm={(suppress) => {
          const id = confirmDeleteSection;
          setConfirmDeleteSection(null);
          if (suppress) setSuppressCrossTabDeleteWarning(true);
          if (id) removeSection(id);
        }}
      />

      <ConfirmDeleteDialog
        open={!!confirmDeleteBlock}
        onOpenChange={(o) => { if (!o) setConfirmDeleteBlock(null); }}
        title="Delete this pattern block?"
        description="This removes only this pattern block. The section and its lyric lines stay intact. Any chord anchors in lyrics that mirrored this block will be detached."
        confirmLabel="Delete block"
        onConfirm={() => {
          const id = confirmDeleteBlock;
          setConfirmDeleteBlock(null);
          if (id) removePatternBlock(id);
        }}
      />
    </div>
  );
}
