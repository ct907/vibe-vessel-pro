import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDndStore } from "@/store/dnd";
import { useSongStore, getSectionDisplayName, getPatternChordsViaSSOT, type PatternBlock as PatternBlockType, type SectionType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { FloatingChordToolbar } from "@/components/chord/FloatingChordToolbar";
import { SpiceSheet } from "@/components/progressions/SpiceSheet";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  ListMusic,
  MessageSquare,
  KeyRound,
  Sparkles,
  Play,
  Scissors,
  Maximize2,
  Lock,
  Unlock,
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
import { useUIStore, type ClipboardChord } from "@/store/ui";
import { WhyThisChordSheet } from "@/components/chords/WhyThisChordSheet";
import { useTheme } from "@/hooks/use-theme";
import { useOnboardingStore } from "@/store/onboarding";
import { AnchoredCoachMark, OnboardingCoachMark } from "@/components/onboarding/OnboardingCoachMark";

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
  onShiftSelectChord?: (patternId: string, chordId: string) => void;
  onClearMultiSelected: () => void;
  pasteMode?: boolean;
  onPasteIntoBlock?: (patternId: string, afterChordId?: string) => void;
  /** Semitone offset for the section this block belongs to. Non-zero transposes display + audition. */
  effectiveOffset: number;
  /** When true, the card background spans the full row width while content stays in the left ~85% (mobile non-last blocks). */
  extendBackground?: boolean;
  blockRef?: React.RefObject<HTMLDivElement | null>;
  spiceButtonRef?: React.RefObject<HTMLButtonElement | null>;
  spiceHeaderRef?: React.RefObject<HTMLDivElement | null>;
  onVariationApplied?: () => void;
  onSpiceOpenChange?: (open: boolean) => void;
  onChordClick: (patternId: string, chordId: string) => void;
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
  onShiftSelectChord,
  onClearMultiSelected,
  pasteMode,
  onPasteIntoBlock,
  effectiveOffset,
  extendBackground = false,
  blockRef: blockRefProp,
  spiceButtonRef,
  spiceHeaderRef,
  onVariationApplied,
  onSpiceOpenChange,
  onChordClick,
}: PatternProps) {
  const {
    setPatternLock,
    setPatternPlayBeats,
    movePatternChord,
    removePatternChordsBatch,
    setPatternChordLength,
    resizePatternChordsWithOverflow,
    updatePatternChord,
    bulkSetChordOctave,
  } = useSongStore();
  
  const [previewingSpiceChords, setPreviewingSpiceChords] = useState<ChordSymbol[] | null>(null);
  const [spiceOpen, setSpiceOpen] = useState(false);
  useEffect(() => { onSpiceOpenChange?.(spiceOpen); }, [spiceOpen, onSpiceOpenChange]);
  const setFocusedPattern = usePlaybackStore((s) => s.setFocusedPattern);
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const playingChordId = isPlaying && playbackCurrent?.patternId === pattern.id ? playbackCurrent.patternChordId : null;
  const blockRef = useRef<HTMLDivElement>(null);
  const justDraggedAtRef = useRef<number>(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDidFireRef = useRef(false);
  // Right-edge drag-resize on the active chip: tracks pointer travel in beats,
  // applying snapped half-beat deltas through the same resize action the
  // toolbar steppers use.
  const resizeDragRef = useRef<{ chordId: string; startX: number; pxPerBeat: number; appliedDelta: number } | null>(null);
  const isMobile = useIsMobile();
  const multiSelectMode = useUIStore((s) => s.multiSelectMode);
  const setWhyChord = useUIStore((s) => s.setWhyChord);
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
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
  const isLocked = pattern.lockedBeats != null;
  // Smallest lock that still fits current content (whole bars, ≥ 1 bar). The
  // store clamps to this too — shown here so the stepper can't go lower.
  const minLockBeats = Math.max(
    pattern.beatsPerBar,
    Math.ceil(usedBeats / pattern.beatsPerBar - 1e-9) * pattern.beatsPerBar,
  );
  const canDeleteThisBlock = totalBlocksInSong > 1;
  // Crop-to-fit: effective played length (capped at capacity). When cropped,
  // the grid is drawn shrunk to this many beats while the card keeps its width.
  const isCropped = pattern.playBeats != null;
  const gridBeats = isCropped ? Math.min(pattern.playBeats!, totalBeats) : totalBeats;
  const canCrop = usedBeats > 0.5 && usedBeats < totalBeats - 1e-6;
  // Lyric lines this block's chords sit on (distinct, in chord order) — shown
  // above the grid to anchor the progression to its words.
  const blockLyricLines = useMemo(() => {
    if (!ownerSection) return [] as string[];
    const lineById = new Map(ownerSection.lines.map((l) => [l.id, l] as const));
    const scById = new Map(ownerSection.chords.map((c) => [c.id, c] as const));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of sortedChords) {
      const lid = scById.get(c.id)?.lyricsPlacement?.lineId;
      if (!lid || seen.has(lid)) continue;
      seen.add(lid);
      const text = lineById.get(lid)?.text?.trim();
      if (text) out.push(text);
    }
    return out;
  }, [ownerSection, sortedChords]);

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
        // movePatternChord swaps within the block, or hops into the previous
        // block when the chord is already at the left edge.
        movePatternChordRef.current(pattern.id, id, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        movePatternChordRef.current(pattern.id, id, 1);
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
      ref={(el) => { (blockRef as React.MutableRefObject<HTMLDivElement | null>).current = el; if (blockRefProp) (blockRefProp as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
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
              aria-label="Block length"
            >
              {isLocked && <Lock className="h-3 w-3 opacity-70" style={{ color: "var(--primary)" }} />}
              <span className="font-mono-chord">{formatBeats(usedBeats)}/{totalBeats}</span>
              <span>beats · {pattern.bars} bar{pattern.bars === 1 ? "" : "s"}</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPatternLock(pattern.id, isLocked ? null : totalBeats);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[12px] rounded hover:bg-accent"
                style={{ color: isLocked ? "var(--primary-strong)" : "var(--ink-soft)" }}
              >
                {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                <span>{isLocked ? "Locked length" : "Auto (grows to fit)"}</span>
              </button>
              {isLocked && (
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPatternLock(pattern.id, Math.max(minLockBeats, totalBeats - pattern.beatsPerBar));
                    }}
                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent disabled:opacity-30"
                    disabled={totalBeats <= minLockBeats}
                    aria-label="Decrease beats"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <BeatsInput
                    value={totalBeats}
                    beatsPerBar={pattern.beatsPerBar}
                    onCommit={(beats) => setPatternLock(pattern.id, Math.max(minLockBeats, beats))}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPatternLock(pattern.id, totalBeats + pattern.beatsPerBar);
                    }}
                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent"
                    aria-label="Increase beats"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <span className="ml-1 whitespace-nowrap">beats · {pattern.bars} bar{pattern.bars === 1 ? "" : "s"}</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-1">
          {sortedChords.length >= 2 && (
            <button
              ref={spiceButtonRef}
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
          {(canCrop || isCropped) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPatternPlayBeats(pattern.id, isCropped ? null : usedBeats);
              }}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors"
              style={{ background: "var(--paper-shade)", color: isCropped ? "var(--primary-strong)" : "var(--ink-soft)" }}
              aria-label={isCropped ? "Restore full block length" : "Crop block to fit its chords"}
              title={isCropped ? "Restore full length" : "Crop to fit"}
            >
              {isCropped ? <Maximize2 className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}
            </button>
          )}
          {canDeleteThisBlock && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDeleteBlock(pattern.id);
              }}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors text-[var(--ink-soft)] hover:text-destructive"
              style={{ background: "var(--paper-shade)" }}
              aria-label="Delete this block"
              title="Delete this block"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar moved below the pattern grid (#7). */}

      {blockLyricLines.length > 0 && (
        <div className="mb-1.5 flex flex-col gap-0.5">
          {blockLyricLines.map((text, i) => (
            <span key={i} className="text-[12px] leading-tight text-[var(--ink-soft)] truncate">
              {text}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        {(() => {
          const slotCount = Math.max(1, Math.ceil(gridBeats - 1e-6));
          const beatsPerBar = pattern.beatsPerBar;
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
              data-pattern-grid
              className={cn("relative rounded-md flex items-stretch", pasteMode && "animate-paste-glow cursor-copy")}
              style={{ background: "var(--paper-shade)", boxShadow: "var(--shadow-recess)", minHeight: 80, paddingTop: 8, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, gap: 3, width: `${(gridBeats / totalBeats) * 100}%` }}
              onClick={pasteMode ? () => onPasteIntoBlock?.(pattern.id) : undefined}
            >
              {/* Bar separators (over the cropped/effective length) */}
              {Array.from({ length: Math.floor(gridBeats / beatsPerBar) + 1 }).map((_, i) => {
                const beat = Math.min(i * beatsPerBar, gridBeats);
                return (
                  <div
                    key={`bar-${i}`}
                    className="absolute top-0 bottom-0 pointer-events-none z-0"
                    style={{ left: `${(beat / gridBeats) * 100}%`, borderLeft: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}
                  />
                );
              })}
              {/* Beat dividers */}
              {Array.from({ length: Math.ceil(gridBeats) }).map((_, i) => {
                if (i === 0 || i % beatsPerBar === 0 || i >= gridBeats) return null;
                return (
                  <div
                    key={`beat-${i}`}
                    className="absolute top-2 bottom-2 pointer-events-none z-0"
                    style={{ left: `${(i / gridBeats) * 100}%`, borderLeft: "1px solid color-mix(in oklch, var(--cocoa-deep) 8%, transparent)" }}
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
                      <div
                        key={`pslot-${itemIdx}`}
                        className={cn(
                          "relative min-w-0 flex items-stretch z-10",
                          !occupied && "border border-dashed border-transparent justify-center",
                        )}
                        style={{ flex: `${basis} ${basis} 0%` }}
                        onClick={(e) => {
                          if (pasteMode) {
                            e.stopPropagation();
                            onPasteIntoBlock?.(pattern.id);
                            return;
                          }
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
                            <div data-chord-keep className="relative flex items-stretch w-full">
                              <ContextMenu>
                              <ContextMenuTrigger asChild>
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
                                  if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                                  if (e.shiftKey) {
                                    e.preventDefault();
                                    onToggleMultiSelected(c.id, pattern.id);
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                                  onSetActiveChordId(null);
                                  onEditChordOpen(pattern.id, c.id);
                                }}
                                onClick={(e) => {
                                  if (Date.now() - justDraggedAtRef.current < 350) return;
                                  if (longPressDidFireRef.current) { longPressDidFireRef.current = false; return; }
                                  e.stopPropagation();
                                  if (pasteMode) {
                                    onPasteIntoBlock?.(pattern.id, c.id);
                                    return;
                                  }
                                  if (e.ctrlKey || e.metaKey || multiSelectModeRef.current) {
                                    onToggleMultiSelected(c.id, pattern.id);
                                    return;
                                  }
                                  if (e.shiftKey || isShiftDownRef.current) {
                                    onShiftSelectChord?.(pattern.id, c.id);
                                    return;
                                  }
                                  setFocusedPattern(pattern.id);
                                  void playChord(displayChord, undefined, c.chord.octave ?? 3);
                                  onChordClick(pattern.id, c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void playChord(displayChord, undefined, c.chord.octave ?? 3);
                                    onChordClick(pattern.id, c.id);
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
                                  touchAction: "pan-y",
                                }}
                              >
                                <span className="font-mono-chord font-semibold text-sm leading-tight truncate max-w-full">
                                  {displayChord.display}
                                </span>
                                <span className="font-mono-chord text-[10px] opacity-70 leading-tight">
                                  {formatBeats(c.lengthBeats)}b
                                </span>
                              </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem onClick={() => onEditChordOpen(pattern.id, c.id)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Replace chord
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() => { removePatternChordsBatch(pattern.id, [c.id]); onSetActiveChordId(null); }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </ContextMenuItem>
                              </ContextMenuContent>
                              </ContextMenu>
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
                              {isActive && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -left-1.5 z-20 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                                  style={{ touchAction: "manipulation" }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onPointerUp={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChordToolbarOpen(true);
                                  }}
                                  aria-label="Edit chord"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {isActive && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 z-30 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
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
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {isActive && (
                                <button
                                  type="button"
                                  className="absolute -bottom-1.5 -left-1.5 z-20 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                                  style={{ touchAction: "manipulation" }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onPointerUp={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditChordOpen(pattern.id, c.id);
                                  }}
                                  aria-label="Open chord editor"
                                >
                                  <ListMusic className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {isActive && (
                                <div
                                  role="slider"
                                  aria-label="Drag to resize chord length"
                                  aria-valuenow={c.lengthBeats}
                                  className="absolute inset-y-0 -right-1 z-20 w-3 cursor-ew-resize rounded-r-md"
                                  style={{ touchAction: "none", background: "color-mix(in oklch, var(--primary) 55%, transparent)" }}
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const grid = (e.currentTarget as HTMLElement).closest("[data-pattern-grid]");
                                    const gridW = grid?.getBoundingClientRect().width ?? 0;
                                    if (gridW <= 0) return;
                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                    resizeDragRef.current = {
                                      chordId: c.id,
                                      startX: e.clientX,
                                      pxPerBeat: gridW / gridBeats,
                                      appliedDelta: 0,
                                    };
                                  }}
                                  onPointerMove={(e) => {
                                    const d = resizeDragRef.current;
                                    if (!d || d.chordId !== c.id) return;
                                    const rawBeats = (e.clientX - d.startX) / d.pxPerBeat;
                                    let snapped = Math.round(rawBeats / LENGTH_STEP) * LENGTH_STEP;
                                    snapped = Math.max(snapped, LENGTH_STEP - c.lengthBeats + d.appliedDelta);
                                    const step = snapped - d.appliedDelta;
                                    if (step !== 0) {
                                      resizePatternChordsWithOverflow(pattern.id, [c.id], step);
                                      d.appliedDelta = snapped;
                                    }
                                  }}
                                  onPointerUp={(e) => {
                                    resizeDragRef.current = null;
                                    try {
                                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                                    } catch { /* noop */ }
                                  }}
                                  onPointerCancel={() => { resizeDragRef.current = null; }}
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>
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



      <SpiceSheet
        open={spiceOpen}
        onOpenChange={setSpiceOpen}
        pattern={pattern}
        blockIndex={blockIndex}
        activeChordId={activeChordId}
        onAuditionChange={setPreviewingSpiceChords}
        onVariationApplied={onVariationApplied}
        headerRef={spiceHeaderRef}
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
  onShiftSelectChord?: (patternId: string, chordId: string) => void;
  onClearMultiSelected: () => void;
  pasteMode?: boolean;
  onPasteIntoBlock?: (patternId: string, afterChordId?: string) => void;
  onAddNewBlockRequest?: (sectionId: string, patternId: string) => void;
  onChordClick: (patternId: string, chordId: string) => void;
  addChordsRef?: React.RefObject<HTMLButtonElement | null>;
  firstBlockRef?: React.RefObject<HTMLDivElement | null>;
  firstSpiceButtonRef?: React.RefObject<HTMLButtonElement | null>;
  firstSpiceHeaderRef?: React.RefObject<HTMLDivElement | null>;
  onFirstBlockVariationApplied?: () => void;
  onFirstSpiceOpenChange?: (open: boolean) => void;
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
  onShiftSelectChord,
  onClearMultiSelected,
  pasteMode,
  onPasteIntoBlock,
  onAddNewBlockRequest,
  onChordClick,
  addChordsRef,
  firstBlockRef,
  firstSpiceButtonRef,
  firstSpiceHeaderRef,
  onFirstBlockVariationApplied,
  onFirstSpiceOpenChange,
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

  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isGlobalPlaying = usePlaybackStore((s) => s.isPlaying);
  const isSectionPlaying = isGlobalPlaying && blocks.some((b) => b.id === playbackCurrent?.patternId);

  const firstSectionChord = useMemo(() => {
    if (!section?.chords.length) return null;
    const blockOrder = new Map(blocks.map((b, i) => [b.id, i]));
    const withPlacement = section.chords.filter((c) => c.progressionPlacement != null);
    if (!withPlacement.length) return null;
    return withPlacement.sort((a, b) => {
      const ao = blockOrder.get(a.progressionPlacement!.patternId) ?? Infinity;
      const bo = blockOrder.get(b.progressionPlacement!.patternId) ?? Infinity;
      if (ao !== bo) return ao - bo;
      return a.progressionPlacement!.startBeat - b.progressionPlacement!.startBeat;
    })[0];
  }, [section?.chords, blocks]);

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
        style={{ color: "oklch(0.3267 0.027 60.1)" }}
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
          disabled={sortMode}
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
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!firstSectionChord}
              onClick={() => {
                if (!firstSectionChord?.progressionPlacement) return;
                usePlaybackStore.getState().setStartFromChord(
                  firstSectionChord.progressionPlacement.patternId,
                  firstSectionChord.id,
                );
                window.dispatchEvent(new Event("lovable:request-play"));
              }}
              className={cn(
                "h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors",
                isSectionPlaying
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[#dad8d2] text-[var(--pill-rest-fg)]/80 hover:text-[var(--pill-rest-fg)] disabled:opacity-40 disabled:cursor-not-allowed",
              )}
              aria-label="Play from this section"
              title="Play from this section"
            >
              <Play className={cn("h-4 w-4", isSectionPlaying && "fill-white")} />
            </button>
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
                <DropdownMenuItem
                  onClick={() => onMoveSection?.(sectionId, -1)}
                  disabled={index === 0}
                >
                  <ArrowUp className="h-4 w-4" /> Move section up
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onMoveSection?.(sectionId, 1)}
                  disabled={index >= totalSections - 1}
                >
                  <ArrowDown className="h-4 w-4" /> Move section down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
                    onChordClick={onChordClick}
                    activeChordId={activeChordId}
                    onSetActiveChordId={onSetActiveChordId}
                    multiSelected={multiSelected}
                    onToggleMultiSelected={onToggleMultiSelected}
                    onShiftSelectChord={onShiftSelectChord}
                    onClearMultiSelected={onClearMultiSelected}
                    pasteMode={pasteMode}
                    onPasteIntoBlock={onPasteIntoBlock}
                    effectiveOffset={effectiveOffset}
                    blockRef={i === 0 ? firstBlockRef : undefined}
                    spiceButtonRef={i === 0 ? firstSpiceButtonRef : undefined}
                    spiceHeaderRef={i === 0 ? firstSpiceHeaderRef : undefined}
                    onVariationApplied={i === 0 ? onFirstBlockVariationApplied : undefined}
                    onSpiceOpenChange={i === 0 ? onFirstSpiceOpenChange : undefined}
                  />
                ) : (
                  <button
                    ref={addChordsRef}
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
              ref={addChordsRef}
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
                onClick={() => {
                  addPatternToSection(sectionId);
                  const freshBlocks = useSongStore.getState().progression.filter(
                    (p) => (p.sectionId ?? p.id) === sectionId,
                  );
                  const newBlock = freshBlocks[freshBlocks.length - 1];
                  if (newBlock) onAddNewBlockRequest?.(sectionId, newBlock.id);
                }}
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
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions" | "recordings" | "voicekey") => void;
  showOnboarding?: boolean;
}

/** Tiny helper that registers the progressions onDragEnd handler with the
 *  global DnD store. Lives inside ProgressionsTab so it has the right closure. */
function ProgressionsDndRegistrar() {
  const setProgressionsHandlers = useDndStore((s) => s.setProgressionsHandlers);
  useEffect(() => {
    setProgressionsHandlers(null);
    return () => setProgressionsHandlers(null);
  }, [setProgressionsHandlers]);
  return null;
}

export function ProgressionsTab({ sortMode = false, onSwitchTab: _onSwitchTab, showOnboarding = true }: ProgressionsTabProps) {
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
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [activeChordId, setActiveChordId] = useState<string | null>(null);
  // Cross-block multi-select: chordId → patternId.
  const [multiSelected, setMultiSelected] = useState<Map<string, string>>(new Map());
  const multiSelectedRef = useRef(multiSelected);
  multiSelectedRef.current = multiSelected;

  const rangeAnchorRef = useRef<{ patternId: string; chordId: string } | null>(null);

  const toggleMultiSelected = useCallback((chordId: string, patternId: string) => {
    rangeAnchorRef.current = { patternId, chordId };
    setMultiSelected((prev) => {
      const next = new Map(prev);
      if (next.has(chordId)) next.delete(chordId);
      else next.set(chordId, patternId);
      return next;
    });
  }, []);

  const rangeSelectProgChords = useCallback((patternId: string, chordId: string) => {
    const pat = progression.find((p) => p.id === patternId);
    if (!pat) return;
    const sectionId = pat.sectionId ?? pat.id;
    const sectionBlocks = progression.filter((p) => (p.sectionId ?? p.id) === sectionId);
    const sec = sections.find((s) => s.id === sectionId);
    const ordered = sectionBlocks.flatMap((b) => {
      const chords = sec ? getPatternChordsViaSSOT(sec, b) : b.chords;
      return [...chords].sort((a, b) => a.startBeat - b.startBeat).map((c) => ({ chordId: c.id, patternId: b.id }));
    });
    const fromId = rangeAnchorRef.current?.chordId ?? activeChordId;
    if (!fromId) {
      toggleMultiSelected(chordId, patternId);
      return;
    }
    const fromIdx = ordered.findIndex((x) => x.chordId === fromId);
    const toIdx = ordered.findIndex((x) => x.chordId === chordId);
    if (fromIdx < 0 || toIdx < 0) {
      toggleMultiSelected(chordId, patternId);
      return;
    }
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    setMultiSelected((prev) => {
      const next = new Map(prev);
      for (let i = lo; i <= hi; i++) {
        next.set(ordered[i].chordId, ordered[i].patternId);
      }
      return next;
    });
  }, [progression, sections, activeChordId, toggleMultiSelected]);

  const chordClipboard = useUIStore((s) => s.chordClipboard);
  const setChordClipboard = useUIStore((s) => s.setChordClipboard);
  // Paste mode: after pressing Paste, blocks glow and the next chord/block click
  // drops the clipboard chords there (non-destructively).
  const [pasteMode, setPasteMode] = useState(false);

  const handleCopyChords = useCallback(() => {
    let copied: ClipboardChord[] = [];
    if (multiSelected.size > 0) {
      const items: { chord: ClipboardChord; startBeat: number }[] = [];
      for (const [cid, pid] of multiSelected) {
        const pat = progression.find((p) => p.id === pid);
        const sec = pat ? sections.find((s) => s.id === (pat.sectionId ?? pat.id)) : null;
        const chords = sec && pat ? getPatternChordsViaSSOT(sec, pat) : (pat?.chords ?? []);
        const c = chords.find((x) => x.id === cid);
        if (c) {
          const lyricless = !sec?.chords.find((x) => x.id === cid)?.lyricsPlacement;
          items.push({ chord: { chord: c.chord, lengthBeats: c.lengthBeats, lyricless }, startBeat: c.startBeat });
        }
      }
      copied = items.sort((a, b) => a.startBeat - b.startBeat).map((x) => x.chord);
    } else if (activeChordId) {
      for (const p of progression) {
        const sec = sections.find((s) => s.id === (p.sectionId ?? p.id));
        const chords = sec ? getPatternChordsViaSSOT(sec, p) : p.chords;
        const c = chords.find((x) => x.id === activeChordId);
        if (c) {
          const lyricless = !sec?.chords.find((x) => x.id === activeChordId)?.lyricsPlacement;
          copied = [{ chord: c.chord, lengthBeats: c.lengthBeats, lyricless }];
          break;
        }
      }
    }
    if (copied.length > 0) setChordClipboard(copied);
  }, [multiSelected, activeChordId, progression, sections, setChordClipboard]);

  const handlePasteRequest = useCallback(() => {
    if (chordClipboard.length === 0) return;
    setPasteMode(true);
  }, [chordClipboard]);

  const handleCutChords = useCallback(() => {
    handleCopyChords();
    const store = useSongStore.getState();
    if (multiSelected.size > 0) {
      const byPattern = new Map<string, string[]>();
      for (const [cid, pid] of multiSelected) {
        const arr = byPattern.get(pid) ?? [];
        arr.push(cid);
        byPattern.set(pid, arr);
      }
      for (const [pid, cids] of byPattern) store.removePatternChordsBatch(pid, cids);
      setMultiSelected(new Map());
      setActiveChordId(null);
      return;
    }
    if (activeChordId) {
      for (const p of store.progression) {
        const sec = store.sections.find((s) => s.id === (p.sectionId ?? p.id));
        const chords = sec ? getPatternChordsViaSSOT(sec, p) : p.chords;
        if (chords.some((c) => c.id === activeChordId)) {
          store.removePatternChordsBatch(p.id, [activeChordId]);
          break;
        }
      }
      setActiveChordId(null);
    }
  }, [handleCopyChords, multiSelected, activeChordId]);

  // Drop the clipboard chords into a block, non-destructively. Clicking a chord
  // inserts after it; clicking empty block area appends. addChordToPatternSlot
  // handles overflow into continuation blocks; lengths are then forced exact.
  const handlePasteIntoBlock = useCallback(
    (patternId: string, afterChordId?: string) => {
      if (chordClipboard.length === 0) {
        setPasteMode(false);
        return;
      }
      const store = useSongStore.getState();
      const pat = store.progression.find((p) => p.id === patternId);
      if (!pat) {
        setPasteMode(false);
        return;
      }
      const sectionId = pat.sectionId ?? pat.id;
      const sec = store.sections.find((s) => s.id === sectionId);
      const ordered = (sec ? getPatternChordsViaSSOT(sec, pat) : pat.chords)
        .slice()
        .sort((a, b) => a.startBeat - b.startBeat);
      let insertIdx = ordered.length;
      if (afterChordId) {
        const idx = ordered.findIndex((c) => c.id === afterChordId);
        if (idx >= 0) insertIdx = idx + 1;
      }
      let knownIds = new Set(
        store.sections.find((s) => s.id === sectionId)?.chords.map((c) => c.id) ?? [],
      );
      chordClipboard.forEach((c, i) => {
        store.addChordToPatternSlot(patternId, c.chord, insertIdx + i, c.lengthBeats, c.lyricless);
        const fresh = useSongStore.getState().sections.find((s) => s.id === sectionId);
        const added = fresh?.chords.find((x) => !knownIds.has(x.id) && x.progressionPlacement);
        if (added?.progressionPlacement && c.lengthBeats != null) {
          store.setPatternChordLength(added.progressionPlacement.patternId, added.id, c.lengthBeats);
        }
        knownIds = new Set(
          useSongStore.getState().sections.find((s) => s.id === sectionId)?.chords.map((x) => x.id) ?? [],
        );
      });
      // Repack the lyric mirror so the Write row reflects SSOT (= progression)
      // order. addChordToPatternSlot lands each lyric anchor on the leftmost free
      // slot regardless of beat position; without this the Write view shows the
      // pasted chords out of order (and doesn't spill overflow onto continuation
      // rows the way the lyrics-tab paste path does).
      store.autoLayoutSection(sectionId, window.innerWidth, 28);
      setPasteMode(false);
      setActiveChordId(null);
      setMultiSelected(new Map());
    },
    [chordClipboard],
  );

  const sortAnimatingRef = useRef(false);
  // Moves requested while an animation is in flight are queued and applied
  // (without re-animating) once it finishes, so rapid clicks aren't dropped.
  const pendingMovesRef = useRef<Array<{ id: string; direction: -1 | 1 }>>([]);

  const handleAnimatedMoveSection = useCallback((id: string, direction: -1 | 1) => {
    if (sortAnimatingRef.current) {
      pendingMovesRef.current.push({ id, direction });
      return;
    }
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
      const queued = pendingMovesRef.current;
      pendingMovesRef.current = [];
      for (const m of queued) moveSection(m.id, m.direction);
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
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pasteMode) {
        setPasteMode(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "c" || e.key === "C") {
        if (activeChordId || multiSelected.size > 0) {
          e.preventDefault();
          handleCopyChords();
        }
      } else if (e.key === "x" || e.key === "X") {
        if (activeChordId || multiSelected.size > 0) {
          e.preventDefault();
          handleCutChords();
        }
      } else if (e.key === "v" || e.key === "V") {
        if (chordClipboard.length > 0) {
          e.preventDefault();
          handlePasteRequest();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeChordId, multiSelected, chordClipboard, pasteMode, handleCopyChords, handleCutChords, handlePasteRequest]);

  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);
  const [chordEditor, setChordEditor] = useState<{ patternId: string; chordId: string; sectionId: string } | null>(null);
  const setChordEditorRef = useRef(setChordEditor);
  setChordEditorRef.current = setChordEditor;

  // ArrowUp / ArrowDown moves the active chord into the block above or below.
  useEffect(() => {
    if (!activeChordId || multiSelected.size > 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const dir = (e.key === "ArrowUp" ? -1 : 1) as -1 | 1;
      const { sections: s, progression: prog } = useSongStore.getState();
      const orderedBlocks = s.flatMap((sec) => prog.filter((p) => (p.sectionId ?? p.id) === sec.id));
      const patternOfActive = orderedBlocks.find((p) => {
        const owner = s.find((sec) => sec.id === (p.sectionId ?? p.id));
        return (owner ? getPatternChordsViaSSOT(owner, p) : p.chords).some((c) => c.id === activeChordId);
      });
      if (!patternOfActive) return;
      const blockIdx = orderedBlocks.findIndex((b) => b.id === patternOfActive.id);
      const adjBlock = orderedBlocks[blockIdx + dir];
      if (!adjBlock) return;
      const owner = s.find((sec) => sec.id === (patternOfActive.sectionId ?? patternOfActive.id));
      const chords = owner ? getPatternChordsViaSSOT(owner, patternOfActive) : patternOfActive.chords;
      const chordIdx = chords.findIndex((c) => c.id === activeChordId);
      const adjOwner = s.find((sec) => sec.id === (adjBlock.sectionId ?? adjBlock.id));
      const adjChords = adjOwner ? getPatternChordsViaSSOT(adjOwner, adjBlock) : adjBlock.chords;
      useSongStore.getState().movePatternChordToPatternAt(
        patternOfActive.id,
        adjBlock.id,
        activeChordId,
        Math.min(Math.max(chordIdx, 0), adjChords.length),
      );
      // Keep chordEditor tracking the moved chord in its new block
      setChordEditorRef.current((prev) =>
        prev?.chordId === activeChordId
          ? { patternId: adjBlock.id, chordId: activeChordId, sectionId: adjBlock.sectionId ?? adjBlock.id }
          : prev,
      );
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChordId, multiSelected.size]);

  // Close the chord editor whenever the active chord is cleared (delete, escape, click-away).
  useEffect(() => {
    if (!activeChordId) setChordEditorRef.current(null);
  }, [activeChordId]);

  const [patternAddSlot, setPatternAddSlot] = useState<{ patternId: string; atBeat: number; sectionId: string } | null>(null);

  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const { enabled: onboardingEnabled, progressionsStep, setProgressionsStep, lyricsStep, setLyricsStep, showNewSongPrompt, dismissNewSongPrompt, disable: disableOnboarding, dismissedKey, dismissCoachMark } = useOnboardingStore();
  const canShowCoachMark = onboardingEnabled && showOnboarding;
  const progressionsRootRef = useRef<HTMLDivElement>(null);
  const addChordsRef = useRef<HTMLButtonElement | null>(null);
  const firstBlockRef = useRef<HTMLDivElement | null>(null);
  const spiceButtonRef = useRef<HTMLButtonElement | null>(null);
  const chordPickerHeaderRef = useRef<HTMLDivElement | null>(null);
  const focusedEditorHeaderRef = useRef<HTMLDivElement | null>(null);
  const spiceHeaderRef = useRef<HTMLDivElement | null>(null);
  const [firstSpiceOpen, setFirstSpiceOpen] = useState(false);
  const totalChordCount = useMemo(() => sections.reduce((acc, s) => acc + s.chords.length, 0), [sections]);
  const totalChordCountRef = useRef(totalChordCount);
  useEffect(() => {
    totalChordCountRef.current = totalChordCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalChordCount]);

  useEffect(() => {
    if (
      onboardingEnabled &&
      progressionsStep === 1 &&
      (picker !== null || patternAddSlot !== null || chordEditor !== null)
    ) {
      setProgressionsStep(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, patternAddSlot, chordEditor]);

  // Clicking "Add block" creates the block immediately and opens an editor to
  // fill it. If that editor is torn down without a chord being added — exactly
  // what a screen rotation or the tab returning from standby does to an open
  // sheet — the empty block lingers and renders an "Add chords" placeholder
  // right next to "Add block". Prune empty blocks that sit beside a filled
  // sibling (so the section keeps its chords), skipping any block an editor is
  // currently targeting. Runs on mount, whenever an editor closes, and when the
  // tab becomes visible again — clearing both existing strays and new ones.
  useEffect(() => {
    const prune = () => {
      if (document.hidden) return;
      const activeId = picker?.patternId ?? patternAddSlot?.patternId ?? chordEditor?.patternId ?? null;
      const prog = useSongStore.getState().progression;
      const bySection = new Map<string, typeof prog>();
      for (const p of prog) {
        const sid = p.sectionId ?? p.id;
        const arr = bySection.get(sid) ?? [];
        arr.push(p);
        bySection.set(sid, arr);
      }
      const remove = useSongStore.getState().removePatternBlock;
      for (const group of bySection.values()) {
        if (!group.some((b) => b.chords.length > 0)) continue;
        for (const b of group) {
          if (b.chords.length === 0 && b.id !== activeId) remove(b.id);
        }
      }
    };
    prune();
    document.addEventListener("visibilitychange", prune);
    return () => document.removeEventListener("visibilitychange", prune);
  }, [picker, patternAddSlot, chordEditor]);

  const sawEditorOpenAtStep3Ref = useRef(false);
  useEffect(() => {
    if (!onboardingEnabled) return;
    if (progressionsStep !== 3) {
      sawEditorOpenAtStep3Ref.current = false;
      return;
    }
    const editorOpen = chordEditor !== null || (picker !== null && !!picker.replaceChordId);
    if (editorOpen) {
      sawEditorOpenAtStep3Ref.current = true;
    } else if (sawEditorOpenAtStep3Ref.current) {
      sawEditorOpenAtStep3Ref.current = false;
      setProgressionsStep(4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordEditor, picker, progressionsStep, onboardingEnabled]);

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

  const toolbarContext = useMemo(() => {
    const orderedBlocks = sections.flatMap((sec) =>
      progression.filter((p) => (p.sectionId ?? p.id) === sec.id),
    );

    let activePatternId: string | null = null;
    let activeChordData: { id: string; display: string; octave?: number; lengthBeats?: number } | null = null;
    let activeChordIdx = -1;
    let chordsInActiveBlock: ReturnType<typeof getPatternChordsViaSSOT> = [];

    if (activeChordId) {
      outer: for (const sec of sections) {
        for (const pat of progression.filter((p) => (p.sectionId ?? p.id) === sec.id)) {
          const chords = getPatternChordsViaSSOT(sec, pat);
          const idx = chords.findIndex((c) => c.id === activeChordId);
          if (idx >= 0) {
            activePatternId = pat.id;
            activeChordIdx = idx;
            chordsInActiveBlock = chords;
            const chord = chords[idx];
            activeChordData = { id: chord.id, display: chord.chord.display, octave: chord.chord.octave, lengthBeats: chord.lengthBeats };
            break outer;
          }
        }
      }
    }

    const blockIdx = activePatternId ? orderedBlocks.findIndex((b) => b.id === activePatternId) : -1;
    const canMoveUp = blockIdx > 0;
    const canMoveDown = blockIdx >= 0 && blockIdx < orderedBlocks.length - 1;
    const canShiftLeft = multiSelected.size > 0 || activeChordIdx > 0;
    const canShiftRight = multiSelected.size > 0 || (activeChordIdx >= 0 && activeChordIdx < chordsInActiveBlock.length - 1);

    const selectedOctaves: number[] = [];
    for (const [chordId, patternId] of multiSelected) {
      const pat = progression.find((p) => p.id === patternId);
      const sec = pat ? sections.find((s) => s.id === (pat.sectionId ?? pat.id)) : null;
      if (sec && pat) {
        const chord = getPatternChordsViaSSOT(sec, pat).find((c) => c.id === chordId);
        if (chord?.chord.octave != null) selectedOctaves.push(chord.chord.octave);
      }
    }

    return { activeChordData, activePatternId, canMoveUp, canMoveDown, canShiftLeft, canShiftRight, selectedOctaves };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChordId, multiSelected, sections, progression]);

  const handleChordClick = (_patternId: string, chordId: string) => {
    // Tapping a chord only selects it — the pencil overlay opens the editor.
    if (activeChordId === chordId) {
      setActiveChordId(null);
      return;
    }
    setActiveChordId(chordId);
  };

  // Tapping anywhere outside a chord, its overlay icons, the chord-editing
  // toolbar, or any open menu/sheet clears the active-chord selection.
  useEffect(() => {
    if (!activeChordId) return;
    const onPointerDown = (e: PointerEvent) => {
      // The full-screen chord editor is a modal that owns its own dismissal
      // (backdrop + Done button). A scroll/drag inside it still fires a
      // document pointerdown — ignore it so it doesn't clear the active chord
      // and tear the editor down mid-scroll.
      if (useUIStore.getState().focusedEditorOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-chord-keep],[role="dialog"],[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper]')) return;
      setActiveChordId(null);
      setMultiSelected(new Map());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [activeChordId]);

  // Group pattern blocks by sectionId, preserving section order from `sections`.
  // Sections without any pattern block still render: a lyrics-only section
  // (e.g. pasted lyrics, no chords yet) must show its "Add chords" empty state
  // here rather than silently disappearing from Arrange. The placeholder's
  // onClick creates the missing block on demand.
  const groupedSections = sections
    .map((sec) => ({
      section: sec,
      blocks: progression.filter((p) => (p.sectionId ?? p.id) === sec.id),
    }));

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
      setPicker(null);
    } else {
      // picker.atBeat is reused as a slot index by the new slot grid.
      useSongStore.getState().addChordToPatternSlot(
        picker.patternId,
        chord,
        picker.atBeat,
        !isDesktop ? 4 : undefined,
      );
      // Advance the slot so the next chord typed lands to the right of this one
      // instead of pushing this one rightward.
      setPicker((p) => (p ? { ...p, atBeat: p.atBeat + 1 } : p));
    }
  };

  const requestDeleteSection = (sectionId: string) => {
    const undo = useSongStore.getState().undo;
    removeSection(sectionId);
    toast({
      title: "Section deleted",
      description: "Removed the section and its lyric linkage.",
      action: (
        <Button variant="outline" size="sm" onClick={() => undo()}>
          Undo
        </Button>
      ),
      duration: 6000,
    });
  };

  const requestDeleteBlock = (patternId: string) => {
    const undo = useSongStore.getState().undo;
    removePatternBlock(patternId);
    toast({
      title: "Block deleted",
      description: "Removed this pattern block.",
      action: (
        <Button variant="outline" size="sm" onClick={() => undo()}>
          Undo
        </Button>
      ),
      duration: 6000,
    });
  };

  return (
    <div
      className="relative space-y-4 pb-24"
      ref={progressionsRootRef}
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
      <ProgressionsDndRegistrar />

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
          onChordClick={handleChordClick}
          sortMode={sortMode}
          onMoveSection={handleAnimatedMoveSection}
          activeChordId={activeChordId}
          onSetActiveChordId={setActiveChordId}
          multiSelected={multiSelected}
          onToggleMultiSelected={toggleMultiSelected}
          onShiftSelectChord={rangeSelectProgChords}
          onClearMultiSelected={() => setMultiSelected(new Map())}
          pasteMode={pasteMode}
          onPasteIntoBlock={handlePasteIntoBlock}
          addChordsRef={i === 0 ? addChordsRef : undefined}
          firstBlockRef={i === 0 ? firstBlockRef : undefined}
          firstSpiceButtonRef={i === 0 ? spiceButtonRef : undefined}
          firstSpiceHeaderRef={i === 0 ? spiceHeaderRef : undefined}
          onFirstBlockVariationApplied={i === 0 ? () => { if (onboardingEnabled && progressionsStep === 4) setProgressionsStep(5); } : undefined}
          onFirstSpiceOpenChange={i === 0 ? setFirstSpiceOpen : undefined}
          onAddNewBlockRequest={(sid, patternId) => {
            if (isDesktop) {
              setPicker({ patternId, atBeat: 0, replaceChordId: undefined });
            } else {
              setPatternAddSlot({ sectionId: sid, patternId, atBeat: 0 });
            }
          }}
        />
      ))}

      {/* Cross-block multi-select toolbar (desktop). */}
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

      {canShowCoachMark && progressionsStep === 1 && dismissedKey !== "progressions-1" && (
        <AnchoredCoachMark
          anchorRef={addChordsRef}
          gap={16}
          step="3/7"
          message="Tap Add Chords to begin!"
          arrowSide="top"
          onDismiss={() => dismissCoachMark("progressions-1")}
        />
      )}
      {canShowCoachMark && progressionsStep === 2 && dismissedKey !== "progressions-2" && (
        picker !== null ? (
          <AnchoredCoachMark
            anchorRef={chordPickerHeaderRef}
            anchorEdge="top"
            gap={8}
            step="4/7"
            message="Pick a chord or add a progression. Try adding the Royal Road Progression."
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-2")}
          />
        ) : (patternAddSlot !== null || chordEditor !== null) ? (
          <AnchoredCoachMark
            anchorRef={focusedEditorHeaderRef}
            anchorEdge="top"
            gap={8}
            step="4/7"
            message="Pick a chord or add a progression. Try adding the Royal Road Progression."
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-2")}
          />
        ) : (
          <AnchoredCoachMark
            anchorRef={progressionsRootRef}
            viewportBottom={380}
            step="4/7"
            message="Pick a chord or add a progression. Try adding the Royal Road Progression."
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-2")}
          />
        )
      )}
      {canShowCoachMark && progressionsStep === 3 && dismissedKey !== "progressions-3" && (() => {
        const editorOpen = chordEditor !== null || (picker !== null && !!picker.replaceChordId);
        const modalHeaderRef = chordEditor !== null ? focusedEditorHeaderRef : chordPickerHeaderRef;
        return editorOpen ? (
          <AnchoredCoachMark
            anchorRef={modalHeaderRef}
            anchorEdge="top"
            gap={8}
            step="5/7"
            message="Replace with one of these chords!"
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-3")}
          />
        ) : (
          <AnchoredCoachMark
            anchorRef={firstBlockRef}
            gap={44}
            anchorEdge="top"
            step="5/7"
            message="Right click or tap & hold a chord chip to replace it"
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-3")}
          />
        );
      })()}
      {canShowCoachMark && progressionsStep === 4 && dismissedKey !== "progressions-4" && (
        firstSpiceOpen ? (
          <AnchoredCoachMark
            anchorRef={spiceHeaderRef}
            gap={8}
            anchorEdge="top"
            step="6/7"
            message="Press the ✨Add Spice button to explore different chord variations! Try the Dramatic Variation"
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-4")}
          />
        ) : (
          <AnchoredCoachMark
            anchorRef={spiceButtonRef}
            gap={16}
            anchorEdge="top"
            step="6/7"
            message="Press the ✨Add Spice button to explore different chord variations! Try the Dramatic Variation"
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("progressions-4")}
          />
        )
      )}
      {canShowCoachMark && progressionsStep === 5 && dismissedKey !== "progressions-5" && createPortal(
        <div
          className="pointer-events-auto"
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 9999 }}
        >
          <OnboardingCoachMark
            step="7/7"
            message="That concludes the Progressions tutorial. Check out the Lyrics tutorial by pressing the Lyrics tab here!"
            actionLabel="Finish"
            onAction={() => {
              setProgressionsStep(6);
              if (lyricsStep === 0 || lyricsStep >= 6) setLyricsStep(1);
              dismissNewSongPrompt();
            }}
            onDismiss={() => dismissCoachMark("progressions-5")}
          />
        </div>,
        document.body,
      )}

      {onboardingEnabled && showNewSongPrompt && (
        <div className="fixed bottom-14 left-0 right-0 z-50">
          <div
            className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 rounded-t-xl"
            style={{ background: "var(--paper-card)", borderTop: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-ui, 'Nunito', sans-serif)" }}>
              You're getting the hang of it! Turn off the tutorial?
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className="btn-sculpt-amber inline-flex items-center rounded-lg px-3 h-7 text-xs font-semibold"
                onClick={() => { disableOnboarding(); dismissNewSongPrompt(); }}
              >
                Turn off
              </button>
              <button
                type="button"
                className="btn-sculpt-cream inline-flex items-center rounded-lg px-3 h-7 text-xs font-semibold"
                onClick={dismissNewSongPrompt}
              >
                Keep it on
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="max-w-6xl mx-auto">
          {addSectionOpen && (
            <div
              className="px-4 pt-4 pb-4"
              style={{ background: "color-mix(in oklch, var(--ink-soft) 40%, transparent)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", borderTop: "1px solid color-mix(in oklch, var(--border) 60%, transparent)" }}
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                {(["verse", "chorus", "pre-chorus", "bridge", "intro", "outro"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { addSection(t); setAddSectionOpen(false); }}
                    className="btn-sculpt-cocoa inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold capitalize"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t === "pre-chorus" ? "Pre-Chorus" : t}
                  </button>
                ))}
                <button
                  onClick={() => { addSection("custom"); setAddSectionOpen(false); }}
                  className="btn-sculpt-cocoa inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" /> Custom…
                </button>
              </div>
            </div>
          )}
          <div
            className="py-3 text-center cursor-pointer"
            style={{ background: "color-mix(in oklch, var(--ink-soft) 40%, transparent)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
            onClick={() => setAddSectionOpen((o) => !o)}
          >
            <span
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
          </div>
        </div>
      </div>

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => { if (!o) setPicker(null); }}
        onPick={handlePick}
        headerRef={chordPickerHeaderRef}
        onPickBatch={(chords) => {
          if (!picker || picker.replaceChordId) return;
          const { addChordToPatternSlot } = useSongStore.getState();
          chords.forEach((c, i) =>
            addChordToPatternSlot(picker.patternId, c, picker.atBeat + i, !isDesktop ? 4 : undefined),
          );
          if (onboardingEnabled && progressionsStep === 2) setProgressionsStep(3);
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
          onClose={() => setChordEditor(null)}
          headerRef={focusedEditorHeaderRef}
        />
      )}

      {patternAddSlot && (
        <FocusedChordEditor
          mode="progression-add"
          sectionId={patternAddSlot.sectionId}
          patternId={patternAddSlot.patternId}
          atBeat={patternAddSlot.atBeat}
          onClose={() => setPatternAddSlot(null)}
          headerRef={focusedEditorHeaderRef}
        />
      )}

      {(activeChordId !== null || multiSelected.size > 0 || pasteMode) && (
        <FloatingChordToolbar
          mode="progression"
          hideTrigger
          autoExpandOnContext={false}
          activeChord={toolbarContext.activeChordData}
          selectedCount={multiSelected.size}
          selectedOctaves={toolbarContext.selectedOctaves}
          canShiftLeft={toolbarContext.canShiftLeft}
          canShiftRight={toolbarContext.canShiftRight}
          onShift={(dir) => {
            if (multiSelected.size > 0) { handleMultiShift(dir); return; }
            if (!activeChordId || !toolbarContext.activePatternId) return;
            movePatternChord(toolbarContext.activePatternId, activeChordId, dir);
          }}
          onMoveVertical={(dir) => {
            if (!activeChordId) return;
            const { sections: s, progression: prog } = useSongStore.getState();
            const orderedBlocks = s.flatMap((sec) => prog.filter((p) => (p.sectionId ?? p.id) === sec.id));
            const patternOfActive = orderedBlocks.find((p) => {
              const owner = s.find((sec) => sec.id === (p.sectionId ?? p.id));
              return (owner ? getPatternChordsViaSSOT(owner, p) : p.chords).some((c) => c.id === activeChordId);
            });
            if (!patternOfActive) return;
            const bIdx = orderedBlocks.findIndex((b) => b.id === patternOfActive.id);
            const adjBlock = orderedBlocks[bIdx + dir];
            if (!adjBlock) return;
            const adjOwner = s.find((sec) => sec.id === (adjBlock.sectionId ?? adjBlock.id));
            const adjChords = adjOwner ? getPatternChordsViaSSOT(adjOwner, adjBlock) : adjBlock.chords;
            useSongStore.getState().movePatternChordToPatternAt(
              patternOfActive.id, adjBlock.id, activeChordId,
              adjChords.length,
            );
            setChordEditorRef.current((prev) =>
              prev?.chordId === activeChordId
                ? { patternId: adjBlock.id, chordId: activeChordId, sectionId: adjBlock.sectionId ?? adjBlock.id }
                : prev,
            );
          }}
          canMoveUp={toolbarContext.canMoveUp}
          canMoveDown={toolbarContext.canMoveDown}
          onResize={(delta) => {
            if (multiSelected.size > 0) { handleMultiResize(delta); return; }
            if (!activeChordId || !toolbarContext.activePatternId) return;
            resizePatternChordsWithOverflow(toolbarContext.activePatternId, [activeChordId], delta);
          }}
          onOctaveChange={(oct) => {
            if (multiSelected.size > 0) {
              const byPattern = new Map<string, string[]>();
              for (const [cid, pid] of multiSelected) {
                const arr = byPattern.get(pid) ?? [];
                arr.push(cid);
                byPattern.set(pid, arr);
              }
              for (const [pid, cids] of byPattern) bulkSetChordOctave(pid, cids, oct);
              return;
            }
            if (!activeChordId || !toolbarContext.activePatternId) return;
            const pat = progression.find((p) => p.id === toolbarContext.activePatternId);
            const chord = pat?.chords.find((c) => c.id === activeChordId);
            if (!chord) return;
            updatePatternChord(toolbarContext.activePatternId, activeChordId, { chord: { ...chord.chord, octave: oct } });
          }}
          onSelectAll={() => {
            if (!toolbarContext.activePatternId) return;
            const pat = progression.find((p) => p.id === toolbarContext.activePatternId);
            const sec = pat ? sections.find((s) => s.id === (pat.sectionId ?? pat.id)) : null;
            const chords = sec && pat ? getPatternChordsViaSSOT(sec, pat) : (pat?.chords ?? []);
            setMultiSelected(new Map(chords.map((c) => [c.id, toolbarContext.activePatternId!])));
          }}
          onClearAll={() => setMultiSelected(new Map())}
          onEnterMultiSelect={() => {
            if (activeChordId && toolbarContext.activePatternId) {
              setMultiSelected((prev) => {
                const next = new Map(prev);
                next.set(activeChordId, toolbarContext.activePatternId!);
                return next;
              });
            }
          }}
          onDuplicate={() => {
            const { sections: s, progression: prog, addChordToPatternSlot } = useSongStore.getState();
            const affectedSections = new Set<string>();
            const dupOne = (patternId: string, chordId: string) => {
              const pat = prog.find((p) => p.id === patternId);
              const sec = pat ? s.find((x) => x.id === (pat.sectionId ?? pat.id)) : null;
              if (!sec || !pat) return;
              const chords = getPatternChordsViaSSOT(sec, pat);
              const idx = chords.findIndex((c) => c.id === chordId);
              if (idx < 0) return;
              const c = chords[idx];
              // Preserve a progression-only chord's lyricless state in its copy.
              const lyricless = !sec.chords.find((x) => x.id === chordId)?.lyricsPlacement;
              addChordToPatternSlot(patternId, c.chord, idx + 1, c.lengthBeats, lyricless);
              affectedSections.add(sec.id);
            };
            if (multiSelected.size > 0) {
              const byPattern = new Map<string, string[]>();
              for (const [cid, pid] of multiSelected) {
                const arr = byPattern.get(pid) ?? [];
                arr.push(cid);
                byPattern.set(pid, arr);
              }
              for (const [pid, cids] of byPattern) {
                const pat = prog.find((p) => p.id === pid);
                const sec = pat ? s.find((x) => x.id === (pat.sectionId ?? pat.id)) : null;
                if (!sec || !pat) continue;
                const order = getPatternChordsViaSSOT(sec, pat).map((c) => c.id);
                // Insert from the rightmost selection first so earlier indices
                // stay valid as copies shift later chords rightward.
                [...cids]
                  .sort((a, b) => order.indexOf(b) - order.indexOf(a))
                  .forEach((cid) => dupOne(pid, cid));
              }
            } else if (activeChordId && toolbarContext.activePatternId) {
              dupOne(toolbarContext.activePatternId, activeChordId);
            }
            // Repack the lyric mirror(s) so the Write row follows SSOT order, the
            // same as the paste path. addChordToPatternSlot lands the lyric anchor
            // on the leftmost free slot, which otherwise leaves the duplicate out
            // of order in the Write view.
            const { autoLayoutSection } = useSongStore.getState();
            for (const secId of affectedSections) {
              autoLayoutSection(secId, window.innerWidth, 28);
            }
          }}
          onDelete={() => {
            if (multiSelected.size > 0) {
              const byPattern = new Map<string, string[]>();
              for (const [cid, pid] of multiSelected) {
                const arr = byPattern.get(pid) ?? [];
                arr.push(cid);
                byPattern.set(pid, arr);
              }
              const removeBatch = useSongStore.getState().removePatternChordsBatch;
              for (const [pid, cids] of byPattern) removeBatch(pid, cids);
              setMultiSelected(new Map());
              setActiveChordId(null);
              return;
            }
            if (!activeChordId || !toolbarContext.activePatternId) return;
            useSongStore.getState().removePatternChordsBatch(toolbarContext.activePatternId, [activeChordId]);
            setActiveChordId(null);
          }}
          onCopy={handleCopyChords}
          onCut={handleCutChords}
          canCut={activeChordId !== null || multiSelected.size > 0}
          canPaste={chordClipboard.length > 0}
          onPaste={handlePasteRequest}
          pasteMode={pasteMode}
          onCancelPaste={() => setPasteMode(false)}
          onExitEdit={() => { setActiveChordId(null); setMultiSelected(new Map()); }}
        />
      )}

      <WhyThisChordSheet />
    </div>
  );
}
