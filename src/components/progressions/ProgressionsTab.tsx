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
import { Plus, Minus, Trash2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Play, ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { ensureAudio, playChord } from "@/lib/music/audio";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";
import { SECTION_COLOR_KEYS, sectionTintStyle } from "@/components/section/SectionColorPicker";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";

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
  const lastSelectedRef = useRef<string | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  // Pointer-based multi-chord drag (move selection to another pattern block).
  const [pdrag, setPdrag] = useState<null | {
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    ids: string[];
    displays: string[];
    targetPatternId?: string;
  }>(null);
  const pdragRef = useRef<typeof pdrag>(null);
  pdragRef.current = pdrag;

  const totalBeats = pattern.bars * pattern.beatsPerBar;
  const sortedChords = [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  const usedBeats = sortedChords.reduce((sum, c) => sum + c.lengthBeats, 0);
  const freeBeats = Math.max(0, totalBeats - usedBeats);
  const selectedIds = Array.from(selected);
  const canDeleteThisBlock = blocksInSection > 1;

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

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
      if (pdragRef.current) return; // suppress while dragging
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
  }, [activeChord, selectMode, selectedIds, sortedChords, totalBeats, pattern.id, setPatternChordLength, removePatternChordsBatch]);

  // Pointer drag lifecycle for multi-selected chords (#4).
  useEffect(() => {
    if (!pdrag) return;
    const DRAG_THRESHOLD = 6;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pdrag.pointerId) return;
      const dx = ev.clientX - pdrag.startX;
      const dy = ev.clientY - pdrag.startY;
      const moved = Math.hypot(dx, dy) >= DRAG_THRESHOLD;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const blk = hit?.closest("[data-pattern-block]") as HTMLElement | null;
      const targetPatternId = blk?.getAttribute("data-pattern-block") ?? undefined;
      setPdrag((prev) => prev ? { ...prev, x: ev.clientX, y: ev.clientY, active: prev.active || moved, targetPatternId } : prev);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pdrag.pointerId) return;
      const cur = pdragRef.current;
      setPdrag(null);
      if (!cur || !cur.active) return;
      if (!cur.targetPatternId || cur.targetPatternId === pattern.id) return;
      movePatternChordsTo(pattern.id, cur.targetPatternId, cur.ids);
      exitSelect();
    };
    const onCancel = () => setPdrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [pdrag?.pointerId, pattern.id, movePatternChordsTo]);

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
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
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
        if (next.has(chordId)) next.delete(chordId); else next.add(chordId);
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

  const active = activeChord ? sortedChords.find((c) => c.id === activeChord) ?? null : null;
  const activeMaxLen = active ? totalBeats - (usedBeats - active.lengthBeats) : 0;
  const activeIdx = active ? sortedChords.findIndex((c) => c.id === active.id) : -1;

  return (
    <div
      ref={blockRef}
      data-pattern-block={pattern.id}
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

      {/* Toolbar moved below the pattern grid (#7). */}

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
                onPointerDown={(e) => {
                  // If a multi-selection is active and this chord is part of it,
                  // initiate a pointer-based drag so the whole selection can be
                  // moved to another pattern block (#4). Skip drag for chords
                  // outside the selection so long-press/select still works.
                  if (selectMode && selected.has(c.id) && selectedIds.length >= 1) {
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    setPdrag({
                      pointerId: e.pointerId,
                      startX: e.clientX,
                      startY: e.clientY,
                      x: e.clientX,
                      y: e.clientY,
                      active: false,
                      ids: [...selectedIds],
                      displays: sortedChords.filter((x) => selected.has(x.id)).map((x) => x.chord.display),
                    });
                  }
                }}
                onMouseDown={(e) => { e.stopPropagation(); startPress(c.id); }}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={(e) => { e.stopPropagation(); startPress(c.id); }}
                onTouchEnd={cancelPress}
                onContextMenu={(e) => { e.preventDefault(); }}
                onClick={(e) => {
                  e.stopPropagation();
                  // If a drag just happened, suppress the click.
                  if (pdrag?.active) { e.preventDefault(); return; }
                  handleChordTap(c.id, e);
                }}
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
            className="mb-2 mt-2 flex items-center gap-2 rounded-md border border-primary/40 bg-card px-3 py-2 shadow-sm flex-wrap text-xs"
            onPointerDown={(e) => e.stopPropagation()}
          >
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
                {formatBeats(c.lengthBeats)}b
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
                onValueChange={(toId) => { movePatternChordsTo(pattern.id, toId, selectedIds); exitSelect(); }}
              >
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue placeholder="Move to…" />
                </SelectTrigger>
                <SelectContent>
                  {otherPatterns.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 ml-auto"
              onClick={() => { setActiveChord(null); exitSelect(); }}
            >
              Done
            </Button>
          </div>
        );
      })()}

      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Tap to focus & audition · Long-press / Shift-click to multi-select · Double-tap to edit · Drag selection across blocks · Del to delete
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
  index: number;
  allPatterns: PatternBlockType[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
  onDragChordStart: (fromPatternId: string, chordId: string) => void;
  onDragChordEnd: () => void;
  onDropChordOnPattern: (toPatternId: string, toIndex: number) => void;
  draggingChordId: string | null;
  draggingFromPatternId: string | null;
  onRequestDeleteSection: (sectionId: string) => void;
  onRequestDeleteBlock: (patternId: string) => void;
  /** When true: hide block counter & delete; show up/down reorder arrows. */
  sortMode?: boolean;
  onMoveSection?: (id: string, direction: -1 | 1) => void;
}

