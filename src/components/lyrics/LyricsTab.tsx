import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import {
  useSongStore,
  getSectionDisplayName,
  CHORD_ROW_SLOTS,
  type LyricLine,
  type Section,
  type SectionType,
  type ChordAnchor,
} from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { parseChord, ChordSymbol } from "@/lib/music/chords";
import { playChord } from "@/lib/music/audio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Copy,
  ArrowUp,
  ArrowDown,
  Pencil,
  MessageSquare,
  ClipboardPaste,
  Scissors,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { SECTION_COLOR_KEYS, sectionTintStyle } from "@/components/section/SectionColorPicker";
import { useDndSelection } from "@/hooks/use-dnd-selection";
import { BasketBar } from "@/components/basket/BasketBar";

// Module-scoped chord clipboard (cut/copy/paste across rows). We keep the same
// shape as before so OS-clipboard chord parsing still works the same way.
type ChordClip = { chord: ChordSymbol; relCol: number; widthCh: number };
let chordClipboard: ChordClip[] = [];

function parseChordTextToClips(text: string): ChordClip[] {
  const tokens = text.split(/[\s,;|\n\r\t]+/).map((t) => t.trim()).filter(Boolean);
  const clips: ChordClip[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    const c = parseChord(tok);
    if (!c) continue;
    const w = Math.max(1, c.display.length) + 1;
    clips.push({ chord: c, relCol: cursor, widthCh: w });
    cursor += w;
  }
  return clips;
}

const SECTION_TYPES: SectionType[] = ["verse", "chorus", "bridge", "intro", "outro", "pre-chorus", "custom"];

// Used by sortAnchors-style fallbacks during legacy reads.
const slotOf = (a: ChordAnchor): number =>
  a.slotIndex ?? a.wordIndex ?? a.chordCol ?? a.offset ?? 0;

/** Build a slot → chord map for one line. Slots without a chord map to undefined. */
function chordsBySlot(line: LyricLine): (ChordAnchor | undefined)[] {
  const out: (ChordAnchor | undefined)[] = new Array(CHORD_ROW_SLOTS).fill(undefined);
  line.chords.forEach((c) => {
    const s = c.slotIndex;
    if (s != null && s >= 0 && s < CHORD_ROW_SLOTS) out[s] = c;
  });
  return out;
}

// =============================================================================
//                                LineRow
// =============================================================================

interface LineRowProps {
  sectionId: string;
  line: LyricLine;
  active?: boolean;
  isFirst: boolean;
  onAddLineAfter: () => string | void;
  onMergeUp: (kind: "lyric" | "chord") => void;
  onPickerOpen: (lineId: string, slotIndex: number, anchorId?: string) => void;
  /** Selection state lives in the section card so cross-row drags work. */
  selection: ReturnType<typeof useDndSelection<string>>;
  /** Notify parent which row is "active" for picker purposes. */
  onChordFocus: (lineId: string) => void;
  /** Currently-dragging anchor ids (so chips drop under the moving ghost). */
  draggingIds: Set<string>;
  /** True while ANY pangea drag is in flight (used for slot outline visuals). */
  isAnyDragging: boolean;
}

