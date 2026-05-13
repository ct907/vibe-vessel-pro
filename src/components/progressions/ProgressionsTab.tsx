import { useEffect, useRef, useState } from "react";
import { Droppable, type DropResult } from "@hello-pangea/dnd";
import { useDndStore } from "@/store/dnd";
import { useBasketSelectionStore } from "@/store/basket-selection";
import { useSongStore, getSectionDisplayName, getPatternChordsViaSSOT, type PatternBlock as PatternBlockType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { SuggestionsPanel } from "@/components/progressions/SuggestionsPanel";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Minus,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Copy,
  MoreVertical,
  CheckSquare,
  ListChecks,
} from "lucide-react";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";
import { sectionTintStyle, SectionColorPicker } from "@/components/section/SectionColorPicker";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

const LENGTH_STEP = 0.5;
const MIN_LEN = 0.5;

/** Bars number input that allows the field to be temporarily empty while typing. */
function BarsInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setDraft(raw);
        if (raw === "") return;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 1) onCommit(n);
      }}
      onBlur={() => {
        const n = Number(draft);
        if (!draft || !Number.isFinite(n) || n < 1) {
          setDraft("1");
          onCommit(1);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-7 w-14 font-mono-chord"
    />
  );
}

interface PatternProps {
  pattern: PatternBlockType;
  blockIndex: number;
  blocksInSection: number;
  otherPatterns: { id: string; label: string }[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
  onRequestDeleteBlock: (patternId: string) => void;
  /** Open the FocusedChordEditor to replace a chord's family. */
  onEditChordOpen: (patternId: string, chordId: string) => void;
  /** Tab-level active chord id — shared across all blocks. */
  activeChordId: string | null;
  onSetActiveChordId: (id: string | null) => void;
}

function formatBeats(n: number) {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, "");
}

function PatternBlock({
  pattern,
  blockIndex,
  blocksInSection,
  otherPatterns,
  onPickerOpen,
  onRequestDeleteBlock,
  onEditChordOpen,
  activeChordId,
  onSetActiveChordId,
}: PatternProps) {
  const {
    updatePattern,
    movePatternChord,
    removePatternChordsBatch,
    setPatternChordLength,
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

  const blockRef = useRef<HTMLDivElement>(null);
  const justDraggedAtRef = useRef<number>(0);
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDidFireRef = useRef(false);

  // Multi-select state for this block.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Stable refs so the keyboard handler always reads the freshest values.
  const activeChordIdRef = useRef<string | null>(null);
  const activeIdxRef = useRef<number>(-1);

  const totalBeats = pattern.bars * pattern.beatsPerBar;
  // Phase 3 SSOT: order this pattern's chords via the section's SectionChord projection.
  const ownerSection = useSongStore((s) =>
    s.sections.find((sec) => sec.id === (pattern.sectionId ?? pattern.id)),
  );
  // Total pattern blocks across the entire song — used to decide whether
  // *any* pattern block is allowed to be deleted (we only forbid deleting
  // the very last remaining block in the whole song).
  const totalBlocksInSong = useSongStore((s) => s.progression.length);
  const sortedChords = ownerSection
    ? getPatternChordsViaSSOT(ownerSection, pattern)
    : [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  const sortedChordsRef = useRef(sortedChords);
  const movePatternChordRef = useRef(movePatternChord);
  const setPatternChordLengthRef = useRef(setPatternChordLength);
  const resizePatternChordsWithOverflowRef = useRef(resizePatternChordsWithOverflow);
  const activeChordInThisBlockRef = useRef<typeof sortedChords[number] | null>(null);
  const usedBeats = sortedChords.reduce((sum, c) => sum + c.lengthBeats, 0);
  const freeBeats = Math.max(0, totalBeats - usedBeats);
  const canDeleteThisBlock = totalBlocksInSong > 1;

  const activeChordInThisBlock = activeChordId
    ? sortedChords.find((c) => c.id === activeChordId) ?? null
    : null;
  const activeIdx = activeChordInThisBlock
    ? sortedChords.findIndex((c) => c.id === activeChordId)
    : -1;

  // Keep refs current on every render.
  activeChordInThisBlockRef.current = activeChordInThisBlock;
  activeChordIdRef.current = activeChordId;
  activeIdxRef.current = activeIdx;
  sortedChordsRef.current = sortedChords;
  movePatternChordRef.current = movePatternChord;
  setPatternChordLengthRef.current = setPatternChordLength;
  resizePatternChordsWithOverflowRef.current = resizePatternChordsWithOverflow;

  const toggleSelectChord = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllChords = () =>
    setSelectedIds(new Set(sortedChords.map((c) => c.id)));

  // Keyboard: while a chord in this block is active, ← / → reorders;
  // ↑ / ↓ changes bar length; Esc closes the context menu.
  useEffect(() => {
    if (!activeChordInThisBlock) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeChordInThisBlockRef.current) return;
      const id = activeChordIdRef.current;
      if (!id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onSetActiveChordId(null);
        setSelectedIds(new Set());
        setMultiSelectMode(false);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeIdxRef.current > 0) movePatternChordRef.current(pattern.id, id, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeIdxRef.current < sortedChordsRef.current.length - 1)
          movePatternChordRef.current(pattern.id, id, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        resizePatternChordsWithOverflowRef.current(pattern.id, [id], LENGTH_STEP);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const chord = activeChordInThisBlockRef.current;
        setPatternChordLengthRef.current(
          pattern.id,
          id,
          Math.max(MIN_LEN, chord.lengthBeats - LENGTH_STEP),
        );
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeChordInThisBlock?.id, pattern.id]);

  // Reset multi-select state when the context menu closes.
  useEffect(() => {
    if (!activeChordInThisBlock) {
      setSelectedIds(new Set());
      setMultiSelectMode(false);
    }
  }, [!!activeChordInThisBlock]);

  return (
    <div
      ref={blockRef}
      data-pattern-block={pattern.id}
      className={cn(
        "rounded-lg p-3 transition-shadow",
        isFocused ? "ring-2" : "",
      )}
      style={{
        background: "var(--paper-card)",
        boxShadow: isFocused
          ? "var(--shadow-sculpt-cream-rest), 0 0 0 2px var(--primary-strong)"
          : "var(--shadow-card)",
      }}
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
          <BarsInput
            value={pattern.bars}
            onCommit={(n) => updatePattern(pattern.id, { bars: Math.max(1, Math.min(32, n)) })}
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatBeats(usedBeats)} / {totalBeats} beats
        </span>
        {/* Per-block pencil removed — section pencil in SectionGroup
            header now toggles edit mode for every block in the section. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive disabled:opacity-30"
          onClick={(e) => {
            e.stopPropagation();
            onRequestDeleteBlock(pattern.id);
          }}
          disabled={!canDeleteThisBlock}
          title={canDeleteThisBlock ? "Delete pattern block" : "Cannot delete the last remaining block in the song"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar moved below the pattern grid (#7). */}

      <div className="relative">
        {(() => {
          const slotCount = Math.max(1, pattern.bars * pattern.beatsPerBar);
          // Build a flush flex track: chord items take basis = lengthBeats,
          // followed by 1-beat empty droppable slots filling the remaining
          // beats. A fractional spacer keeps empty slots aligned to beat lines.
          type Item =
            | { kind: "chord"; chord: typeof sortedChords[number]; basis: number; slotIdx: number }
            | { kind: "spacer"; basis: number }
            | { kind: "empty"; basis: number; slotIdx: number };
          const items: Item[] = [];
          let cursor = 0;
          for (const c of sortedChords) {
            const remaining = slotCount - cursor;
            if (remaining <= 0) break;
            const basis = Math.min(c.lengthBeats, remaining);
            items.push({ kind: "chord", chord: c, basis, slotIdx: Math.floor(cursor) });
            cursor += basis;
          }
          // Align next empty slot to integer beat boundary.
          const nextBeat = Math.ceil(cursor - 1e-6);
          if (nextBeat > cursor + 1e-6) {
            items.push({ kind: "spacer", basis: nextBeat - cursor });
            cursor = nextBeat;
          }
          for (let i = nextBeat; i < slotCount; i++) {
            items.push({ kind: "empty", basis: 1, slotIdx: i });
          }
          return (
            <div
              className="relative rounded-md flex items-stretch w-full"
              style={{ background: "var(--paper-shade)", boxShadow: "var(--shadow-recess)", minHeight: 80, paddingTop: 8, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, gap: 3 }}
            >
              {/* Bar separators */}
              {Array.from({ length: pattern.bars + 1 }).map((_, i) => (
                <div
                  key={`bar-${i}`}
                  className="absolute top-0 bottom-0 pointer-events-none z-0"
                  style={{ left: `${(i / pattern.bars) * 100}%`, borderLeft: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}
                />
              ))}
              {/* Beat dividers */}
              {Array.from({ length: pattern.bars * pattern.beatsPerBar }).map((_, i) => {
                if (i % pattern.beatsPerBar === 0) return null;
                return (
                  <div
                    key={`beat-${i}`}
                    className="absolute top-2 bottom-2 pointer-events-none z-0"
                    style={{ left: `${(i / (pattern.bars * pattern.beatsPerBar)) * 100}%`, borderLeft: "1px solid color-mix(in oklch, var(--cocoa-deep) 8%, transparent)" }}
                  />
                );
              })}

              {items.map((item, itemIdx) => {
                if (item.kind === "spacer") {
                  return (
                    <div
                      key={`spacer-${itemIdx}`}
                      className="pointer-events-none"
                      style={{ flex: `${item.basis} ${item.basis} 0%` }}
                    />
                  );
                }
                const occupied = item.kind === "chord";
                const c = occupied ? item.chord : undefined;
                const slotIdx = item.slotIdx;
                const basis = item.basis;
                return (
                  <Droppable
                    key={`pslot-${itemIdx}`}
                    droppableId={`pattern:${pattern.id}:${slotIdx}`}
                    direction="horizontal"
                    type="chord"
                  >
                    {(dropProvided, dropSnapshot) => (
                      <div
                        ref={dropProvided.innerRef}
                        {...dropProvided.droppableProps}
                        className={cn(
                          "relative min-w-0 flex items-stretch z-10",
                          !occupied && "border border-dashed border-transparent justify-center",
                          dropSnapshot.isDraggingOver && "bg-accent/40 ring-1 ring-primary/50 rounded-sm",
                        )}
                        style={{ flex: `${basis} ${basis} 0%` }}
                        onClick={(e) => {
                          if (occupied) return;
                          e.stopPropagation();
                          onPickerOpen(pattern.id, slotIdx);
                        }}
                        data-pattern-slot={slotIdx}
                      >
                        {occupied && c && (() => {
                          const colors = getChordColorClasses(c.chord);
                          const isActive = activeChordId === c.id;
                          const isSelected = selectedIds.has(c.id);
                          return (
                            <div className="relative flex items-stretch w-full">
                              <div
                                data-pattern-chord={c.id}
                                role="button"
                                tabIndex={0}
                                onPointerDown={(e) => {
                                  if (Date.now() - justDraggedAtRef.current < 350) return;
                                  longPressDidFireRef.current = false;
                                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                                  longPressTimerRef.current = setTimeout(() => {
                                    longPressTimerRef.current = null;
                                    longPressDidFireRef.current = true;
                                    if (singleClickTimerRef.current) {
                                      clearTimeout(singleClickTimerRef.current);
                                      singleClickTimerRef.current = null;
                                    }
                                    onSetActiveChordId(null);
                                    onEditChordOpen(pattern.id, c.id);
                                  }, 500);
                                }}
                                onPointerUp={() => {
                                  if (longPressTimerRef.current) {
                                    clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                  }
                                }}
                                onPointerLeave={() => {
                                  if (longPressTimerRef.current) {
                                    clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                  }
                                }}
                                onPointerCancel={() => {
                                  if (longPressTimerRef.current) {
                                    clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  if (singleClickTimerRef.current) { clearTimeout(singleClickTimerRef.current); singleClickTimerRef.current = null; }
                                  if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                                  onSetActiveChordId(null);
                                  onEditChordOpen(pattern.id, c.id);
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (singleClickTimerRef.current) { clearTimeout(singleClickTimerRef.current); singleClickTimerRef.current = null; }
                                  if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                                  onSetActiveChordId(null);
                                  onEditChordOpen(pattern.id, c.id);
                                }}
                                onClick={(e) => {
                                  if (Date.now() - justDraggedAtRef.current < 350) return;
                                  if (longPressDidFireRef.current) { longPressDidFireRef.current = false; return; }
                                  e.stopPropagation();
                                  if (singleClickTimerRef.current) { clearTimeout(singleClickTimerRef.current); singleClickTimerRef.current = null; }
                                  singleClickTimerRef.current = setTimeout(() => {
                                    singleClickTimerRef.current = null;
                                    setFocusedPattern(pattern.id);
                                    void playChord(c.chord, undefined, c.chord.octave ?? 4);
                                    if (multiSelectMode) {
                                      toggleSelectChord(c.id);
                                    } else {
                                      onSetActiveChordId(activeChordId === c.id ? null : c.id);
                                    }
                                  }, 250);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void playChord(c.chord, undefined, c.chord.octave ?? 4);
                                    onSetActiveChordId(c.id);
                                  }
                                }}
                                className={cn(
                                  "rounded-md border border-black/10 flex flex-col items-center justify-center px-1 overflow-hidden select-none transition-colors hover:opacity-90 cursor-pointer w-full",
                                  colors.className,
                                  isActive && "ring-2 ring-primary ring-offset-2 ring-offset-card scale-[1.02]",
                                  isSelected && !isActive && "ring-2 ring-[var(--primary-strong)] ring-offset-1 ring-offset-card",
                                )}
                                style={{
                                  ...colors.style,
                                  touchAction: "none",
                                }}
                              >
                                <span className="font-mono-chord font-semibold text-sm leading-tight truncate max-w-full">
                                  {c.chord.display}
                                </span>
                                <span className="font-mono-chord text-[10px] opacity-70 leading-tight">
                                  {formatBeats(c.lengthBeats)}b
                                </span>
                              </div>
                              {isActive && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 z-20 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedIds.size > 1 && selectedIds.has(c.id)) {
                                      removePatternChordsBatch(pattern.id, Array.from(selectedIds));
                                      setSelectedIds(new Set());
                                    } else {
                                      removePatternChordsBatch(pattern.id, [c.id]);
                                      setSelectedIds((prev) => {
                                        const n = new Set(prev);
                                        n.delete(c.id);
                                        return n;
                                      });
                                    }
                                    onSetActiveChordId(null);
                                  }}
                                  aria-label="Delete chord"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                        {dropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}

              {/* Item 4 — left/right edge drop strips: dropping a chord onto
                  these appends to the previous / next block when capacity
                  allows. The actual neighbor lookup happens in onDragEnd. */}
              <Droppable
                droppableId={`pattern:${pattern.id}:edge-left`}
                direction="horizontal"
                type="chord"
              >
                {(p, snap) => (
                  <div
                    ref={p.innerRef}
                    {...p.droppableProps}
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-3 z-20",
                      snap.isDraggingOver && "bg-primary/30 ring-1 ring-primary/60",
                    )}
                  >
                    {p.placeholder}
                  </div>
                )}
              </Droppable>
              <Droppable
                droppableId={`pattern:${pattern.id}:edge-right`}
                direction="horizontal"
                type="chord"
              >
                {(p, snap) => (
                  <div
                    ref={p.innerRef}
                    {...p.droppableProps}
                    className={cn(
                      "absolute right-0 top-0 bottom-0 w-3 z-20",
                      snap.isDraggingOver && "bg-primary/30 ring-1 ring-primary/60",
                    )}
                  >
                    {p.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })()}

        {playingChordId &&
          (() => {
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
                <span className="absolute left-0 right-0 bottom-0 top-[7px] rounded-sm bg-[var(--chord-chip)] shadow-[0_0_8px_var(--chord-chip)]" />
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "7px solid var(--chord-chip)",
                    filter: "drop-shadow(0 0 4px var(--chord-chip))",
                  }}
                />
              </div>
            );
          })()}
      </div>

      {/* Floating chord toolbar — reorder, bar-length, multi-select. */}
      {activeChordInThisBlock && (
        <div className="mt-2 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-lg border bg-popover shadow-md px-2 py-1.5 flex-wrap">
            {/* ← → reorder */}
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              disabled={activeIdx <= 0 || selectedIds.size > 1}
              onClick={(e) => {
                e.stopPropagation();
                movePatternChord(pattern.id, activeChordId!, -1);
              }}
              aria-label="Move chord earlier"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="px-1 text-base font-mono-chord text-muted-foreground">
              {activeChordInThisBlock.chord.display}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              disabled={activeIdx >= sortedChords.length - 1 || selectedIds.size > 1}
              onClick={(e) => {
                e.stopPropagation();
                movePatternChord(pattern.id, activeChordId!, 1);
              }}
              aria-label="Move chord later"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>

            <div className="w-px h-6 bg-border mx-0.5" />

            {/* Bar-length −½ / display / +½ */}
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={(e) => {
                e.stopPropagation();
                resizePatternChordsWithOverflow(
                  pattern.id,
                  selectedIds.size > 0 ? Array.from(selectedIds) : [activeChordId!],
                  -LENGTH_STEP,
                );
              }}
              aria-label="Decrease bar length by half"
              title="-½ bar"
            >
              <Minus className="h-5 w-5" />
            </Button>
            <span className="px-0.5 text-sm font-mono-chord text-muted-foreground select-none">
              {formatBeats(activeChordInThisBlock.lengthBeats)}b
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={(e) => {
                e.stopPropagation();
                resizePatternChordsWithOverflow(
                  pattern.id,
                  selectedIds.size > 0 ? Array.from(selectedIds) : [activeChordId!],
                  LENGTH_STEP,
                );
              }}
              aria-label="Increase bar length by half"
              title="+½ bar"
            >
              <Plus className="h-5 w-5" />
            </Button>

            <div className="w-px h-6 bg-border mx-0.5" />

            {/* Multi-select toggle */}
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-9 w-9",
                multiSelectMode && "bg-[var(--ink-soft)] text-[var(--paper-card)] hover:bg-[var(--ink-soft)] hover:text-[var(--paper-card)]",
              )}
              onClick={(e) => {
                e.stopPropagation();
                const entering = !multiSelectMode;
                setMultiSelectMode(entering);
                if (entering) toggleSelectChord(activeChordId!);
                else setSelectedIds(new Set());
              }}
              aria-label="Toggle multi-select"
              title="Multi-select"
            >
              <CheckSquare className="h-5 w-5" />
            </Button>
            {selectedIds.size > 0 && (
              <span className="text-sm font-mono-chord text-muted-foreground px-0.5 select-none">
                {selectedIds.size}
              </span>
            )}
            {selectedIds.size > 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIds(new Set());
                  setMultiSelectMode(false);
                  onSetActiveChordId(null);
                }}
                aria-label="Clear selection"
                title="Clear selection"
              >
                <X className="h-5 w-5" />
              </Button>
            )}

            {/* Select all in this block */}
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={(e) => {
                e.stopPropagation();
                selectAllChords();
              }}
              aria-label="Select all chords in block"
              title="Select all"
            >
              <ListChecks className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Per-block "From basket" tap-to-add panel removed: when the basket
          has chips the global BasketBar is visible and lets the user drag
          chords directly onto any pattern slot, so duplicating that as a
          tap-list inside every block was redundant noise. */}

      <SuggestionsPanel pattern={pattern} />
    </div>
  );
}

interface SectionGroupProps {
  sectionId: string;
  displayName: string;
  blocks: PatternBlockType[];
  totalSections: number;
  index: number;
  allPatterns: PatternBlockType[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
  onRequestDeleteSection: (sectionId: string) => void;
  onRequestDeleteBlock: (patternId: string) => void;
  onEditChordOpen: (patternId: string, chordId: string) => void;
  /** When true: hide block counter & delete; show up/down reorder arrows. */
  sortMode?: boolean;
  onMoveSection?: (id: string, direction: -1 | 1) => void;
  activeChordId: string | null;
  onSetActiveChordId: (id: string | null) => void;
}

function SectionGroup({
  sectionId,
  displayName,
  blocks,
  totalSections,
  index,
  allPatterns,
  onPickerOpen,
  onRequestDeleteSection,
  onRequestDeleteBlock,
  onEditChordOpen,
  sortMode,
  onMoveSection,
  activeChordId,
  onSetActiveChordId,
}: SectionGroupProps) {
  const addPatternToSection = useSongStore((s) => s.addPatternToSection);
  const updateSection = useSongStore((s) => s.updateSection);
  const duplicateSection = useSongStore((s) => s.duplicateSection);
  const setSectionColor = useSongStore((s) => s.setSectionColor);
  const section = useSongStore((s) => s.sections.find((sec) => sec.id === sectionId));
  const allSections = useSongStore((s) => s.sections);
  const collapsed = !!section?.collapsed;
  const cardRef = useRef<HTMLDivElement>(null);
  const canDeleteSection = totalSections > 1;

  return (
    <div
      ref={cardRef}
      data-section-id={sectionId}
      style={sectionTintStyle(section?.color)}
      className={cn("rounded-xl px-2 py-4 space-y-3 transition-shadow")}
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        {!sortMode && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 -ml-1 text-muted-foreground"
            onClick={() => updateSection(sectionId, { collapsed: !collapsed })}
            aria-label={collapsed ? "Expand section" : "Collapse section"}
            title={collapsed ? "Expand section" : "Collapse section"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
        <span
          style={{
            padding: "5px 12px",
            borderRadius: "var(--pill-radius, 8px)",
            background: "var(--pill-rest-bg)",
            color: "var(--pill-rest-fg)",
            fontFamily: "'Nunito', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            display: "inline-block",
          }}
        >
          {displayName}
        </span>
        {!sortMode && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
          </span>
        )}
        {sortMode ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onMoveSection?.(sectionId, -1)}
              disabled={index === 0}
              aria-label="Move section up"
              title="Move section up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onMoveSection?.(sectionId, 1)}
              disabled={index >= totalSections - 1}
              aria-label="Move section down"
              title="Move section down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1">
            <SectionColorPicker
              value={section?.color}
              onChange={(c) => setSectionColor(sectionId, c)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => duplicateSection(sectionId)}>
                  <Copy className="h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onRequestDeleteSection(sectionId)}
                  disabled={!canDeleteSection}
                >
                  <Trash2 className="h-4 w-4" /> Delete section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Pattern blocks within this section. Pattern-block reordering is
          intentionally NOT exposed: the lyrics tab's chord row order is
          driven by the same SSOT, and re-arranging blocks here would
          desync the two surfaces. Blocks are now plain children. */}
      {!collapsed && (
        <div className="space-y-3">
          {blocks.map((p, i) => {
            const otherAll = allPatterns
              .filter((q) => q.id !== p.id)
              .map((q) => {
                const sid = q.sectionId ?? q.id;
                const sameSectionBlocks = allPatterns.filter(
                  (b) => (b.sectionId ?? b.id) === sid,
                );
                const blockNum = sameSectionBlocks.findIndex((b) => b.id === q.id) + 1;
                const sectionName = getSectionDisplayName(allSections, sid);
                return {
                  id: q.id,
                  label: `${sectionName}: Block ${blockNum}`,
                };
              });
            return (
              <PatternBlock
                key={p.id}
                pattern={p}
                blockIndex={i}
                blocksInSection={blocks.length}
                otherPatterns={otherAll}
                onPickerOpen={onPickerOpen}
                onRequestDeleteBlock={onRequestDeleteBlock}
                onEditChordOpen={onEditChordOpen}
                activeChordId={activeChordId}
                onSetActiveChordId={onSetActiveChordId}
              />
            );
          })}
        </div>
      )}

      {!collapsed && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => addPatternToSection(sectionId)}>
          <Plus className="h-3.5 w-3.5" /> Add pattern block
        </Button>
      )}
    </div>
  );
}

interface ProgressionsTabProps {
  sortMode?: boolean;
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions") => void;
}

/** Tiny helper that registers the progressions onDragEnd handler with the
 *  global DnD store. Lives inside ProgressionsTab so it has the right closure. */
function ProgressionsDndRegistrar({ onDragEnd }: { onDragEnd: (r: DropResult) => void }) {
  const ref = useRef(onDragEnd);
  ref.current = onDragEnd;
  const setProgressionsHandlers = useDndStore((s) => s.setProgressionsHandlers);
  useEffect(() => {
    setProgressionsHandlers((r) => ref.current(r));
    return () => setProgressionsHandlers(null);
  }, [setProgressionsHandlers]);
  return null;
}

export function ProgressionsTab({ sortMode = false, onSwitchTab: _onSwitchTab }: ProgressionsTabProps) {
  const {
    progression,
    sections,
    addSection,
    updatePatternChord,
    basket,
    moveSection,
    removeSection,
    removePatternBlock,
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
    setAllSectionsCollapsed,
  } = useSongStore();
  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);
  const [activeChordId, setActiveChordId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);
  const [chordEditor, setChordEditor] = useState<{ patternId: string; chordId: string; sectionId: string } | null>(null);
  const [patternAddSlot, setPatternAddSlot] = useState<{ patternId: string; atBeat: number; sectionId: string } | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);

  const isMobile = useIsMobile();

  const openChordEditor = (patternId: string, chordId: string) => {
    const pat = progression.find((p) => p.id === patternId);
    if (!pat) return;
    if (!isMobile) {
      // Desktop: use ChordPickerSheet to replace the chord family in place,
      // matching the picker UX used by empty slots.
      const idx = pat.chords.findIndex((c) => c.id === chordId);
      const atBeat = idx >= 0 ? idx : 0;
      setPicker({ patternId, atBeat, replaceChordId: chordId });
      return;
    }
    setChordEditor({ patternId, chordId, sectionId: pat.sectionId ?? pat.id });
  };

  // Group pattern blocks by sectionId, preserving section order from `sections`.
  const groupedSections = sections
    .map((sec) => ({
      section: sec,
      blocks: progression.filter((p) => (p.sectionId ?? p.id) === sec.id),
    }))
    .filter((g) => g.blocks.length > 0);

  useEffect(() => {
    if (basket.length > 0 && picker) setPicker(null);
  }, [basket.length, picker]);

  const openPicker = (patternId: string, atBeat: number, replaceChordId?: string) => {
    if (basket.length > 0) return;
    if (isMobile && !replaceChordId) {
      const pat = progression.find((p) => p.id === patternId);
      if (pat) {
        setPatternAddSlot({ patternId, atBeat, sectionId: pat.sectionId ?? pat.id });
        return;
      }
    }
    setPicker({ patternId, atBeat, replaceChordId });
  };

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    if (picker.replaceChordId) {
      updatePatternChord(picker.patternId, picker.replaceChordId, { chord });
    } else {
      // picker.atBeat is reused as a slot index by the new slot grid.
      useSongStore.getState().addChordToPatternSlot(picker.patternId, chord, picker.atBeat);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    const dst = destination.droppableId.split(":");

    if (dst[0] !== "pattern") return;
    let toId = dst[1];
    let toSlot = Number(dst[2]);

    // Item 4 — edge drop strips: redirect to the previous/next pattern block.
    const state = useSongStore.getState();
    if (dst[2] === "edge-left" || dst[2] === "edge-right") {
      const idx = state.progression.findIndex((p) => p.id === toId);
      if (idx < 0) return;
      const neighborIdx = dst[2] === "edge-left" ? idx - 1 : idx + 1;
      const neighbor = state.progression[neighborIdx];
      if (!neighbor) {
        toast({ title: "No adjacent block", description: "There's no neighboring pattern block to move into.", variant: "destructive" });
        return;
      }
      toId = neighbor.id;
      const neighborUsed = neighbor.chords.reduce((s, c) => s + c.lengthBeats, 0);
      // Append at the next free slot in the neighbor (rounded down to a beat).
      toSlot = Math.floor(neighborUsed);
    }

    if (!toId || Number.isNaN(toSlot)) return;

    // Basket → pattern block: COPY chord(s) at the target slot. Original
    // chips stay in basket so the user can drop the same chord multiple
    // times. If the dragged chip is part of a multi-selection, every
    // selected chord is appended sequentially starting at the drop slot.
    if (draggableId.startsWith("basket:")) {
      const basketItemId = draggableId.slice("basket:".length);
      const { resolveDragIds, clear: clearBasketSelection } =
        useBasketSelectionStore.getState();
      const ids = resolveDragIds(basketItemId);
      const ordered = state.basket.filter((b) => ids.includes(b.id));
      ordered.forEach((b, i) =>
        state.addChordToPatternSlot(toId, b.chord, toSlot + i),
      );
      clearBasketSelection();
      return;
    }

  };

  const requestDeleteSection = (sectionId: string) => {
    if (suppressCrossTabDeleteWarning) {
      removeSection(sectionId);
    } else {
      // Defer so the DropdownMenu's close event doesn't immediately dismiss the AlertDialog.
      setTimeout(() => setConfirmDeleteSection(sectionId), 0);
    }
  };

  const requestDeleteBlock = (patternId: string) => {
    setConfirmDeleteBlock(patternId);
  };

  return (
    <div className="space-y-4" onClick={() => setActiveChordId(null)}>
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground flex-1">
          Each section can hold multiple pattern blocks. Adding a chord here also drops it into the matching section in
          the Lyrics tab.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAllSectionsCollapsed(!allCollapsed)}
          aria-label={allCollapsed ? "Expand all sections" : "Collapse all sections"}
          title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
          disabled={sortMode}
        >
          {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
          <span className="hidden sm:inline">{allCollapsed ? "Expand all" : "Collapse all"}</span>
        </Button>
      </div>

      {/* Register tab-level drag-end handler with the global DnD store.
          The single <DragDropContext> in Index.tsx routes drops here based
          on droppableId prefix. */}
      <ProgressionsDndRegistrar onDragEnd={onDragEnd} />

      {groupedSections.map(({ section, blocks }, i) => (
        <SectionGroup
          key={section.id}
          sectionId={section.id}
          displayName={getSectionDisplayName(sections, section.id)}
          blocks={blocks}
          totalSections={sections.length}
          index={i}
          allPatterns={progression}
          onPickerOpen={openPicker}
          onRequestDeleteSection={requestDeleteSection}
          onRequestDeleteBlock={requestDeleteBlock}
          onEditChordOpen={openChordEditor}
          sortMode={sortMode}
          onMoveSection={(id, direction) => moveSection(id, direction)}
          activeChordId={activeChordId}
          onSetActiveChordId={setActiveChordId}
        />
      ))}

      <div
        className="flex flex-col gap-3 px-4 pt-4 mt-2 rounded-t-xl"
        style={{
          background: "var(--ink-soft)",
          borderTop: "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
          paddingBottom: "60rem",
        }}
      >
        <span
          className="text-center"
          style={{
            fontFamily: "var(--font-ui, 'Nunito', sans-serif)",
            fontWeight: 700,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-soft)",
          }}
        >
          Add Section
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {(["verse", "chorus", "bridge", "intro"] as const).map((t) => (
            <button
              key={t}
              onClick={() => addSection(t)}
              className="btn-sculpt-cocoa inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold capitalize"
            >
              <Plus className="h-3.5 w-3.5" /> {t}
            </button>
          ))}
          <button
            onClick={() => addSection("custom")}
            className="btn-sculpt-cocoa inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Custom…
          </button>
        </div>
      </div>

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={handlePick}
        initialChord={(() => {
          if (!picker?.replaceChordId) return undefined;
          const pat = progression.find((p) => p.id === picker.patternId);
          return pat?.chords.find((c) => c.id === picker.replaceChordId)?.chord;
        })()}
        onOctaveChange={(oct) => {
          if (!picker?.replaceChordId) return;
          const pat = progression.find((p) => p.id === picker.patternId);
          const cur = pat?.chords.find((c) => c.id === picker.replaceChordId)?.chord;
          if (!cur) return;
          updatePatternChord(picker.patternId, picker.replaceChordId, { chord: { ...cur, octave: oct } });
        }}
      />

      {chordEditor && (
        <FocusedChordEditor
          mode="progression"
          sectionId={chordEditor.sectionId}
          patternId={chordEditor.patternId}
          chordId={chordEditor.chordId}
          onClose={() => setChordEditor(null)}
        />
      )}

      {patternAddSlot && (
        <FocusedChordEditor
          mode="progression-add"
          sectionId={patternAddSlot.sectionId}
          patternId={patternAddSlot.patternId}
          atBeat={patternAddSlot.atBeat}
          onClose={() => setPatternAddSlot(null)}
        />
      )}

      <ConfirmDeleteDialog
        open={!!confirmDeleteSection}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteSection(null);
        }}
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
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteBlock(null);
        }}
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