function SectionGroup({
  sectionId, displayName, blocks, totalSections, index, allPatterns,
  onPickerOpen, onDragChordStart, onDragChordEnd, onDropChordOnPattern,
  draggingChordId, draggingFromPatternId,
  onRequestDeleteSection, onRequestDeleteBlock,
  sortMode, onMoveSection,
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
      )}
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-auto text-muted-foreground hover:text-destructive disabled:opacity-30"
            onClick={() => onRequestDeleteSection(sectionId)}
            disabled={!canDeleteSection}
            title="Delete entire section (affects Lyrics tab too)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Pattern blocks within this section */}
      {!collapsed && blocks.map((p, i) => (
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

      {!collapsed && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => addPatternToSection(sectionId)}
        >
          <Plus className="h-3.5 w-3.5" /> Add pattern block
        </Button>
      )}
    </div>
  );
}

interface ProgressionsTabProps {
  sortMode?: boolean;
}

export function ProgressionsTab({ sortMode = false }: ProgressionsTabProps) {
  const {
    progression, sections, addSection, addChordToPattern, updatePatternChord,
    basket, reorderPatternChord, movePatternChordToPatternAt, moveSection,
    removeSection, removePatternBlock,
    suppressCrossTabDeleteWarning, setSuppressCrossTabDeleteWarning,
    setAllSectionsCollapsed,
  } = useSongStore();
  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);
  const [drag, setDrag] = useState<{ fromPatternId: string; chordId: string } | null>(null);
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
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground flex-1">
          Each section can hold multiple pattern blocks. Adding a chord here also drops it into the matching section in the Lyrics tab.
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
          onDragChordStart={(fromPatternId, chordId) => setDrag({ fromPatternId, chordId })}
          onDragChordEnd={() => setDrag(null)}
          onDropChordOnPattern={handleDropChord}
          draggingChordId={drag?.chordId ?? null}
          draggingFromPatternId={drag?.fromPatternId ?? null}
          onRequestDeleteSection={requestDeleteSection}
          onRequestDeleteBlock={requestDeleteBlock}
          sortMode={sortMode}
          onMoveSection={(id, direction) => moveSection(id, direction)}
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
