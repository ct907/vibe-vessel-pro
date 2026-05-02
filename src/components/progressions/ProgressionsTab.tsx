import { useEffect, useRef, useState } from "react";
import { Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useDndStore } from "@/store/dnd";
import { useBasketSelectionStore } from "@/store/basket-selection";
import { useSongStore, getSectionDisplayName, getPatternChordsViaSSOT, type PatternBlock as PatternBlockType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { SuggestionsPanel } from "@/components/progressions/SuggestionsPanel";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Play,
  Pencil,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ensureAudio, playChord } from "@/lib/music/audio";
import { ChordSymbol } from "@/lib/music/chords";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { cn } from "@/lib/utils";
import { SECTION_COLOR_KEYS, sectionTintStyle } from "@/components/section/SectionColorPicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
}: PatternProps) {
  const {
    updatePattern,
    basket,
    addChordToPattern,
    addChordToPatternSlot,
    setPatternChordLength,
    movePatternChord,
    removePatternChordsBatch,
    shiftPatternChords,
    movePatternChordsTo,
    resizePatternChordsWithOverflow,
    movePatternChordToSlot,
    movePatternChordsToSlot,
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

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const lastSelectedRef = useRef<string | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const justDraggedAtRef = useRef<number>(0);

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
  const usedBeats = sortedChords.reduce((sum, c) => sum + c.lengthBeats, 0);
  const freeBeats = Math.max(0, totalBeats - usedBeats);
  const selectedIds = Array.from(selected);
  const canDeleteThisBlock = totalBlocksInSong > 1;

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    lastSelectedRef.current = null;
  };

  // Outside-tap closes the select-mode context menu.
  useEffect(() => {
    if (!selectMode) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-basket-chip],[data-droppable-id="basket-source"]')) return;
      if (blockRef.current && blockRef.current.contains(t)) return;
      if (t.closest("[data-radix-dialog-content]")) return;
      if (t.closest("[data-progression-ctx]")) return;
      exitSelect();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [selectMode]);

  // Keyboard shortcuts while in select mode.
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          const willEmptyBlock = selectedIds.length >= sortedChords.length;
          removePatternChordsBatch(pattern.id, selectedIds);
          setSelected(new Set());
          if (willEmptyBlock) exitSelect();
          return;
        }
      }
      if (selectedIds.length === 1) {
        const c = sortedChords.find((x) => x.id === selectedIds[0]);
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
        }
      }
      if (e.key === "Escape") {
        exitSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectMode,
    selectedIds,
    sortedChords,
    totalBeats,
    pattern.id,
    setPatternChordLength,
    removePatternChordsBatch,
  ]);

  const handleChordTap = (chordId: string, e?: React.MouseEvent) => {
    if (Date.now() - justDraggedAtRef.current < 350) return;
    setFocusedPattern(pattern.id);
    // Shift-click: range select.
    if (e && e.shiftKey) {
      const ids = sortedChords.map((c) => c.id);
      const i2 = ids.indexOf(chordId);
      const anchor = lastSelectedRef.current;
      const i1 = anchor ? ids.indexOf(anchor) : i2;
      const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];
      const range = ids.slice(from, to + 1);
      setSelectMode(true);
      setSelected((prev) => {
        const next = new Set(prev);
        range.forEach((id) => next.add(id));
        return next;
      });
      lastSelectedRef.current = chordId;
      return;
    }
    // Ctrl/Cmd-click toggles selection.
    if (e && (e.metaKey || e.ctrlKey)) {
      setSelectMode(true);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(chordId)) next.delete(chordId);
        else next.add(chordId);
        return next;
      });
      lastSelectedRef.current = chordId;
      return;
    }
    // Edit Mode (pencil): tap toggles selection only — no audition, no editor.
    if (selectMode) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(chordId)) next.delete(chordId);
        else next.add(chordId);
        return next;
      });
      lastSelectedRef.current = chordId;
      return;
    }
    // Composition mode: audition + open FocusedChordEditor (mirrors Lyrics tab).
    const c = sortedChords.find((x) => x.id === chordId);
    if (c) void playChord(c.chord);
    onEditChordOpen(pattern.id, chordId);
  };

  // The "active" chord is the single-selection case. Multi-selection hides
  // per-chord controls and uses batch operations instead.
  const active = selectedIds.length === 1
    ? (sortedChords.find((c) => c.id === selectedIds[0]) ?? null)
    : null;
  const activeMaxLen = active ? totalBeats - (usedBeats - active.lengthBeats) : 0;
  const activeIdx = active ? sortedChords.findIndex((c) => c.id === active.id) : -1;

  return (
    <div
      ref={blockRef}
      data-pattern-block={pattern.id}
      className={cn(
        "rounded-lg border shadow-primary/40 p-3 transition-shadow",
        isFocused ? "border-primary ring-2 ring-primary/40" : "border-border",
        selectMode && !isFocused && "ring-2 ring-primary/40",
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
          <BarsInput
            value={pattern.bars}
            onCommit={(n) => updatePattern(pattern.id, { bars: Math.max(1, Math.min(32, n)) })}
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatBeats(usedBeats)} / {totalBeats} beats
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 ml-auto text-muted-foreground hover:text-foreground",
            selectMode && "text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (selectMode) {
              exitSelect();
            } else {
              setSelectMode(true);
              setSelected(new Set());
            }
          }}
          aria-label={selectMode ? "Exit edit mode" : "Edit chords in this block"}
          aria-pressed={selectMode}
          title={selectMode ? "Exit edit mode" : "Edit chords"}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
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
          // One slot per beat — slot count is bars * beatsPerBar.
          const slotCount = Math.max(1, pattern.bars * pattern.beatsPerBar);
          const beatsPerSlot = 1;
          // Walk left-to-right. Each chord visually occupies its lengthBeats (in slot units),
          // anchoring at integer slot positions. Sub-slot lengths shrink the chord chip.
          type Cell =
            | { kind: "start"; chord: typeof sortedChords[number]; span: number; visualSpan: number; slotIdx: number }
            | { kind: "tail" }
            | { kind: "empty" };
          const cells: Cell[] = Array.from({ length: slotCount }, () => ({ kind: "empty" }));
          let cursor = 0;
          for (const c of sortedChords) {
            if (cursor >= slotCount) break;
            const slotsConsumed = Math.max(1, Math.ceil(c.lengthBeats / beatsPerSlot));
            const fitSpan = Math.min(slotsConsumed, slotCount - cursor);
            cells[cursor] = {
              kind: "start",
              chord: c,
              span: fitSpan,
              visualSpan: Math.min(c.lengthBeats, fitSpan),
              slotIdx: cursor,
            };
            for (let k = 1; k < fitSpan; k++) cells[cursor + k] = { kind: "tail" };
            cursor += fitSpan;
          }
          return (
            <div className="relative h-20 rounded-md border border-border bg-muted/30 overflow-hidden flex items-stretch w-full">
              {/* Bar separators */}
              {Array.from({ length: pattern.bars + 1 }).map((_, i) => (
                <div
                  key={`bar-${i}`}
                  className="absolute top-0 bottom-0 border-l border-border/70 pointer-events-none z-0"
                  style={{ left: `${(i / pattern.bars) * 100}%` }}
                />
              ))}
              {/* Beat dividers (subdivide each bar by beatsPerBar) */}
              {Array.from({ length: pattern.bars * pattern.beatsPerBar }).map((_, i) => {
                if (i % pattern.beatsPerBar === 0) return null;
                return (
                  <div
                    key={`beat-${i}`}
                    className="absolute top-2 bottom-2 border-l border-muted-foreground/20 pointer-events-none z-0"
                    style={{ left: `${(i / (pattern.bars * pattern.beatsPerBar)) * 100}%` }}
                  />
                );
              })}

              {cells.map((cell, slotIdx) => {
                if (cell.kind === "tail") return null;
                const occupied = cell.kind === "start";
                const c = occupied ? cell.chord : undefined;
                const span = occupied ? cell.span : 1;
                const visualSpan = occupied ? cell.visualSpan : 1;
                const isSel = c ? selected.has(c.id) : false;
                return (
                  <Droppable
                    key={`pslot-${slotIdx}`}
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
                        style={{ flex: `${span} ${span} 0%` }}
                        onClick={(e) => {
                          if (occupied) return;
                          e.stopPropagation();
                          onPickerOpen(pattern.id, slotIdx);
                        }}
                        data-pattern-slot={slotIdx}
                      >
                        {occupied && c && (
                          <Draggable draggableId={c.id} index={0} isDragDisabled={selectMode}>
                            {(dragProvided, dragSnapshot) => {
                              if (dragSnapshot.isDragging) { justDraggedAtRef.current = Date.now(); }
                              const widthPct = Math.max(0, Math.min(1, visualSpan / span)) * 100;
                              const colors = getChordColorClasses(c.chord);
                              return (
                                <button
                                  type="button"
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  onContextMenu={(e) => e.preventDefault()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleChordTap(c.id, e);
                                  }}
                                  }}
                                  className={cn(
                                    "relative my-1 ml-0.5 rounded-md border border-black/10 flex flex-col items-center justify-center px-1 overflow-hidden select-none transition-all hover:opacity-90",
                                    colors.className,
                                    selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                                    isSel && "ring-2 ring-primary ring-offset-2 ring-offset-card scale-[1.04]",
                                    dragSnapshot.isDragging && "ring-2 ring-primary shadow-lg",
                                  )}
                                  style={{
                                    ...colors.style,
                                    width: `calc(${widthPct}% - 4px)`,
                                    touchAction: "none",
                                    ...dragProvided.draggableProps.style,
                                  }}
                                >
                                  <span className="font-mono-chord font-semibold text-sm leading-tight truncate max-w-full">
                                    {c.chord.display}
                                  </span>
                                  <span className="font-mono-chord text-[10px] opacity-70 leading-tight">
                                    {formatBeats(c.lengthBeats)}b
                                  </span>
                                </button>
                              );
                            }}
                          </Draggable>
                        )}
                        {dropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}
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

      {/* Unified chord context menu — appears below the pattern block (#7).
          Shown either when chords are multi-selected OR when a single chord is
          tapped (active). Multi-select reveals shift/length/move/delete; single
          chord adds Play-from-here and per-chord length controls. */}
      {(() => {
        // Unified menu: visible whenever Edit / Select Mode is on. The
        // controls adapt to selection size (0, 1, or many).
        if (!selectMode) return null;
        const showSingle = selectedIds.length === 1 && !!active && activeIdx >= 0;
        const showMulti = selectedIds.length > 1;
        const hasSel = selectedIds.length > 0;
        const c = active;
        const canDecrease = c ? c.lengthBeats > MIN_LEN : false;
        const canIncrease = c ? c.lengthBeats + LENGTH_STEP <= activeMaxLen + 1e-9 : false;
        return (
          <div
            data-progression-ctx
            className="mb-2 mt-2 flex flex-col gap-3 rounded-md border border-primary/40 bg-card px-3 py-2 shadow-sm text-xs max-w-[400px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
           {/* Row 1: label + Play from here + Move-to (multi) */}
           <div className="flex items-center gap-2 flex-wrap">
            {showSingle ? (
              <span className="font-medium font-mono-chord">{c?.chord.display}</span>
            ) : (
              <span className="font-medium">{selectedIds.length} selected</span>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setSelected(new Set(sortedChords.map((x) => x.id)));
              }}
              disabled={sortedChords.length === 0 || selectedIds.length === sortedChords.length}
            >
              Select all
            </Button>

            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              disabled={!hasSel}
              onClick={async () => {
                await ensureAudio();
                const chordId = selectedIds[0];
                if (!chordId) return;
                setStartFromChord(pattern.id, chordId);
                setIsPlayingStore(false);
                setCurrent(null);
                window.dispatchEvent(new Event("lovable:request-play"));
              }}
              aria-label="Play from here"
              title="Play from here"
            >
              <Play className="h-3.5 w-3.5" /> Play from here
            </Button>

            {hasSel && otherPatterns.length > 0 && (
              <Select
                value=""
                onValueChange={(toId) => {
                  movePatternChordsTo(pattern.id, toId, selectedIds);
                  exitSelect();
                }}
              >
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue placeholder="Move to…" />
                </SelectTrigger>
                <SelectContent>
                  {otherPatterns.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
           </div>

           {/* Row 2: Length controls + Delete */}
           <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Length</span>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={!hasSel || (showSingle && !canDecrease)}
              onClick={() => {
                if (showSingle && c) {
                  if (canDecrease) setPatternChordLength(pattern.id, c.id, c.lengthBeats - LENGTH_STEP);
                } else {
                  resizePatternChordsWithOverflow(pattern.id, selectedIds, -LENGTH_STEP);
                }
              }}
              aria-label="Decrease length"
              title="Decrease length"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={!hasSel}
              onClick={() => {
                if (showSingle && c) {
                  setPatternChordLength(pattern.id, c.id, c.lengthBeats + LENGTH_STEP);
                } else {
                  resizePatternChordsWithOverflow(pattern.id, selectedIds, LENGTH_STEP);
                }
              }}
              aria-label="Increase length"
              title="Increase · overflows to next block"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive ml-auto"
              disabled={!hasSel}
              onClick={() => {
                if (selectedIds.length === 0) return;
                const willEmptyBlock = selectedIds.length >= sortedChords.length;
                removePatternChordsBatch(pattern.id, selectedIds);
                setSelected(new Set());
                if (willEmptyBlock) exitSelect();
              }}
              aria-label="Delete"
              title="Delete (Del)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
           </div>

           {/* Row 3: move arrows + Done */}
           <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!hasSel}
              onClick={() => {
                if (showSingle) movePatternChord(pattern.id, active!.id, -1);
                else shiftPatternChords(pattern.id, selectedIds, -1);
              }}
              aria-label="Move earlier"
              title="Move earlier"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!hasSel}
              onClick={() => {
                if (showSingle) movePatternChord(pattern.id, active!.id, 1);
                else shiftPatternChords(pattern.id, selectedIds, 1);
              }}
              aria-label="Move later"
              title="Move later"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 ml-auto"
              onClick={exitSelect}
            >
              Done
            </Button>
           </div>
          </div>
        );
      })()}

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
  index: number;
  allPatterns: PatternBlockType[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
  onRequestDeleteSection: (sectionId: string) => void;
  onRequestDeleteBlock: (patternId: string) => void;
  onEditChordOpen: (patternId: string, chordId: string) => void;
  /** When true: hide block counter & delete; show up/down reorder arrows. */
  sortMode?: boolean;
  onMoveSection?: (id: string, direction: -1 | 1) => void;
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
}: SectionGroupProps) {
  const addPatternToSection = useSongStore((s) => s.addPatternToSection);
  const updateSection = useSongStore((s) => s.updateSection);
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
        <span className="font-display text-lg ink-chord font-semibold">{displayName}</span>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                  Color
                </DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <div className="grid grid-cols-8 gap-1">
                    {SECTION_COLOR_KEYS.map((c) => {
                      const isActive = section?.color === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSectionColor(sectionId, isActive ? null : c)}
                          aria-label={`Section color ${c}`}
                          title={c}
                          className={cn(
                            "h-7 w-7 rounded border border-border transition-transform",
                            isActive && "ring-2 ring-primary scale-110",
                          )}
                          style={{ backgroundColor: `color-mix(in oklch, var(--section-tint-${c}) 50%, transparent)` }}
                        />
                      );
                    })}
                  </div>
                  {section?.color && (
                    <button
                      type="button"
                      onClick={() => setSectionColor(sectionId, null)}
                      className="mt-2 w-full text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Clear color
                    </button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
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
        )}
      </div>

      {/* Pattern blocks within this section */}
      {!collapsed &&
        blocks.map((p, i) => {
          // "Move to…" should reach EVERY other pattern block in the song,
          // not just siblings within this section. Build the option list from
          // allPatterns, labelled by section name + block index.
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
            />
          );
        })}

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
    movePatternChordToPatternAt,
    moveSection,
    removeSection,
    removePatternBlock,
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
    setAllSectionsCollapsed,
  } = useSongStore();
  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);
  const [chordEditor, setChordEditor] = useState<{ patternId: string; chordId: string; sectionId: string } | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);

  const openChordEditor = (patternId: string, chordId: string) => {
    const pat = progression.find((p) => p.id === patternId);
    if (!pat) return;
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
    const toId = dst[1];
    const toSlot = Number(dst[2]);
    if (!toId || Number.isNaN(toSlot)) return;

    const state = useSongStore.getState();
    const toPattern = state.progression.find((p) => p.id === toId);
    if (!toPattern) return;
    const toCap = toPattern.bars * toPattern.beatsPerBar;
    const toUsed = toPattern.chords.reduce((s, c) => s + c.lengthBeats, 0);
    const toFree = Math.max(0, toCap - toUsed);

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

    const src = source.droppableId.split(":");
    if (src[0] !== "pattern") return;
    const fromId = src[1];
    if (!fromId) return;
    if (fromId === toId) {
      state.movePatternChordToSlot(toId, draggableId, toSlot);
      return;
    }

    // Cross-block (and possibly cross-section): validate capacity for the
    // chord(s) being moved. movePatternChordToPatternAt now handles both
    // intra- and cross-section moves.
    const fromPattern = state.progression.find((p) => p.id === fromId);
    if (!fromPattern) return;
    const movingIds = [draggableId];
    const movingLen = fromPattern.chords
      .filter((c) => movingIds.includes(c.id))
      .reduce((s, c) => s + c.lengthBeats, 0);
    if (movingLen > toFree + 1e-9) {
      toast({
        title: movingIds.length > 1 ? "Not enough space" : "Chord doesn't fit",
        description:
          movingIds.length > 1
            ? "The selected chords don't fit in the target pattern block."
            : "This chord is too long for the target pattern block's free space.",
        variant: "destructive",
      });
      return;
    }
    state.movePatternChordToPatternAt(fromId, toId, draggableId, toSlot);
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
        />
      ))}

      <div className="flex flex-col gap-2 pt-4 border-t border-muted-foreground/40">
        <span className="text-sm font-bold text-center text-muted-foreground">Add Section</span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {(["verse", "chorus", "bridge", "intro"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              onClick={() => addSection(t)}
              className="capitalize border border-muted-foreground/40"
            >
              <Plus className="h-3.5 w-3.5" /> {t}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => addSection("custom")}
            className="border border-muted-foreground/40"
          >
            <Plus className="h-3.5 w-3.5" /> Custom…
          </Button>
        </div>
      </div>

      <ChordPickerSheet open={!!picker} onOpenChange={(o) => !o && setPicker(null)} onPick={handlePick} />

      {chordEditor && (
        <FocusedChordEditor
          mode="progression"
          sectionId={chordEditor.sectionId}
          patternId={chordEditor.patternId}
          chordId={chordEditor.chordId}
          onClose={() => setChordEditor(null)}
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
