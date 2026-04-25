import { useEffect, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useSongStore, getSectionDisplayName, type PatternBlock as PatternBlockType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
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
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ensureAudio, playChord } from "@/lib/music/audio";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";
import { SECTION_COLOR_KEYS, sectionTintStyle } from "@/components/section/SectionColorPicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { BasketBar } from "@/components/basket/BasketBar";

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
}: PatternProps) {
  const {
    updatePattern,
    basket,
    addChordToPattern,
    setPatternChordLength,
    movePatternChord,
    removePatternChordsBatch,
    shiftPatternChords,
    movePatternChordsTo,
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

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);


  const totalBeats = pattern.bars * pattern.beatsPerBar;
  const sortedChords = [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  const usedBeats = sortedChords.reduce((sum, c) => sum + c.lengthBeats, 0);
  const freeBeats = Math.max(0, totalBeats - usedBeats);
  const selectedIds = Array.from(selected);
  const canDeleteThisBlock = blocksInSection > 1;

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // (#8) Auto-close context menu when nothing is selected.
  useEffect(() => {
    if (selectMode && selected.size === 0) setSelectMode(false);
  }, [selectMode, selected]);

  // Outside-tap closes the select-mode context menu.
  useEffect(() => {
    if (!selectMode) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      
      if (blockRef.current && blockRef.current.contains(t)) return;
      if (t.closest("[data-radix-dialog-content]")) return;
      if (t.closest("[data-progression-ctx]")) return;
      exitSelect();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [selectMode]);

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
    if (!activeChord && !selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // (#6) Delete / Backspace removes active chord or all selected chords.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectMode && selectedIds.length > 0) {
          e.preventDefault();
          removePatternChordsBatch(pattern.id, selectedIds);
          exitSelect();
          return;
        }
        if (activeChord) {
          e.preventDefault();
          removePatternChordsBatch(pattern.id, [activeChord]);
          setActiveChord(null);
          return;
        }
      }
      if (!activeChord) return;
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
  }, [
    activeChord,
    selectMode,
    selectedIds,
    sortedChords,
    totalBeats,
    pattern.id,
    setPatternChordLength,
    removePatternChordsBatch,
  ]);

  const startPress = (chordId: string) => {
    longFiredRef.current = false;
    pressTimer.current = setTimeout(() => {
      longFiredRef.current = true;
      if (!selectMode) {
        setSelectMode(true);
        setSelected(new Set([chordId]));
        setActiveChord(null);
      } else if (!selected.has(chordId)) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(chordId);
          return next;
        });
      }
      lastSelectedRef.current = chordId;
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const handleChordTap = (chordId: string, e?: React.MouseEvent) => {
    if (longFiredRef.current) return;
    setFocusedPattern(pattern.id);
    // Shift-click: range/multi select.
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
    // (#5) Tap to focus a chord also auditions it.
    const c = sortedChords.find((x) => x.id === chordId);
    if (c) void playChord(c.chord);
  };

  const active = activeChord ? (sortedChords.find((c) => c.id === activeChord) ?? null) : null;
  const activeMaxLen = active ? totalBeats - (usedBeats - active.lengthBeats) : 0;
  const activeIdx = active ? sortedChords.findIndex((c) => c.id === active.id) : -1;

  return (
    <div
      ref={blockRef}
      data-pattern-block={pattern.id}
      className={cn(
        "rounded-lg border shadow-primary/40 p-3 transition-shadow",
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
          className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive disabled:opacity-30"
          onClick={(e) => {
            e.stopPropagation();
            onRequestDeleteBlock(pattern.id);
          }}
          disabled={!canDeleteThisBlock}
          title={canDeleteThisBlock ? "Delete pattern block" : "Cannot delete the only block in this section"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar moved below the pattern grid (#7). */}

      <div className="relative">
        <Droppable droppableId={`pattern:${pattern.id}`} direction="horizontal" type="pattern-chord">
          {(dropProvided, dropSnapshot) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className={cn(
                "relative h-20 rounded-md border border-border bg-muted/30 overflow-hidden flex items-stretch w-full",
                dropSnapshot.isDraggingOver && "ring-2 ring-primary/40",
              )}
            >
              {Array.from({ length: pattern.bars + 1 }).map((_, i) => (
                <div
                  key={`bar-${i}`}
                  className="absolute top-0 bottom-0 border-l border-border/70 pointer-events-none z-0"
                  style={{ left: `${(i / pattern.bars) * 100}%` }}
                />
              ))}

              {sortedChords.map((c, idx) => {
                const isSel = selected.has(c.id);
                return (
                  <Draggable key={c.id} draggableId={c.id} index={idx}>
                    {(dragProvided, dragSnapshot) => {
                      if (dragSnapshot.isDragging) cancelPress();
                      return (
                      <button
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        onMouseDown={(e) => {
                          dragProvided.dragHandleProps?.onMouseDown?.(e);
                          startPress(c.id);
                        }}
                        onMouseUp={cancelPress}
                        onMouseMove={cancelPress}
                        onMouseLeave={cancelPress}
                        onTouchStart={(e) => {
                          dragProvided.dragHandleProps?.onTouchStart?.(e);
                          startPress(c.id);
                        }}
                        onTouchMove={cancelPress}
                        onTouchEnd={cancelPress}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChordTap(c.id, e);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onPickerOpen(pattern.id, c.startBeat, c.id);
                        }}
                        className={cn(
                          "relative my-1 mx-0.5 rounded-md border border-chord-chip/40 bg-chord-chip/50 text-chord-chip-foreground hover:bg-chord-chip/60 flex flex-col items-center justify-center px-1 overflow-hidden select-none transition-colors z-10",
                          !selectMode && activeChord === c.id && "ring-2 ring-primary",
                          selectMode && isSel && "ring-2 ring-primary",
                          dragSnapshot.isDragging && "ring-2 ring-primary shadow-lg",
                        )}
                        style={{
                          flexGrow: c.lengthBeats,
                          flexShrink: c.lengthBeats,
                          flexBasis: 0,
                          minWidth: 32,
                          touchAction: "none",
                          ...dragProvided.draggableProps.style,
                        }}
                      >
                        <span className="font-mono-chord font-semibold text-sm leading-tight truncate max-w-full">
                          {c.chord.display}
                        </span>
                        <span className="font-mono-chord text-[10px] text-chord-chip-foreground/70 leading-tight">
                          {formatBeats(c.lengthBeats)} beats
                        </span>
                      </button>
                      );
                    }}
                  </Draggable>
                );
              })}
              {dropProvided.placeholder}

              {freeBeats > 0 && (
                <button
                  type="button"
                  onClick={() => onPickerOpen(pattern.id, usedBeats)}
                  className="my-1 mx-0.5 rounded-md border border-dashed border-border/70 text-[11px] text-muted-foreground hover:bg-accent/40 transition-colors z-10"
                  style={{ flexGrow: freeBeats, flexShrink: freeBeats, flexBasis: 0, minWidth: 32 }}
                  aria-label="Add chord at end"
                >
                  {sortedChords.length === 0 ? "Click to add a chord" : `+ ${formatBeats(freeBeats)}b`}
                </button>
              )}
            </div>
          )}
        </Droppable>

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
                <span className="absolute left-0 right-0 bottom-0 top-[7px] rounded-sm bg-[hsl(var(--chord-chip))] shadow-[0_0_8px_hsl(var(--chord-chip))]" />
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "7px solid hsl(var(--chord-chip))",
                    filter: "drop-shadow(0 0 4px hsl(var(--chord-chip)))",
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
        const showMulti = selectMode && selectedIds.length > 0;
        const showSingle = !selectMode && !!active && activeIdx >= 0;
        if (!showMulti && !showSingle) return null;
        const c = active;
        const canDecrease = c ? c.lengthBeats > MIN_LEN : false;
        const canIncrease = c ? c.lengthBeats + LENGTH_STEP <= activeMaxLen + 1e-9 : false;
        return (
          <div
            data-progression-ctx
            className="mb-2 mt-2 flex flex-col gap-2 rounded-md border border-primary/40 bg-card px-3 py-2 shadow-sm text-xs max-w-[400px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
           <div className="flex items-center gap-2 flex-wrap">
            {showMulti ? (
              <span className="font-medium">{selectedIds.length} selected</span>
            ) : (
              <span className="font-medium font-mono-chord">{c?.chord.display}</span>
            )}

            {/* Play from here — uses the active chord, or first selected chord. */}
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              onClick={async () => {
                await ensureAudio();
                const chordId = showSingle ? active!.id : selectedIds[0];
                setStartFromChord(pattern.id, chordId);
                setActiveChord(null);
                setIsPlayingStore(false);
                setCurrent(null);
                window.dispatchEvent(new Event("lovable:request-play"));
              }}
              aria-label="Play from here"
              title="Play from here"
            >
              <Play className="h-3.5 w-3.5" /> Play from here
            </Button>

            <span className="text-[10px] text-muted-foreground ml-1">Length</span>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={showSingle && !canDecrease}
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
            {showSingle && c && (
              <span className="font-mono-chord text-[10px] text-muted-foreground px-1 min-w-[28px] text-center">
                {formatBeats(c.lengthBeats)} beats
              </span>
            )}
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => {
                if (showSingle && c) {
                  if (canIncrease) setPatternChordLength(pattern.id, c.id, c.lengthBeats + LENGTH_STEP);
                  else resizePatternChordsWithOverflow(pattern.id, [c.id], LENGTH_STEP);
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
              className="h-7 w-7 text-destructive"
              onClick={() => {
                if (showSingle && c) {
                  removePatternChordsBatch(pattern.id, [c.id]);
                  setActiveChord(null);
                } else {
                  removePatternChordsBatch(pattern.id, selectedIds);
                  exitSelect();
                }
              }}
              aria-label="Delete"
              title="Delete (Del)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            {showMulti && otherPatterns.length > 0 && (
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

           {/* Row 2: move arrows + Done */}
           <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
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
              onClick={() => {
                setActiveChord(null);
                exitSelect();
              }}
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
  sortMode,
  onMoveSection,
}: SectionGroupProps) {
  const addPatternToSection = useSongStore((s) => s.addPatternToSection);
  const updateSection = useSongStore((s) => s.updateSection);
  const setSectionColor = useSongStore((s) => s.setSectionColor);
  const section = useSongStore((s) => s.sections.find((sec) => sec.id === sectionId));
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
                          style={{ backgroundColor: `hsl(var(--section-tint-${c}) / 0.5)` }}
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
        blocks.map((p, i) => (
          <PatternBlock
            key={p.id}
            pattern={p}
            blockIndex={i}
            blocksInSection={blocks.length}
            otherPatterns={allPatterns.filter((q) => q.id !== p.id).map((q) => ({ id: q.id, label: q.label }))}
            onPickerOpen={onPickerOpen}
            onRequestDeleteBlock={onRequestDeleteBlock}
          />
        ))}

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

export function ProgressionsTab({ sortMode = false, onSwitchTab }: ProgressionsTabProps) {
  const {
    progression,
    sections,
    addSection,
    addChordToPattern,
    updatePatternChord,
    basket,
    removeFromBasket,
    reorderPatternChord,
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
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);

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
      addChordToPattern(picker.patternId, chord, picker.atBeat, 2);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    const toId = destination.droppableId.startsWith("pattern:")
      ? destination.droppableId.slice("pattern:".length)
      : null;
    if (!toId) return;

    // Basket → pattern block: append at end (same length default as basket-tap), then remove from basket.
    if (draggableId.startsWith("basket:")) {
      const basketItemId = draggableId.slice("basket:".length);
      const item = useSongStore.getState().basket.find((b) => b.id === basketItemId);
      const target = useSongStore.getState().progression.find((p) => p.id === toId);
      if (!item || !target) return;
      const used = target.chords.reduce((s, c) => s + c.lengthBeats, 0);
      addChordToPattern(toId, item.chord, used, 2);
      removeFromBasket(basketItemId);
      return;
    }

    const fromId = source.droppableId.startsWith("pattern:") ? source.droppableId.slice("pattern:".length) : null;
    if (!fromId) return;
    if (fromId === toId) {
      if (source.index === destination.index) return;
      reorderPatternChord(toId, draggableId, destination.index);
    } else {
      movePatternChordToPatternAt(fromId, toId, draggableId, destination.index);
    }
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

      <DragDropContext onDragEnd={onDragEnd}>
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

        <BasketBar draggable onSendToLyrics={() => onSwitchTab?.("lyrics")} />
      </DragDropContext>

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
