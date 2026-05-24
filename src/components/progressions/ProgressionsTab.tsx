import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Droppable, type DropResult } from "@hello-pangea/dnd";
import { useDndStore } from "@/store/dnd";
import { useSongStore, getSectionDisplayName, getPatternChordsViaSSOT, type PatternBlock as PatternBlockType, type SectionType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { FloatingChordToolbar } from "@/components/chord/FloatingChordToolbar";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { SpicePanel } from "@/components/progressions/SpicePanel";

import { VoiceLeadingRibbon } from "@/components/progressions/VoiceLeadingRibbon";
import { VoiceLeadingLinesPanel } from "@/components/progressions/VoiceLeadingLinesPanel";
import { ChordChip } from "@/components/chord/ChordChip";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Music2,
  Pencil,
  MessageSquare,
  KeyRound,
  Activity,
  Sparkles,
} from "lucide-react";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import { ChordSymbol, transposeChord } from "@/lib/music/chords";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { cn } from "@/lib/utils";
import { sectionTintStyle, SectionColorPicker, SECTION_COLOR_KEYS } from "@/components/section/SectionColorPicker";
import { KeyChangeSticker } from "@/components/section/KeyChangeSticker";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

import { useIsMobile, useIsDesktop } from "@/hooks/use-mobile";
import { useUIStore } from "@/store/ui";
import { useTheme } from "@/hooks/use-theme";

const SECTION_TYPES: SectionType[] = ["verse", "chorus", "bridge", "intro", "outro", "pre-chorus", "custom"];

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