function LineRow({
  sectionId,
  line,
  active,
  onAddLineAfter,
  onMergeUp,
  onPickerOpen,
  selection,
  onChordFocus,
  draggingIds,
  isAnyDragging,
}: LineRowProps) {
  const {
    setLineText,
    removeChordAnchorsBatch,
    pasteChordsAt,
    moveChordToSlot,
    placeChordInSlot,
    undo,
    redo,
  } = useSongStore();
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setFocusedPattern = usePlaybackStore((s) => s.setFocusedPattern);
  const playingAnchorId = isPlaying && playbackCurrent?.mirrorId ? playbackCurrent.mirrorId : null;

  const lyricInputRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-resize lyric textarea.
  useLayoutEffect(() => {
    const ta = lyricInputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [line.text]);

  // Scroll active row into view (handles mobile keyboard appearing).
  useEffect(() => {
    if (!active || !rowRef.current) return;
    const el = rowRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const scrollIntoView = () => {
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      const targetTop = (vv?.offsetTop ?? 0) + 140;
      const delta = rect.top - targetTop;
      if (Math.abs(delta) < 2) return;
      window.scrollBy({ top: delta, behavior: "smooth" });
    };
    scrollIntoView();
    const settle = window.setTimeout(scrollIntoView, 200);
    if (vv) {
      vv.addEventListener("resize", scrollIntoView);
      vv.addEventListener("scroll", scrollIntoView);
    }
    return () => {
      window.clearTimeout(settle);
      if (vv) {
        vv.removeEventListener("resize", scrollIntoView);
        vv.removeEventListener("scroll", scrollIntoView);
      }
    };
  }, [active]);

  // ---- Clipboard helpers (kept compatible with the rest of the app) ----
  const collectClip = (ids: string[]): ChordClip[] => {
    const sel = line.chords.filter((c) => ids.includes(c.id));
    if (!sel.length) return [];
    const minSlot = Math.min(...sel.map(slotOf));
    return sel.map((c) => ({
      chord: c.chord,
      relCol: slotOf(c) - minSlot,
      widthCh: Math.max(1, c.chord.display.length),
    }));
  };
  const writeOSClipboard = (clip: ChordClip[]) => {
    if (!clip.length) return;
    try {
      const text = clip
        .sort((a, b) => a.relCol - b.relCol)
        .map((c) => c.chord.display)
        .join(" ");
      void navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
  };
  const doCopy = () => {
    const ids = Array.from(selection.selected).filter((id) => line.chords.some((c) => c.id === id));
    chordClipboard = collectClip(ids);
    writeOSClipboard(chordClipboard);
  };
  const doCut = () => {
    const ids = Array.from(selection.selected).filter((id) => line.chords.some((c) => c.id === id));
    chordClipboard = collectClip(ids);
    writeOSClipboard(chordClipboard);
    if (ids.length) removeChordAnchorsBatch(sectionId, line.id, ids);
    selection.clear();
  };
  const doPaste = async (atSlot?: number) => {
    const slot = atSlot ?? 0;
    let clip: ChordClip[] = [];
    try {
      const text = await navigator.clipboard?.readText();
      if (text && text.trim()) clip = parseChordTextToClips(text);
    } catch {
      /* ignore */
    }
    if (!clip.length) clip = chordClipboard;
    if (!clip.length) return;
    pasteChordsAt(sectionId, line.id, slot, clip);
  };

  // ---- Selection helpers (range-select via shift) ----
  const sortedChords = [...line.chords].sort((a, b) => slotOf(a) - slotOf(b));
  const lastSelectedRef = useRef<string | null>(null);
  const selectRangeTo = (anchorId: string, additive: boolean) => {
    const anchor = lastSelectedRef.current;
    const ids = sortedChords.map((c) => c.id);
    const i2 = ids.indexOf(anchorId);
    if (i2 < 0) return;
    const i1 = anchor ? ids.indexOf(anchor) : i2;
    const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];
    const range = ids.slice(from, to + 1);
    if (!additive) selection.set(range);
    else range.forEach((id) => selection.add(id));
    lastSelectedRef.current = anchorId;
  };

  // ---- Slot row keyboard (Ctrl/Cmd+A / undo / redo / clipboard) ----
  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (k === "z" || k === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && (k === "y" || k === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && (k === "a" || k === "A")) {
      e.preventDefault();
      selection.set(line.chords.map((c) => c.id));
      return;
    }
    if (mod && (k === "c" || k === "C") && selection.size > 0) {
      e.preventDefault();
      doCopy();
      return;
    }
    if (mod && (k === "x" || k === "X") && selection.size > 0) {
      e.preventDefault();
      doCut();
      return;
    }
    if (mod && (k === "v" || k === "V")) {
      e.preventDefault();
      void doPaste();
      return;
    }
  };

  // Close (clear) selection on Escape or click outside this row.
  useEffect(() => {
    if (selection.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only clear if at least one chord on this row is selected.
        if (line.chords.some((c) => selection.has(c.id))) selection.clear();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const root = rowRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      if (line.chords.some((c) => selection.has(c.id))) selection.clear();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [selection, line.chords]);

  const slots = chordsBySlot(line);

  return (
    <div
      ref={rowRef}
      className={cn(
        "group py-1 transition-colors",
        active ? "relative z-[60] rounded-md ring-2 ring-primary/70 bg-paper px-2 -mx-2 shadow-lg" : "relative",
      )}
      data-line-id={line.id}
    >
      {/* CHORD ROW + edit pencil. Each slot is its own Droppable so pangea's
          contiguous-index requirement is naturally satisfied (each slot holds
          at most one Draggable at index 0). */}
      <div className="flex items-stretch gap-1">
        <div
          data-chord-row={line.id}
          tabIndex={0}
          onFocus={() => onChordFocus(line.id)}
          onKeyDown={onRowKeyDown}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest("[data-chip-anchor]")) return;
            if (t.closest("[data-slot-index]")) return;
            setFocusedPattern(null);
            onChordFocus(line.id);
            onPickerOpen(line.id, 0);
          }}
          className="relative flex items-stretch flex-1 min-w-0 rounded-sm bg-accent/20 outline-none"
          style={{ minHeight: 36 }}
        >
          {line.chords.length === 0 && !isAnyDragging && (
            <span className="absolute left-3 top-0 text-xs italic text-muted-foreground/60 leading-9 pointer-events-none select-none">
              add your chords here
            </span>
          )}

          {slots.map((anchor, slotIdx) => {
            const occupied = !!anchor;
            const playing = !!anchor && playingAnchorId === anchor.id;
            return (
              <Droppable
                key={`slot-${slotIdx}`}
                droppableId={`slot:${sectionId}:${line.id}:${slotIdx}`}
                direction="horizontal"
                type="chord"
                isDropDisabled={false}
              >
                {(dropProvided, dropSnapshot) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    data-slot-index={slotIdx}
                    className={cn(
                      "relative flex-1 min-w-0 h-9 flex items-center justify-center",
                      isAnyDragging &&
                        !occupied &&
                        "border border-dashed border-muted-foreground/30 rounded-sm",
                      dropSnapshot.isDraggingOver && "bg-accent/50 ring-1 ring-primary/50 rounded-sm",
                    )}
                    onClick={(e) => {
                      if (occupied) return;
                      e.stopPropagation();
                      onChordFocus(line.id);
                      onPickerOpen(line.id, slotIdx);
                    }}
                  >
                    {occupied && (
                      <Draggable draggableId={anchor!.id} index={0}>
                        {(dragProvided, dragSnapshot) => {
                          const beingDragged = draggingIds.has(anchor!.id);
                          const isPrimary = dragSnapshot.isDragging;
                          const hideForMulti = beingDragged && !isPrimary;
                          return (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              data-chip-anchor={anchor!.id}
                              className={cn(
                                "w-full h-full flex items-center justify-center px-0.5",
                                hideForMulti && "opacity-30",
                              )}
                              style={{ touchAction: "none", ...dragProvided.draggableProps.style }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.shiftKey) {
                                  selectRangeTo(anchor!.id, true);
                                  return;
                                }
                                if (e.metaKey || e.ctrlKey) {
                                  selection.toggle(anchor!.id);
                                  lastSelectedRef.current = anchor!.id;
                                  return;
                                }
                                if (selection.size > 0) {
                                  selection.toggle(anchor!.id);
                                  lastSelectedRef.current = anchor!.id;
                                  return;
                                }
                                void playChord(anchor!.chord);
                                onChordFocus(line.id);
                                onPickerOpen(line.id, slotIdx, anchor!.id);
                              }}
                            >
                              <div className="relative pointer-events-none">
                                <ChordChip
                                  chord={anchor!.chord}
                                  variant="ink"
                                  size="sm"
                                  selected={selection.has(anchor!.id)}
                                  audition={false}
                                />
                                {isPrimary && draggingIds.size > 1 && (
                                  <span
                                    className="absolute -top-2 -right-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold h-5 min-w-5 px-1 shadow-md"
                                    aria-label={`${draggingIds.size} chords selected`}
                                  >
                                    +{draggingIds.size - 1}
                                  </span>
                                )}
                                {playing && (
                                  <span
                                    aria-hidden
                                    className="absolute inset-0 rounded-md ring-2 ring-[hsl(var(--chord-chip))] animate-pulse pointer-events-none"
                                  />
                                )}
                              </div>
                            </div>
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

        {/* Edit pencil — opens chord picker AND selects all chords on this row
            so the chord context toolbar appears. User can then tap chips to
            adjust the selection (single or multi). */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 self-center text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onChordFocus(line.id);
            // Pre-select existing chords so the selection toolbar opens.
            if (line.chords.length > 0) {
              selection.set(line.chords.map((c) => c.id));
            }
            onPickerOpen(line.id, 0);
          }}
          aria-label="Edit chords for this line"
          title="Edit chords"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* SELECTION TOOLBAR (only when something is selected on this row) */}
      {selection.size > 0 && line.chords.some((c) => selection.has(c.id)) && (
        <div className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow max-w-[400px]">
          <span className="text-muted-foreground">{selection.size} selected</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => selection.clear()}
            aria-label="Close selection"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={doCopy}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={doCut}>
              <Scissors className="h-3.5 w-3.5" /> Cut
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void doPaste()}>
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive"
              onClick={() => {
                const ids = Array.from(selection.selected).filter((id) =>
                  line.chords.some((c) => c.id === id),
                );
                if (ids.length) removeChordAnchorsBatch(sectionId, line.id, ids);
                selection.clear();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                // Move selection ←: each selected chord steps to slotIndex-1.
                const ids = Array.from(selection.selected)
                  .map((id) => line.chords.find((c) => c.id === id))
                  .filter((c): c is ChordAnchor => !!c)
                  .sort((a, b) => slotOf(a) - slotOf(b));
                ids.forEach((c) => {
                  const next = (c.slotIndex ?? 0) - 1;
                  if (next >= 0) moveChordToSlot(sectionId, line.id, c.id, next);
                });
              }}
              aria-label="Move selection left"
            >
              <ArrowUp className="h-3.5 w-3.5 rotate-[-90deg]" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                const ids = Array.from(selection.selected)
                  .map((id) => line.chords.find((c) => c.id === id))
                  .filter((c): c is ChordAnchor => !!c)
                  .sort((a, b) => slotOf(b) - slotOf(a));
                ids.forEach((c) => {
                  const next = (c.slotIndex ?? 0) + 1;
                  if (next < CHORD_ROW_SLOTS) moveChordToSlot(sectionId, line.id, c.id, next);
                });
              }}
              aria-label="Move selection right"
            >
              <ArrowDown className="h-3.5 w-3.5 rotate-[-90deg]" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => selection.clear()}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* LYRIC INPUT */}
      <div className="relative rounded-sm bg-accent/10">
        <textarea
          ref={lyricInputRef}
          data-lyric-input={line.id}
          value={line.text}
          rows={1}
          onChange={(e) => setLineText(sectionId, line.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const newId = onAddLineAfter();
              if (typeof newId === "string") {
                setTimeout(() => {
                  document
                    .querySelector<HTMLTextAreaElement>(`[data-lyric-input="${newId}"]`)
                    ?.focus();
                }, 10);
              }
            } else if (
              e.key === "Backspace" &&
              lyricInputRef.current?.selectionStart === 0 &&
              lyricInputRef.current.selectionEnd === 0 &&
              line.text === ""
            ) {
              e.preventDefault();
              onMergeUp("lyric");
            }
          }}
          placeholder="Write your lyric line…"
          className="w-full bg-transparent border-0 outline-none resize-none overflow-hidden font-display text-lg leading-9 text-foreground placeholder:text-muted-foreground/60 px-1 ml-1 break-words"
        />
      </div>
    </div>
  );
}

// =============================================================================
//                               SectionCard
// =============================================================================

interface SectionCardProps {
  section: Section;
  index: number;
  total: number;
  displayName: string;
  activeLineId?: string;
  onPickerOpen: (sectionId: string, lineId: string, slotIndex: number, anchorId?: string) => void;
  /** True while ANY pangea drag is in flight (passed down from LyricsTab). */
  isAnyDragging: boolean;
  /** Currently-dragging anchor ids (multi-select aware). */
  draggingIds: Set<string>;
  /** Selection state — shared per-section so cross-row drags carry the set. */
  selection: ReturnType<typeof useDndSelection<string>>;
  sortMode?: boolean;
  onMoveSection?: (id: string, direction: -1 | 1) => void;
}

function SectionCard({
  section,
  index,
  total,
  displayName,
  activeLineId,
  onPickerOpen,
  isAnyDragging,
  draggingIds,
  selection,
  sortMode,
  onMoveSection,
}: SectionCardProps) {
  const {
    addLine,
    removeLine,
    updateSection,
    removeSection,
    duplicateSection,
    toggleSectionCollapsed,
    upsertChordAt,
    basket,
    setSectionComment,
    setSectionColor,
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
  } = useSongStore();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(section.label);
  const prevTypeRef = useRef<SectionType | null>(null);
  const prevLabelRef = useRef<string>(section.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { lineId: string; kind: "lyric" | "chord" }>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false);

  useEffect(() => {
    setDraftLabel(section.label);
  }, [section.label]);

  const acceptCustomName = () => {
    const trimmed = draftLabel.trim() || "Section";
    updateSection(section.id, { label: trimmed });
    prevTypeRef.current = null;
    setCustomRenameOpen(false);
  };
  const cancelCustomName = () => {
    if (prevTypeRef.current && prevTypeRef.current !== "custom") {
      updateSection(section.id, { type: prevTypeRef.current, label: prevLabelRef.current });
    }
    prevTypeRef.current = null;
    setCustomRenameOpen(false);
  };

  const focusPrevLine = (lineId: string) => {
    const idx = section.lines.findIndex((l) => l.id === lineId);
    if (idx <= 0) return;
    const prev = section.lines[idx - 1];
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-lyric-input="${prev.id}"]`);
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    }, 10);
  };

  const handleMergeUp = (lineId: string, kind: "lyric" | "chord") => {
    const idx = section.lines.findIndex((l) => l.id === lineId);
    if (idx <= 0) return;
    const line = section.lines[idx];
    const hasOpposite =
      kind === "lyric" ? line.chords.length > 0 : line.text.trim().length > 0;
    if (hasOpposite) {
      setConfirm({ lineId, kind });
    } else {
      removeLine(section.id, lineId);
      focusPrevLine(lineId);
    }
  };

  const confirmDelete = () => {
    if (!confirm) return;
    const { lineId } = confirm;
    setConfirm(null);
    removeLine(section.id, lineId);
    focusPrevLine(lineId);
  };

  const hasComment = !!(section.comment && section.comment.trim().length);

  return (
    <div
      data-section-id={section.id}
      style={sectionTintStyle(section.color)}
      className={cn("rounded-xl px-2 py-2 bg-transparent shadow-none border-0")}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 -ml-4 select-none [-webkit-touch-callout:none] [-webkit-user-select:none]">
        <Select
          value={section.type}
          onValueChange={(v) => {
            const next = v as SectionType;
            if (next === "custom") {
              prevTypeRef.current = section.type;
              prevLabelRef.current = section.label;
              updateSection(section.id, { type: next, label: section.label || "Section" });
              setDraftLabel(section.label && section.type === "custom" ? section.label : "");
              setCustomRenameOpen(true);
            } else {
              updateSection(section.id, { type: next, label: section.label });
            }
          }}
          disabled={sortMode}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-sm font-display font-semibold ink-chord capitalize ml-6">
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

        {section.type === "custom" && !sortMode && (
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

        {!sortMode && (
          <span className="text-xs text-muted-foreground ml-1">
            {section.lines.length} line{section.lines.length === 1 ? "" : "s"}
          </span>
        )}

        {sortMode ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onMoveSection?.(section.id, -1)}
              disabled={index === 0}
              aria-label="Move section up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onMoveSection?.(section.id, 1)}
              disabled={index >= total - 1}
              aria-label="Move section down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Section</DropdownMenuLabel>
              {section.type === "custom" && (
                <DropdownMenuItem onClick={() => setCustomRenameOpen(true)}>
                  <Pencil className="h-4 w-4" /> Rename…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => duplicateSection(section.id)}>
                <Copy className="h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                Color
              </DropdownMenuLabel>
              <div className="px-2 pb-2">
                <div className="grid grid-cols-8 gap-1">
                  {SECTION_COLOR_KEYS.map((c) => {
                    const isActive = section.color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSectionColor(section.id, isActive ? null : c)}
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
                {section.color && (
                  <button
                    type="button"
                    onClick={() => setSectionColor(section.id, null)}
                    className="mt-2 w-full text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear color
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (suppressCrossTabDeleteWarning) removeSection(section.id);
                  else setConfirmDeleteSection(true);
                }}
                disabled={total <= 1}
              >
                <Trash2 className="h-4 w-4" /> Delete section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {!sortMode && (
          <button
            onClick={() => toggleSectionCollapsed(section.id)}
            className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={section.collapsed ? "Expand section" : "Collapse section"}
          >
            {section.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Body */}
      {!section.collapsed && (
        <>
          <div className="space-y-1 overflow-x-auto">
            {section.lines.map((line, i) => (
              <LineRow
                key={line.id}
                sectionId={section.id}
                line={line}
                isFirst={i === 0}
                active={activeLineId === line.id}
                onAddLineAfter={() => addLine(section.id, line.id)}
                onMergeUp={(kind) => handleMergeUp(line.id, kind)}
                onPickerOpen={(lineId, slot, anchorId) => onPickerOpen(section.id, lineId, slot, anchorId)}
                selection={selection}
                onChordFocus={() => {
                  /* parent handles via picker */
                }}
                draggingIds={draggingIds}
                isAnyDragging={isAnyDragging}
              />
            ))}
          </div>

          {basket.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Drop basket chords into this section
              </p>
              <div className="flex flex-wrap gap-1.5">
                {basket.map((b) => (
                  <ChordChip
                    key={b.id}
                    chord={b.chord}
                    size="sm"
                    onClick={() => {
                      const last = section.lines[section.lines.length - 1];
                      if (last) {
                        // Append into the next free slot of the last line.
                        const used = new Set(
                          last.chords.map((c) => c.slotIndex).filter((s): s is number => s != null),
                        );
                        let target = 0;
                        for (let i = 0; i < CHORD_ROW_SLOTS; i++) {
                          if (!used.has(i)) {
                            target = i;
                            break;
                          }
                        }
                        useSongStore.getState().placeChordInSlot(section.id, last.id, target, b.chord);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Comment accordion */}
          <div className="mt-4 flex flex-col items-end">
            <button
              onClick={() => setCommentOpen((o) => !o)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              {hasComment ? (
                <>
                  <MessageSquare className="h-3.5 w-3.5" /> Comment
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> add comment
                </>
              )}
              <ChevronDown className={cn("h-3 w-3 transition-transform", commentOpen && "rotate-180")} />
            </button>
            {commentOpen && (
              <div className="w-full mt-2">
                <Textarea
                  value={section.comment ?? ""}
                  onChange={(e) => setSectionComment(section.id, e.target.value)}
                  placeholder="Notes for this section…"
                  className="min-h-[80px] font-display text-base"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Custom name dialog */}
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
            <Button variant="ghost" onClick={cancelCustomName}>
              Cancel
            </Button>
            <Button onClick={acceptCustomName}>Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm row delete */}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this row?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "lyric"
                ? "This row's chord row still has content. Deleting will remove the chords too."
                : "This row's lyric still has text. Deleting will remove the lyric too."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete row</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={confirmDeleteSection}
        onOpenChange={setConfirmDeleteSection}
        title="Delete entire section?"
        description="This removes the section from BOTH the Lyrics and Progression tabs, including all lyric lines and chord pattern blocks inside it."
        confirmLabel="Delete section"
        showSuppressOption
        onConfirm={(suppress) => {
          setConfirmDeleteSection(false);
          if (suppress) setSuppressCrossTabDeleteWarning(true);
          removeSection(section.id);
        }}
      />
    </div>
  );
}

// =============================================================================
//                                LyricsTab
// =============================================================================

interface LyricsTabProps {
  sortMode?: boolean;
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions") => void;
}

export function LyricsTab({ sortMode = false, onSwitchTab }: LyricsTabProps) {
  const {
    sections,
    upsertChordAt,
    addSection,
    moveSection,
    basket,
    removeFromBasket,
    moveChordToSlot,
    moveChordsAcrossLines,
    placeChordInSlot,
    appendChordToLine,
  } = useSongStore();

  const [picker, setPicker] = useState<{
    sectionId: string;
    lineId: string;
    /** Target slot in the chord row (0..19). */
    slotIndex: number;
    anchorId?: string;
  } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  // Selection lives at the tab level so cross-row drags can read it.
  const selection = useDndSelection<string>();

  // Track the in-flight pangea drag (which ids ride along, are we dragging at all).
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const isAnyDragging = draggingIds.size > 0;

  const openPicker = (sectionId: string, lineId: string, slotIndex: number, anchorId?: string) => {
    if (basket.length > 0) return;
    setPicker({ sectionId, lineId, slotIndex, anchorId });
  };

  useEffect(() => {
    if (basket.length > 0 && picker) setPicker(null);
  }, [basket.length, picker]);

  const activeSection = picker ? sections.find((s) => s.id === picker.sectionId) : undefined;
  const activeLine = activeSection?.lines.find((l) => l.id === picker?.lineId);
  const initialChord = activeLine?.chords.find((c) => c.id === picker?.anchorId)?.chord;

  useEffect(() => {
    if (picker) setPickerQuery(initialChord?.display ?? "");
    else setPickerQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker?.sectionId, picker?.lineId, picker?.anchorId]);

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    const sec = sections.find((s) => s.id === picker.sectionId);
    const line = sec?.lines.find((l) => l.id === picker.lineId);
    if (!sec || !line) return;
    if (picker.anchorId) {
      // Editing existing chord: keep its slot, swap symbol.
      upsertChordAt(picker.sectionId, picker.lineId, picker.slotIndex, chord, picker.anchorId);
    } else {
      // Placing new chord into the requested slot.
      placeChordInSlot(picker.sectionId, picker.lineId, picker.slotIndex, chord);
    }
    setPickerQuery("");
    // Step picker to the next slot for fast successive entry.
    setPicker((prev) =>
      prev
        ? {
            ...prev,
            anchorId: undefined,
            slotIndex: Math.min(CHORD_ROW_SLOTS - 1, prev.slotIndex + 1),
          }
        : prev,
    );
  };

  // ---- Drag handlers ----
  const onDragStart = (start: { draggableId: string }) => {
    if (start.draggableId.startsWith("basket:")) {
      setDraggingIds(new Set([start.draggableId]));
      return;
    }
    if (selection.has(start.draggableId)) {
      setDraggingIds(new Set(selection.selected));
    } else {
      selection.clear();
      setDraggingIds(new Set([start.draggableId]));
    }
  };

  const onDragEnd = (result: DropResult) => {
    const ids = Array.from(draggingIds);
    setDraggingIds(new Set());
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const dstParts = destination.droppableId.split(":");
    if (dstParts[0] !== "slot") return;
    const toSectionId = dstParts[1];
    const toLineId = dstParts[2];
    const toSlot = Number(dstParts[3]);
    if (Number.isNaN(toSlot)) return;

    // Basket → row: place chord into target slot, then remove from basket.
    if (draggableId.startsWith("basket:")) {
      const basketItemId = draggableId.slice("basket:".length);
      const item = useSongStore.getState().basket.find((b) => b.id === basketItemId);
      if (!item) return;
      placeChordInSlot(toSectionId, toLineId, toSlot, item.chord);
      removeFromBasket(basketItemId);
      return;
    }

    const srcParts = source.droppableId.split(":");
    if (srcParts[0] !== "slot") return;
    const fromSectionId = srcParts[1];
    const fromLineId = srcParts[2];

    if (ids.length > 1) {
      moveChordsAcrossLines(fromSectionId, fromLineId, toSectionId, toLineId, ids, toSlot);
      selection.clear();
      return;
    }

    if (fromSectionId === toSectionId && fromLineId === toLineId) {
      moveChordToSlot(fromSectionId, fromLineId, draggableId, toSlot);
    } else {
      moveChordsAcrossLines(fromSectionId, fromLineId, toSectionId, toLineId, [draggableId], toSlot);
    }
  };

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {sections.map((sec, i) => (
          <SectionCard
            key={sec.id}
            section={sec}
            index={i}
            total={sections.length}
            displayName={getSectionDisplayName(sections, sec.id)}
            activeLineId={picker?.sectionId === sec.id ? picker?.lineId : undefined}
            onPickerOpen={openPicker}
            isAnyDragging={isAnyDragging}
            draggingIds={draggingIds}
            selection={selection}
            sortMode={sortMode}
            onMoveSection={(id, direction) => moveSection(id, direction)}
          />
        ))}

        <div className="flex flex-col gap-2 rounded-md border border-muted-foreground/40 p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Add section</span>
          <div className="flex flex-wrap items-center gap-2">
            {(["verse", "chorus", "bridge", "intro"] as SectionType[]).map((t) => (
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

        <ChordPickerSheet
          open={!!picker}
          onOpenChange={(o) => {
            if (!o) setPicker(null);
          }}
          initialChord={initialChord}
          onPick={handlePick}
          activeLineId={picker?.lineId}
          activeSlotIndex={picker?.slotIndex}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
        />

        <BasketBar
          draggable
          onSendToProgressions={() => onSwitchTab?.("progressions")}
        />
      </div>
    </DragDropContext>
  );
}