/** Beats number input (allows empty while typing, commits valid integers). */
function BeatsInput({ value, beatsPerBar, onCommit }: { value: number; beatsPerBar: number; onCommit: (n: number) => void }) {
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
        if (Number.isFinite(n) && n >= beatsPerBar) onCommit(n);
      }}
      onBlur={() => {
        const n = Number(draft);
        if (!draft || !Number.isFinite(n) || n < beatsPerBar) {
          setDraft(String(beatsPerBar));
          onCommit(beatsPerBar);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-6 w-12 px-1 text-center text-[11px] font-mono-chord"
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
  /** Cross-block multi-selection: chordId → patternId. */
  multiSelected: Map<string, string>;
  onToggleMultiSelected: (chordId: string, patternId: string) => void;
  onClearMultiSelected: () => void;
  /** Semitone offset for the section this block belongs to. Non-zero transposes display + audition. */
  effectiveOffset: number;
  /** When true, the card background spans the full row width while content stays in the left ~85% (mobile non-last blocks). */
  extendBackground?: boolean;
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
  multiSelected,
  onToggleMultiSelected,
  onClearMultiSelected,
  effectiveOffset,
  extendBackground = false,
}: PatternProps) {
  const {
    updatePattern,
    movePatternChord,
    removePatternChordsBatch,
    setPatternChordLength,
    resizePatternChordsWithOverflow,
    updatePatternChord,
    bulkSetChordOctave,
    replacePatternChords,
  } = useSongStore();
  
  const [previewingSpiceChords, setPreviewingSpiceChords] = useState<ChordSymbol[] | null>(null);
  const [spiceOpen, setSpiceOpen] = useState(false);
  const [voiceLinesOpen, setVoiceLinesOpen] = useState(false);
  const setFocusedPattern = usePlaybackStore((s) => s.setFocusedPattern);
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const playingChordId = isPlaying && playbackCurrent?.patternId === pattern.id ? playbackCurrent.patternChordId : null;

  const blockRef = useRef<HTMLDivElement>(null);
  const justDraggedAtRef = useRef<number>(0);
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDidFireRef = useRef(false);
  const isMobile = useIsMobile();
  const multiSelectMode = useUIStore((s) => s.multiSelectMode);
  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;

  // Shift key tracking for multi-select via Shift+click / Shift+contextMenu.
  const isShiftDownRef = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftDownRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftDownRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Chords selected in THIS block (derived from the cross-block multiSelected map).
  const blockSelectedIds = useMemo(
    () => new Set([...multiSelected.entries()].filter(([, pid]) => pid === pattern.id).map(([cid]) => cid)),
    [multiSelected, pattern.id],
  );

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

  // Keyboard: while a chord in this block is active and no cross-block selection is active,
  // ← / → reorders; ↑ / ↓ changes bar length; Esc closes the context menu; Delete removes it.
  useEffect(() => {
    if (!activeChordInThisBlock) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Let the ProgressionsTab-level handler take over when multi-select is active.
      if (multiSelected.size > 0) return;
      if (!activeChordInThisBlockRef.current) return;
      const id = activeChordIdRef.current;
      if (!id) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onSetActiveChordId(null);
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
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removePatternChordsBatch(pattern.id, [id]);
        onSetActiveChordId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeChordInThisBlock?.id, pattern.id, multiSelected.size, removePatternChordsBatch, onSetActiveChordId]);

  return (
    <div
      ref={blockRef}
      data-pattern-block={pattern.id}
      className={cn("rounded-lg p-3 transition-shadow")}
      style={{
        background: "var(--paper-card)",
        boxShadow:
          "0 3px 7px -8px color-mix(in oklch, var(--paper-shade) 80%, transparent), 0 1px 2px -2px color-mix(in oklch, var(--paper-shade) 65%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Block {blockIndex + 1}
        </span>
        <span className="text-xs text-muted-foreground">·</span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-3 py-0.5 text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors rounded-full"
              style={{ background: "var(--paper-shade)" }}
              aria-label="Edit beats"
            >
              <span className="font-mono-chord">{formatBeats(usedBeats)}/{totalBeats}</span>
              <span>beats · {pattern.bars} bar{pattern.bars === 1 ? "" : "s"}</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = Math.max(pattern.beatsPerBar, totalBeats - pattern.beatsPerBar);
                  updatePattern(pattern.id, { bars: Math.max(1, Math.round(next / pattern.beatsPerBar)) });
                }}
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent disabled:opacity-30"
                disabled={pattern.bars <= 1}
                aria-label="Decrease beats"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <BeatsInput
                value={totalBeats}
                beatsPerBar={pattern.beatsPerBar}
                onCommit={(beats) => {
                  const bars = Math.max(1, Math.round(beats / pattern.beatsPerBar));
                  updatePattern(pattern.id, { bars });
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = totalBeats + pattern.beatsPerBar;
                  updatePattern(pattern.id, { bars: Math.max(1, Math.round(next / pattern.beatsPerBar)) });
                }}
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent"
                aria-label="Increase beats"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="ml-1 whitespace-nowrap">beats · {pattern.bars} bar{pattern.bars === 1 ? "" : "s"}</span>
            </div>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => { /* voice-leading UI deferred */ }}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "var(--paper-shade)" }}
            aria-label="Voice leading lines (coming soon)"
            title="Voice leading (coming soon)"
          >
            <Activity className="h-4 w-4" />
          </button>
          {sortedChords.length >= 2 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = !spiceOpen;
                setSpiceOpen(next);
                if (!next) setPreviewingSpiceChords(null);
              }}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors"
              style={{ background: "var(--paper-shade)", color: spiceOpen ? "var(--primary-strong)" : undefined }}
              aria-label="Add spice"
              title="Add spice"
            >
              <Sparkles className="h-4 w-4" style={{ color: "var(--primary)" }} />
            </button>
          )}
        </div>
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
                          const displayChord = effectiveOffset ? transposeChord(c.chord, effectiveOffset) : c.chord;
                          const colors = getChordColorClasses(displayChord);
                          const isActive = activeChordId === c.id;
                          const isSelected = multiSelected.has(c.id);
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
                                    if (isShiftDownRef.current) {
                                      onToggleMultiSelected(c.id, pattern.id);
                                      return;
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
                                  if (e.shiftKey) { onToggleMultiSelected(c.id, pattern.id); return; }
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
                                  const shiftHeld = e.shiftKey;
                                  singleClickTimerRef.current = setTimeout(() => {
                                    singleClickTimerRef.current = null;
                                    if (multiSelectModeRef.current) {
                                      onToggleMultiSelected(c.id, pattern.id);
                                      return;
                                    }
                                    if (shiftHeld || isShiftDownRef.current) {
                                      onToggleMultiSelected(c.id, pattern.id);
                                      return;
                                    }
                                    setFocusedPattern(pattern.id);
                                    void playChord(displayChord, undefined, c.chord.octave ?? 3);
                                    onSetActiveChordId(activeChordId === c.id ? null : c.id);
                                  }, 250);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void playChord(displayChord, undefined, c.chord.octave ?? 3);
                                    onSetActiveChordId(c.id);
                                  }
                                }}
                                className={cn(
                                  "rounded-md border border-black/10 flex flex-col items-center justify-center px-1 select-none transition-colors hover:opacity-90 cursor-pointer w-full",
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
                                  {displayChord.display}
                                </span>
                                <span className="font-mono-chord text-[10px] opacity-70 leading-tight">
                                  {formatBeats(c.lengthBeats)}b
                                </span>
                              </div>
                              {effectiveOffset !== 0 && (
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute -top-1 -left-1 z-10 inline-flex items-center justify-center rounded-full bg-[var(--paper)] shadow-sm"
                                  style={{ width: 14, height: 14 }}
                                >
                                  {effectiveOffset > 0 ? (
                                    <ArrowUp className="h-3 w-3" strokeWidth={3} style={{ color: "var(--primary-strong)" }} />
                                  ) : (
                                    <ArrowDown className="h-3 w-3" strokeWidth={3} style={{ color: "var(--primary-strong)" }} />
                                  )}
                                </span>
                              )}
                              {(isActive || isSelected) && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 z-20 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                                  style={{ touchAction: "manipulation" }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onPointerUp={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (blockSelectedIds.size > 1 && blockSelectedIds.has(c.id)) {
                                      removePatternChordsBatch(pattern.id, Array.from(blockSelectedIds));
                                    } else {
                                      removePatternChordsBatch(pattern.id, [c.id]);
                                    }
                                    onClearMultiSelected();
                                    onSetActiveChordId(null);
                                  }}
                                  aria-label="Delete chord"
                                >
                                  <X className="h-3.5 w-3.5" />
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

      {/* Floating chord toolbar — reorder, bar-length, multi-select.
          Hidden on mobile; mobile uses the global FloatingChordToolbar. */}
      {!isMobile && activeChordInThisBlock && (
        <div className="mt-2 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-lg border bg-popover shadow-md px-2 py-1.5 flex-wrap">
            {/* ← → reorder */}
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              disabled={activeIdx <= 0 || blockSelectedIds.size > 1}
              onClick={(e) => {
                e.stopPropagation();
                movePatternChord(pattern.id, activeChordId!, -1);
              }}
              aria-label="Move chord earlier"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="px-1 text-base font-mono-chord text-muted-foreground">
              {(effectiveOffset ? transposeChord(activeChordInThisBlock.chord, effectiveOffset) : activeChordInThisBlock.chord).display}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              disabled={activeIdx >= sortedChords.length - 1 || blockSelectedIds.size > 1}
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
                  blockSelectedIds.size > 0 ? Array.from(blockSelectedIds) : [activeChordId!],
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
                  blockSelectedIds.size > 0 ? Array.from(blockSelectedIds) : [activeChordId!],
                  LENGTH_STEP,
                );
              }}
              aria-label="Increase bar length by half"
              title="+½ bar"
            >
              <Plus className="h-5 w-5" />
            </Button>

            <div className="w-px h-6 bg-border mx-0.5" />

            {/* Multi-select toggle: adds/removes active chord to/from cross-block selection */}
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-9 w-9",
                blockSelectedIds.has(activeChordId!) && "bg-[var(--ink-soft)] text-[var(--paper-card)] hover:bg-[var(--ink-soft)] hover:text-[var(--paper-card)]",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMultiSelected(activeChordId!, pattern.id);
              }}
              aria-label="Toggle multi-select"
              title="Shift+click or use this button to multi-select"
            >
              <CheckSquare className="h-5 w-5" />
            </Button>

            {/* Select all in this block */}
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={(e) => {
                e.stopPropagation();
                sortedChords.forEach((ch) => {
                  if (!multiSelected.has(ch.id)) onToggleMultiSelected(ch.id, pattern.id);
                });
              }}
              aria-label="Select all chords in block"
              title="Select all"
            >
              <ListChecks className="h-5 w-5" />
            </Button>

            <div className="w-px h-6 bg-border mx-0.5" />

            {/* Octave picker */}
            <span className="text-xs text-muted-foreground select-none">Oct</span>
            <Select
              value={String(activeChordInThisBlock.chord.octave ?? 3)}
              onValueChange={(v) => {
                const oct = Number(v);
                const ids = blockSelectedIds.size > 0 ? Array.from(blockSelectedIds) : [activeChordId!];
                if (ids.length > 1) {
                  bulkSetChordOctave(pattern.id, ids, oct);
                } else {
                  updatePatternChord(pattern.id, activeChordId!, {
                    chord: { ...activeChordInThisBlock.chord, octave: oct },
                  });
                }
              }}
            >
              <SelectTrigger className="h-8 w-16 text-sm font-mono-chord border-0 shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6].map((o) => (
                  <SelectItem key={o} value={String(o)} className="text-sm font-mono-chord">
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}


      <VoiceLeadingRibbon
        originalChords={sortedChords.map((c) => c.chord)}
        spicedChords={previewingSpiceChords}
        isVisible={!!previewingSpiceChords && sortedChords.length >= 2}
      />

      <SpicePanel
        pattern={pattern}
        activeChordId={activeChordId}
        onAuditionChange={setPreviewingSpiceChords}
        open={spiceOpen}
        onOpenChange={setSpiceOpen}
        hideTrigger
      />

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
  multiSelected: Map<string, string>;
  onToggleMultiSelected: (chordId: string, patternId: string) => void;
  onClearMultiSelected: () => void;
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
  multiSelected,
  onToggleMultiSelected,
  onClearMultiSelected,
}: SectionGroupProps) {
  const isMobile = useIsMobile();
  const addPatternToSection = useSongStore((s) => s.addPatternToSection);
  const updateSection = useSongStore((s) => s.updateSection);
  const duplicateSection = useSongStore((s) => s.duplicateSection);
  const setSectionColor = useSongStore((s) => s.setSectionColor);
  const setSectionArpArmed = useSongStore((s) => s.setSectionArpArmed);
  const setSectionComment = useSongStore((s) => s.setSectionComment);
  const replacePatternChords = useSongStore((s) => s.replacePatternChords);
  const section = useSongStore((s) => s.sections.find((sec) => sec.id === sectionId));
  const allSections = useSongStore((s) => s.sections);
  const collapsed = !!section?.collapsed;
  const cardRef = useRef<HTMLDivElement>(null);
  const canDeleteSection = totalSections > 1;
  const { theme } = useTheme();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [pendingKeyChange, setPendingKeyChange] = useState(false);
  const hasComment = !!(section?.comment && section.comment.trim().length);
  const effectiveOffsets = useMemo(() => computeEffectiveOffsets(allSections), [allSections]);
  const effectiveOffset = effectiveOffsets[index] ?? 0;
  const isFirstSection = index === 0;
  const [draftLabel, setDraftLabel] = useState(section?.label ?? "");
  const prevTypeRef = useRef<SectionType | null>(null);
  const prevLabelRef = useRef<string>(section?.label ?? "");

  function acceptCustomName() {
    const trimmed = draftLabel.trim() || "Section";
    updateSection(sectionId, { label: trimmed });
    prevTypeRef.current = null;
    setCustomRenameOpen(false);
  }

  function cancelCustomName() {
    if (prevTypeRef.current && prevTypeRef.current !== "custom") {
      updateSection(sectionId, { type: prevTypeRef.current, label: prevLabelRef.current });
    }
    prevTypeRef.current = null;
    setCustomRenameOpen(false);
  }

  return (
    <div
      ref={cardRef}
      data-section-id={sectionId}
      style={{ ...sectionTintStyle(section?.color, theme === "dark" ? 0.175 : 0.35), backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      className={cn("noise-texture-surface rounded-xl px-2 py-4 space-y-3 transition-shadow")}
    >
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-3 h-12 rounded-xl bg-[#b2b0a4]"
        style={{ color: "var(--pill-rest-fg)" }}
      >
        <Select
          value={section?.type ?? "verse"}
          onValueChange={(v) => {
            const next = v as SectionType;
            if (next === "custom") {
              prevTypeRef.current = section?.type ?? "verse";
              prevLabelRef.current = section?.label ?? "";
              updateSection(sectionId, { type: next, label: section?.label || "Section" });
              setDraftLabel(section?.label && section?.type === "custom" ? section.label : "");
              setCustomRenameOpen(true);
            } else {
              updateSection(sectionId, { type: next, label: section?.label ?? "" });
            }
          }}
          disabled={sortMode || totalSections === 1}
        >
          <SelectTrigger
            className="h-auto w-auto min-w-[120px] border-0 shadow-none outline-none ring-0 focus:ring-0 gap-2"
            style={{
              padding: "5px 12px",
              borderRadius: "var(--pill-radius, 8px)",
              background: "transparent",
              color: "inherit",
              fontFamily: "'Nunito', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <Music2 style={{ width: 14, height: 14, flexShrink: 0 }} />
            <SelectValue>{displayName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SECTION_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {section?.type === "custom" && !sortMode && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setCustomRenameOpen(true)}
            aria-label="Rename custom section"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {!sortMode && !isFirstSection && (
          <KeyChangeSticker
            sectionId={sectionId}
            effectiveOffset={effectiveOffset}
            explicitOffset={section?.keyChangeRootOffset}
            startInEditMode={pendingKeyChange}
            onCancelInitial={() => setPendingKeyChange(false)}
          />
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
            <button
              type="button"
              onClick={() => duplicateSection(sectionId)}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md text-[var(--pill-rest-fg)]/80 hover:text-[var(--pill-rest-fg)] transition-colors bg-[#dad8d2]"
              aria-label="Duplicate section"
              title="Duplicate section"
            >
              <Copy className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md text-[var(--pill-rest-fg)]/80 hover:text-[var(--pill-rest-fg)] transition-colors bg-[#dad8d2]"
                  aria-label="Section options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {effectiveOffset === 0 && (
                  <DropdownMenuItem
                    onClick={() => setPendingKeyChange(true)}
                    disabled={isFirstSection}
                    title={isFirstSection ? "Key changes start from the second section" : undefined}
                  >
                    <KeyRound className="h-4 w-4" /> Add Key Change
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm">Arpeggiator</span>
                  <Switch
                    checked={section?.arpArmed !== false}
                    onCheckedChange={(b) => setSectionArpArmed(sectionId, b)}
                    aria-label="Toggle arpeggiator for this section"
                  />
                </div>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <p className="text-xs text-muted-foreground mb-1.5">Section color</p>
                  <div className="grid grid-cols-8 gap-1">
                    {SECTION_COLOR_KEYS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSectionColor(sectionId, c)}
                        title={c}
                        className={cn(
                          "h-6 w-6 rounded-md border border-border transition-transform",
                          section?.color === c && "ring-2 ring-primary scale-110",
                        )}
                        style={{ backgroundColor: `var(--section-tint-${c})` }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSectionColor(sectionId, null)}
                    className="mt-1.5 w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-0.5"
                  >
                    <X className="h-3 w-3" /> Clear color
                  </button>
                </div>
                <DropdownMenuSeparator />
                {blocks.length > 1 && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onRequestDeleteBlock(blocks[blocks.length - 1].id)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete last block
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onRequestDeleteSection(sectionId)}
                  disabled={!canDeleteSection}
                  title={!canDeleteSection ? "Cannot delete the last section" : undefined}
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
      <>


        {(() => {
          const sectionHasChords = !!section && blocks.some((b) => getPatternChordsViaSSOT(section, b).length > 0);
          const maxBars = Math.max(1, ...blocks.map((b) => b.bars));
          const renderBlock = (p: PatternBlockType, i: number) => {
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
            const widthPct = (p.bars / maxBars) * 100;
            const blockHasChords = section ? getPatternChordsViaSSOT(section, p).length > 0 : false;
            return (
              <div key={p.id} className="min-w-0" style={{ width: `${widthPct}%` }}>
                {blockHasChords ? (
                  <PatternBlock
                    pattern={p}
                    blockIndex={i}
                    blocksInSection={blocks.length}
                    otherPatterns={otherAll}
                    onPickerOpen={onPickerOpen}
                    onRequestDeleteBlock={onRequestDeleteBlock}
                    onEditChordOpen={onEditChordOpen}
                    activeChordId={activeChordId}
                    onSetActiveChordId={onSetActiveChordId}
                    multiSelected={multiSelected}
                    onToggleMultiSelected={onToggleMultiSelected}
                    onClearMultiSelected={onClearMultiSelected}
                    effectiveOffset={effectiveOffset}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onPickerOpen(p.id, 0)}
                    className="w-full rounded-lg border-2 border-dashed border-border/60 bg-[var(--paper-card)]/40 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-[var(--paper-card)] hover:border-border min-h-[80px] transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-sm font-display uppercase tracking-wide">Add chords</span>
                  </button>
                )}
              </div>
            );
          };
          const addChordsPlaceholder = (
            <button
              type="button"
              onClick={() => {
                let firstBlock = blocks[0];
                if (!firstBlock) {
                  addPatternToSection(sectionId);
                  const fresh = useSongStore.getState().progression.filter(
                    (p) => (p.sectionId ?? p.id) === sectionId,
                  );
                  firstBlock = fresh[0];
                }
                if (firstBlock) onPickerOpen(firstBlock.id, 0);
              }}
              className="w-full rounded-lg border-2 border-dashed border-border/60 bg-[var(--paper-card)]/40 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-[var(--paper-card)] hover:border-border min-h-[80px] transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-display uppercase tracking-wide">Add chords</span>
            </button>
          );
          const addBlockRow = (
            <div className="flex items-stretch gap-2 mt-3">
              <button
                type="button"
                onClick={() => addPatternToSection(sectionId)}
                style={{ width: "40%" }}
                className="mr-auto rounded-lg border-2 border-dashed border-border/50 bg-[var(--paper-card)]/40 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-[var(--paper-card)] hover:border-border/80 min-h-[40px] transition-colors py-1.5"
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs font-display uppercase tracking-wide">Add block</span>
              </button>
              <button
                type="button"
                onClick={() => setCommentOpen((o) => !o)}
                className="relative h-10 w-10 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={hasComment ? "View comment" : "Add comment"}
                title={hasComment ? "View comment" : "Add comment"}
              >
                <MessageSquare className="h-4 w-4" />
                {hasComment && (
                  <span aria-hidden className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            </div>
          );
          if (!sectionHasChords) {
            return (
              <div>
                {addChordsPlaceholder}
                {addBlockRow}
              </div>
            );
          }
          return (
            <div>
              {isMobile ? (
                <div className="flex flex-col gap-3">
                  {blocks.map((p, i) => renderBlock(p, i))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {blocks.map((p, i) => renderBlock(p, i))}
                </div>
              )}
              {addBlockRow}
            </div>
          );
        })()}
        {commentOpen && (
          <div className="mt-3 w-full">
            <Textarea
              value={section?.comment ?? ""}
              onChange={(e) => setSectionComment(sectionId, e.target.value)}
              placeholder="Notes for this section…"
              className="min-h-[80px] font-display text-base"
            />
          </div>
        )}
        </>



      <Dialog
        open={customRenameOpen}
        onOpenChange={(o) => {
          if (!o) cancelCustomName();
          else setCustomRenameOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name this section</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") acceptCustomName();
            }}
            placeholder="e.g. Refrain, Tag, Solo…"
            className="font-display text-base"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={cancelCustomName}>Cancel</Button>
            <Button onClick={acceptCustomName}>Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    moveSection,
    removeSection,
    removePatternBlock,
    setAllSectionsCollapsed,
    shiftPatternChords,
    resizePatternChordsWithOverflow,
    movePatternChord,
    bulkSetChordOctave,
  } = useSongStore();
  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);
  const [activeChordId, setActiveChordId] = useState<string | null>(null);
  // Cross-block multi-select: chordId → patternId.
  const [multiSelected, setMultiSelected] = useState<Map<string, string>>(new Map());
  const multiSelectedRef = useRef(multiSelected);
  multiSelectedRef.current = multiSelected;

  const toggleMultiSelected = useCallback((chordId: string, patternId: string) => {
    setMultiSelected((prev) => {
      const next = new Map(prev);
      if (next.has(chordId)) next.delete(chordId);
      else next.set(chordId, patternId);
      return next;
    });
  }, []);

  const sortAnimatingRef = useRef(false);

  const handleAnimatedMoveSection = useCallback((id: string, direction: -1 | 1) => {
    if (sortAnimatingRef.current) return;
    const el = document.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    if (!el) { moveSection(id, direction); return; }
    const parent = el.parentElement;
    if (!parent) { moveSection(id, direction); return; }
    const siblings = Array.from(parent.children) as HTMLElement[];
    const idx = siblings.indexOf(el);
    const neighborIdx = idx + direction;
    if (neighborIdx < 0 || neighborIdx >= siblings.length) { moveSection(id, direction); return; }
    const neighbor = siblings[neighborIdx];
    const r1 = el.getBoundingClientRect();
    const r2 = neighbor.getBoundingClientRect();
    const elDelta = r2.top - r1.top;
    const neighborDelta = r1.top - r2.top;
    sortAnimatingRef.current = true;
    el.style.transition = "transform 400ms cubic-bezier(0.4,0,0.2,1)";
    neighbor.style.transition = "transform 400ms cubic-bezier(0.4,0,0.2,1)";
    el.style.transform = `translateY(${elDelta}px)`;
    neighbor.style.transform = `translateY(${neighborDelta}px)`;
    setTimeout(() => {
      el.style.transition = "";
      el.style.transform = "";
      neighbor.style.transition = "";
      neighbor.style.transform = "";
      sortAnimatingRef.current = false;
      moveSection(id, direction);
    }, 400);
  }, [moveSection]);

  const MULTI_LENGTH_STEP = 0.5;

  const handleMultiResize = useCallback((delta: number) => {
    const byPattern = new Map<string, string[]>();
    multiSelectedRef.current.forEach((patternId, chordId) => {
      const arr = byPattern.get(patternId) ?? [];
      arr.push(chordId);
      byPattern.set(patternId, arr);
    });
    byPattern.forEach((chordIds, patternId) => {
      resizePatternChordsWithOverflow(patternId, chordIds, delta);
    });
  }, [resizePatternChordsWithOverflow]);

  const handleMultiShift = useCallback((direction: -1 | 1) => {
    const byPattern = new Map<string, string[]>();
    multiSelectedRef.current.forEach((patternId, chordId) => {
      const arr = byPattern.get(patternId) ?? [];
      arr.push(chordId);
      byPattern.set(patternId, arr);
    });
    byPattern.forEach((chordIds, patternId) => {
      shiftPatternChords(patternId, chordIds, direction);
    });
  }, [shiftPatternChords]);

  const handleMultiResizeRef = useRef(handleMultiResize);
  handleMultiResizeRef.current = handleMultiResize;
  const handleMultiShiftRef = useRef(handleMultiShift);
  handleMultiShiftRef.current = handleMultiShift;

  useEffect(() => {
    if (multiSelected.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); handleMultiShiftRef.current(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); handleMultiShiftRef.current(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); handleMultiResizeRef.current(MULTI_LENGTH_STEP); }
      else if (e.key === "ArrowDown") { e.preventDefault(); handleMultiResizeRef.current(-MULTI_LENGTH_STEP); }
      else if (e.key === "Escape") { setMultiSelected(new Map()); }
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const byPattern = new Map<string, string[]>();
        for (const [chordId, patternId] of multiSelectedRef.current) {
          const arr = byPattern.get(patternId) ?? [];
          arr.push(chordId);
          byPattern.set(patternId, arr);
        }
        const removeBatch = useSongStore.getState().removePatternChordsBatch;
        for (const [patId, ids] of byPattern) {
          removeBatch(patId, ids);
        }
        setMultiSelected(new Map());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [multiSelected.size]);
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);
  const [chordEditor, setChordEditor] = useState<{ patternId: string; chordId: string; sectionId: string } | null>(null);
  const [patternAddSlot, setPatternAddSlot] = useState<{ patternId: string; atBeat: number; sectionId: string } | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();

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

  const openPicker = (patternId: string, atBeat: number, replaceChordId?: string) => {
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
      useSongStore.getState().addChordToPatternSlot(
        picker.patternId,
        chord,
        picker.atBeat,
        !isDesktop ? 4 : undefined,
      );
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination } = result;
    if (!destination) return;
    const dst = destination.droppableId.split(":");
    if (dst[0] !== "pattern") return;
    if (dst[2] === "edge-left" || dst[2] === "edge-right") {
      const state = useSongStore.getState();
      const idx = state.progression.findIndex((p) => p.id === dst[1]);
      if (idx < 0) return;
      const neighborIdx = dst[2] === "edge-left" ? idx - 1 : idx + 1;
      if (!state.progression[neighborIdx]) {
        toast({ title: "No adjacent block", description: "There's no neighboring pattern block to move into.", variant: "destructive" });
      }
    }
  };

  const requestDeleteSection = (sectionId: string) => removeSection(sectionId);

  const requestDeleteBlock = (patternId: string) => {
    setConfirmDeleteBlock(patternId);
  };

  return (
    <div
      className="space-y-4"
      onClick={(e) => { if (e.target === e.currentTarget) setActiveChordId(null); }}
    >
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
          onMoveSection={handleAnimatedMoveSection}
          activeChordId={activeChordId}
          onSetActiveChordId={setActiveChordId}
          multiSelected={multiSelected}
          onToggleMultiSelected={toggleMultiSelected}
          onClearMultiSelected={() => setMultiSelected(new Map())}
        />
      ))}

      {isMobile && (() => {
        const patternOfActive = activeChordId
          ? progression.find((p) => {
              const owner = sections.find((s) => s.id === (p.sectionId ?? p.id));
              const chords = owner ? getPatternChordsViaSSOT(owner, p) : p.chords;
              return chords.some((c) => c.id === activeChordId);
            }) ?? null
          : null;
        const activeChordData = (() => {
          if (!patternOfActive || !activeChordId) return null;
          const owner = sections.find((s) => s.id === (patternOfActive.sectionId ?? patternOfActive.id));
          const chords = owner ? getPatternChordsViaSSOT(owner, patternOfActive) : patternOfActive.chords;
          return chords.find((c) => c.id === activeChordId) ?? null;
        })();
        const activeIdx = patternOfActive && activeChordId
          ? (() => {
              const owner = sections.find((s) => s.id === (patternOfActive.sectionId ?? patternOfActive.id));
              const chords = owner ? getPatternChordsViaSSOT(owner, patternOfActive) : patternOfActive.chords;
              return chords.findIndex((c) => c.id === activeChordId);
            })()
          : -1;
        const activeBlockLen = patternOfActive
          ? (() => {
              const owner = sections.find((s) => s.id === (patternOfActive.sectionId ?? patternOfActive.id));
              const chords = owner ? getPatternChordsViaSSOT(owner, patternOfActive) : patternOfActive.chords;
              return chords.length;
            })()
          : 0;

        const canShiftLeftSingle = activeIdx > 0;
        const canShiftRightSingle = activeIdx >= 0 && activeIdx < activeBlockLen - 1;
        const canShiftLeftMulti = multiSelected.size > 0 && (() => {
          for (const [chordId, patternId] of multiSelected) {
            const pat = progression.find((p) => p.id === patternId);
            if (!pat) return false;
            const owner = sections.find((s) => s.id === (pat.sectionId ?? pat.id));
            const chords = owner ? getPatternChordsViaSSOT(owner, pat) : pat.chords;
            const idx = chords.findIndex((c) => c.id === chordId);
            if (idx <= 0) return false;
          }
          return true;
        })();
        const canShiftRightMulti = multiSelected.size > 0 && (() => {
          for (const [chordId, patternId] of multiSelected) {
            const pat = progression.find((p) => p.id === patternId);
            if (!pat) return false;
            const owner = sections.find((s) => s.id === (pat.sectionId ?? pat.id));
            const chords = owner ? getPatternChordsViaSSOT(owner, pat) : pat.chords;
            const idx = chords.findIndex((c) => c.id === chordId);
            if (idx < 0 || idx >= chords.length - 1) return false;
          }
          return true;
        })();

        const useMulti = multiSelected.size > 0;
        const canShiftLeft = useMulti ? canShiftLeftMulti : canShiftLeftSingle;
        const canShiftRight = useMulti ? canShiftRightMulti : canShiftRightSingle;

        const selectedOctaves: number[] = [];
        multiSelected.forEach((patternId, chordId) => {
          const pat = progression.find((p) => p.id === patternId);
          if (!pat) return;
          const owner = sections.find((s) => s.id === (pat.sectionId ?? pat.id));
          const chords = owner ? getPatternChordsViaSSOT(owner, pat) : pat.chords;
          const c = chords.find((cc) => cc.id === chordId);
          if (c?.chord.octave !== undefined) selectedOctaves.push(c.chord.octave);
        });

        return (
          <FloatingChordToolbar
            mode="progression"
            activeChord={
              activeChordData
                ? {
                    id: activeChordData.id,
                    display: activeChordData.chord.display,
                    octave: activeChordData.chord.octave,
                    lengthBeats: activeChordData.lengthBeats,
                  }
                : null
            }
            selectedCount={multiSelected.size}
            selectedOctaves={selectedOctaves}
            canShiftLeft={canShiftLeft}
            canShiftRight={canShiftRight}
            onShift={(dir) => {
              if (useMulti) handleMultiShift(dir);
              else if (patternOfActive && activeChordId) movePatternChord(patternOfActive.id, activeChordId, dir);
            }}
            onResize={(delta) => {
              if (useMulti) handleMultiResize(delta);
              else if (patternOfActive && activeChordId)
                resizePatternChordsWithOverflow(patternOfActive.id, [activeChordId], delta);
            }}
            onOctaveChange={(oct) => {
              if (useMulti) {
                const byPattern = new Map<string, string[]>();
                multiSelected.forEach((patternId, chordId) => {
                  const arr = byPattern.get(patternId) ?? [];
                  arr.push(chordId);
                  byPattern.set(patternId, arr);
                });
                byPattern.forEach((chordIds, patternId) => bulkSetChordOctave(patternId, chordIds, oct));
                if (patternOfActive) {
                  const owner = sections.find((s) => s.id === (patternOfActive.sectionId ?? patternOfActive.id));
                  const chords = owner ? getPatternChordsViaSSOT(owner, patternOfActive) : patternOfActive.chords;
                  const firstSelected = chords.find((c) => multiSelected.has(c.id));
                  if (firstSelected) void playChord(firstSelected.chord, undefined, oct);
                }
              } else if (patternOfActive && activeChordData) {
                updatePatternChord(patternOfActive.id, activeChordData.id, {
                  chord: { ...activeChordData.chord, octave: oct },
                });
                void playChord(activeChordData.chord, undefined, oct);
              }
            }}
            onSelectAll={() => {
              if (!patternOfActive) return;
              const owner = sections.find((s) => s.id === (patternOfActive.sectionId ?? patternOfActive.id));
              const chords = owner ? getPatternChordsViaSSOT(owner, patternOfActive) : patternOfActive.chords;
              chords.forEach((c) => {
                if (!multiSelected.has(c.id)) toggleMultiSelected(c.id, patternOfActive.id);
              });
            }}
            onClearAll={() => {
              setActiveChordId(null);
              setMultiSelected(new Map());
            }}
            onDelete={() => {
              const removeBatch = useSongStore.getState().removePatternChordsBatch;
              if (multiSelected.size > 0) {
                const byPattern = new Map<string, string[]>();
                for (const [chordId, patternId] of multiSelected) {
                  const arr = byPattern.get(patternId) ?? [];
                  arr.push(chordId);
                  byPattern.set(patternId, arr);
                }
                for (const [patId, ids] of byPattern) {
                  removeBatch(patId, ids);
                }
                setMultiSelected(new Map());
              } else if (activeChordId && patternOfActive) {
                removeBatch(patternOfActive.id, [activeChordId]);
              }
              setActiveChordId(null);
            }}
            onExitEdit={() => {
              setActiveChordId(null);
              setMultiSelected(new Map());
            }}
          />
        );
      })()}

      {/* Cross-block multi-select toolbar (desktop). Mobile uses FloatingChordToolbar. */}
      {!isMobile && multiSelected.size > 0 && (
        <div className="sticky bottom-10 z-30 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-lg border bg-popover shadow-md px-3 py-2 pointer-events-auto">
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => handleMultiShift(-1)} aria-label="Move selection earlier" title="Move left (← also works)">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-sm text-muted-foreground px-1 select-none">{multiSelected.size} selected</span>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => handleMultiShift(1)} aria-label="Move selection later" title="Move right (→ also works)">
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div className="w-px h-6 bg-border mx-0.5" />
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => handleMultiResize(-MULTI_LENGTH_STEP)} aria-label="Shorten beat length" title="Shorten (↓ also works)">
              <Minus className="h-5 w-5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => handleMultiResize(MULTI_LENGTH_STEP)} aria-label="Extend beat length" title="Extend (↑ also works)">
              <Plus className="h-5 w-5" />
            </Button>
            <div className="w-px h-6 bg-border mx-0.5" />
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setMultiSelected(new Map())} aria-label="Clear selection" title="Clear (Esc also works)">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      <div
        className="flex flex-col gap-3 px-4 pt-4 mt-2 rounded-t-xl"
        style={{
          background: "color-mix(in oklch, var(--ink-soft) 40%, transparent)",
          borderTop: "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
          paddingBottom: "60rem",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
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
            color: "var(--ink)",
          }}
        >
          Add Section
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {(["verse", "chorus", "pre-chorus", "bridge", "intro"] as const).map((t) => (
            <button
              key={t}
              onClick={() => addSection(t)}
              className="btn-sculpt-cocoa inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold capitalize"
            >
              <Plus className="h-3.5 w-3.5" /> {t === "pre-chorus" ? "Pre-Chorus" : t}
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
        onOpenChange={(o) => { if (!o) { setPicker(null); setMultiSelected(new Map()); setActiveChordId(null); } }}
        onPick={handlePick}
        onPickBatch={(chords) => {
          if (!picker || picker.replaceChordId) return;
          const { addChordToPatternSlot } = useSongStore.getState();
          chords.forEach((c, i) =>
            addChordToPatternSlot(picker.patternId, c, picker.atBeat + i, !isDesktop ? 4 : undefined),
          );
        }}
        sectionId={(() => {
          if (!picker) return undefined;
          const pat = progression.find((p) => p.id === picker.patternId);
          return pat?.sectionId ?? pat?.id;
        })()}
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
          onClose={() => { setChordEditor(null); setMultiSelected(new Map()); setActiveChordId(null); }}
        />
      )}

      {patternAddSlot && (
        <FocusedChordEditor
          mode="progression-add"
          sectionId={patternAddSlot.sectionId}
          patternId={patternAddSlot.patternId}
          atBeat={patternAddSlot.atBeat}
          onClose={() => { setPatternAddSlot(null); setMultiSelected(new Map()); setActiveChordId(null); }}
        />
      )}

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
