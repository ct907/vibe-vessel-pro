import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useDndStore } from "@/store/dnd";
import {
  useSongStore,
  getSectionDisplayName,
  getLineChordsViaSSOT,
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
import { toast } from "sonner";
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
  Wand2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { SECTION_COLOR_KEYS, sectionTintStyle } from "@/components/section/SectionColorPicker";
import { useDndSelection } from "@/hooks/use-dnd-selection";
import { useBasketSelectionStore } from "@/store/basket-selection";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUIStore } from "@/store/ui";

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

/** Build a slot → chord map from a chord list. Slots without a chord map to undefined. */
function chordsBySlot(chords: ChordAnchor[]): (ChordAnchor | undefined)[] {
  const out: (ChordAnchor | undefined)[] = new Array(CHORD_ROW_SLOTS).fill(undefined);
  chords.forEach((c) => {
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
  /** The owning section — used to read line chords via the SSOT projection. */
  section: Section;
  line: LyricLine;
  active?: boolean;
  isFirst: boolean;
  onAddLineAfter: () => string | void;
  onMergeUp: (kind: "lyric" | "chord") => void;
  onPickerOpen: (lineId: string, slotIndex: number, anchorId?: string) => void;
  /** Force-close the chord picker (used when entering Edit Mode). */
  onPickerClose: () => void;
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
  section,
  line,
  active,
  onAddLineAfter,
  onMergeUp,
  onPickerOpen,
  onPickerClose,
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
    autoLayoutSection,
    undo,
    redo,
  } = useSongStore();
  const isMobile = useIsMobile();
  // Phase 2 SSOT: read line chords through the section's SectionChord[]
  // projection. The legacy ChordAnchor shape is preserved (renderer still
  // depends on slotIndex/mirrorId/etc.) — only the order is now SSOT-driven.
  const lineChords: ChordAnchor[] = getLineChordsViaSSOT(section, line.id);
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setFocusedPattern = usePlaybackStore((s) => s.setFocusedPattern);
  const playingAnchorId = isPlaying && playbackCurrent?.mirrorId ? playbackCurrent.mirrorId : null;

  const lyricInputRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Strict mode separation: Composition (default) vs Edit. Edit Mode disables
  // all picker triggers and scroll-to-focus; clicks toggle chord selection only.
  const [isEditMode, setIsEditMode] = useState(false);

  // Auto-exit Edit Mode if this row loses "active" focus (user moved elsewhere).
  useEffect(() => {
    if (!active && isEditMode) {
      setIsEditMode(false);
      selection.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Auto-resize lyric textarea.
  useLayoutEffect(() => {
    const ta = lyricInputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [line.text]);

  // Note: visualViewport scroll-into-view effect was removed. Mobile keyboard
  // overlap is now handled by the FocusedChordEditor overlay (mobile only)
  // and CSS `scroll-mt-24` on the row container above.

  // ---- Clipboard helpers (kept compatible with the rest of the app) ----
  const collectClip = (ids: string[]): ChordClip[] => {
    const sel = lineChords.filter((c) => ids.includes(c.id));
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
    const ids = Array.from(selection.selected).filter((id) => lineChords.some((c) => c.id === id));
    chordClipboard = collectClip(ids);
    writeOSClipboard(chordClipboard);
  };
  const doCut = () => {
    const ids = Array.from(selection.selected).filter((id) => lineChords.some((c) => c.id === id));
    chordClipboard = collectClip(ids);
    writeOSClipboard(chordClipboard);
    if (ids.length) removeChordAnchorsBatch(sectionId, line.id, ids);
    selection.clear();
    if (ids.length) {
      window.setTimeout(() => autoLayoutSection(sectionId, window.innerWidth, 28), 0);
    }
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
  const sortedChords = [...lineChords].sort((a, b) => slotOf(a) - slotOf(b));
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
      selection.set(lineChords.map((c) => c.id));
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

  // Close (clear) selection on Escape or click outside this row. While Edit
  // Mode is on we don't auto-clear — the user controls dismissal via Done or
  // the pencil button.
  useEffect(() => {
    if (selection.size === 0) return;
    if (isEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lineChords.some((c) => selection.has(c.id))) selection.clear();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const root = rowRef.current;
      if (!root) return;
      const t = e.target as HTMLElement | null;
      // Don't interfere with basket drag-and-drop initiation.
      if (t && t.closest('[data-basket-chip],[data-droppable-id="basket-source"]')) return;
      if (root.contains(e.target as Node)) return;
      if (lineChords.some((c) => selection.has(c.id))) selection.clear();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [selection, lineChords, isEditMode]);

  const slots = chordsBySlot(lineChords);

  return (
    <div
      ref={rowRef}
      className={cn(
        "group py-1 transition-colors scroll-mt-24",
        // On mobile, the FocusedChordEditor renders a clone of this row,
        // so the underlying row should NOT be visually elevated. On desktop
        // we keep the focus highlight so the user can see which row the
        // bottom-sheet picker is editing.
        active && !isMobile
          ? "relative z-[60] rounded-md ring-2 ring-primary/70 bg-paper px-2 -mx-2 shadow-lg"
          : "relative",
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
            // Edit Mode: empty-area taps do nothing (never open picker).
            if (isEditMode) return;
            setFocusedPattern(null);
            onChordFocus(line.id);
            onPickerOpen(line.id, 0);
          }}
          className="relative flex items-stretch flex-1 min-w-0 overflow-hidden rounded-sm bg-muted-foreground/12 outline-none"
          style={{ minHeight: 36 }}
        >
          {lineChords.length === 0 && !isAnyDragging && (
            <span className="absolute left-3 top-0 text-xs italic text-muted-foreground/60 leading-9 pointer-events-none select-none">
              add your chords here
            </span>
          )}

          {/* Slot dividers are now rendered per-slot (border-l on each slot
              past the first) so they stay aligned even when occupied slots
              grow to fit long chord names (28–48px). */}

          {slots.map((anchor, slotIdx) => {
            const occupied = !!anchor;
            const playing = !!anchor && playingAnchorId === anchor.id;
            // Spacing rule preview: while dragging, an empty slot whose
            // immediate neighbor already holds a chord is an invalid drop
            // target (the store will auto-shift to the next spaced slot).
            // Mark it visually so the user understands why a slot won't accept.
            const leftOccupied = slotIdx > 0 && !!slots[slotIdx - 1];
            const rightOccupied = slotIdx < CHORD_ROW_SLOTS - 1 && !!slots[slotIdx + 1];
            const isInvalidDrop = !occupied && (leftOccupied || rightOccupied);
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
                      "relative shrink-0 h-9 flex items-center justify-start",
                      // Width: 28px floor for empty slots, fit-content with a
                      // 48px cap for occupied slots so long chord names fit.
                      occupied ? "min-w-[28px] max-w-[48px] w-fit" : "w-7",
                      // Per-slot left border acts as the vertical divider
                      // between adjacent slots (skip the first one).
                      slotIdx > 0 && !isAnyDragging && "border-l border-muted-foreground/12",
                      isAnyDragging &&
                        !occupied &&
                        !isInvalidDrop &&
                        "border border-dashed border-muted-foreground/30 rounded-sm",
                      isAnyDragging &&
                        isInvalidDrop &&
                        "border border-dashed border-destructive/40 rounded-sm",
                      dropSnapshot.isDraggingOver && !isInvalidDrop && "bg-accent/50 ring-1 ring-primary/50 rounded-sm",
                      dropSnapshot.isDraggingOver && isInvalidDrop && "bg-destructive/10 ring-1 ring-destructive/50 rounded-sm",
                    )}
                    onClick={(e) => {
                      if (occupied) return;
                      e.stopPropagation();
                      // Edit Mode: never open picker on empty-slot tap.
                      if (isEditMode) return;
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
                                "h-full flex items-center justify-center",
                                hideForMulti && "opacity-30",
                              )}
                              style={{ touchAction: "none", ...dragProvided.draggableProps.style }}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Modifier-key shortcuts always work as multi-select.
                                if (e.shiftKey) {
                                  selectRangeTo(anchor!.id, true);
                                  return;
                                }
                                if (e.metaKey || e.ctrlKey) {
                                  selection.toggle(anchor!.id);
                                  lastSelectedRef.current = anchor!.id;
                                  return;
                                }
                                // Edit Mode: tap toggles selection only —
                                // never opens the picker, never auditions.
                                if (isEditMode) {
                                  selection.toggle(anchor!.id);
                                  lastSelectedRef.current = anchor!.id;
                                  return;
                                }
                                // Composition Mode: audition + open picker.
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

        {/* Edit pencil — toggles Edit Mode. Entering Edit Mode closes the
            picker, blurs inputs, and pre-selects all chords so the context
            toolbar appears. Exiting clears the selection. */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "h-9 w-9 shrink-0 self-center text-muted-foreground hover:text-foreground",
            isEditMode && "text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onChordFocus(line.id);
            setIsEditMode((prev) => {
              const next = !prev;
              if (next) {
                // Entering Edit Mode: close picker + blur active input.
                // Do NOT pre-select chords — user does the picking.
                onPickerClose();
                (document.activeElement as HTMLElement | null)?.blur?.();
                selection.clear();
              } else {
                // Exiting Edit Mode: clear selection.
                selection.clear();
              }
              return next;
            });
          }}
          aria-label={isEditMode ? "Exit edit mode" : "Edit chords for this line"}
          aria-pressed={isEditMode}
          title={isEditMode ? "Exit edit mode" : "Edit chords"}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* SELECTION TOOLBAR — visible whenever Edit Mode is on. Closing requires
          either tapping Done or the pencil icon again. */}
      {isEditMode && (
        <div className="mt-1 flex flex-col gap-3 rounded-md border border-border bg-popover px-2 py-2 text-xs shadow max-w-[400px]">
          {/* Row 1: counter + close + select-all + copy/cut/paste + move arrows */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-muted-foreground">{selection.size} selected</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => selection.set(lineChords.map((c) => c.id))}
              disabled={lineChords.length === 0 || selection.size === lineChords.length}
              aria-label="Select all chords"
              title="Select all chords on this row"
            >
              Select all
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => selection.clear()}
              aria-label="Clear selection"
              title="Clear selection"
              disabled={selection.size === 0}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={doCopy} disabled={selection.size === 0}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={doCut} disabled={selection.size === 0}>
                <Scissors className="h-3.5 w-3.5" /> Cut
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void doPaste()}>
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                disabled={selection.size === 0}
                onClick={() => {
                  const ids = Array.from(selection.selected)
                    .map((id) => lineChords.find((c) => c.id === id))
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
                disabled={selection.size === 0}
                onClick={() => {
                  const ids = Array.from(selection.selected)
                    .map((id) => lineChords.find((c) => c.id === id))
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
            </div>
          </div>

          {/* Row 2: delete + done */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive"
              disabled={selection.size === 0}
              onClick={() => {
                const ids = Array.from(selection.selected).filter((id) =>
                  lineChords.some((c) => c.id === id),
                );
                if (ids.length) removeChordAnchorsBatch(sectionId, line.id, ids);
                selection.clear();
                // Collapse any now-empty overflow rows so lyrics-side delete
                // looks as clean as progression-side delete.
                window.setTimeout(
                  () => autoLayoutSection(sectionId, window.innerWidth, 28),
                  0,
                );
                // If we just deleted every chord on this row, drop edit mode
                // so the user isn't stuck in a stub toolbar.
                if (ids.length >= lineChords.length) {
                  setIsEditMode(false);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 ml-auto" onClick={() => { selection.clear(); setIsEditMode(false); }}>
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
  onPickerClose: () => void;
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
  onPickerClose,
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
    autoLayoutSection,
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
              <DropdownMenuItem
                onClick={() => {
                  const res = autoLayoutSection(section.id, window.innerWidth, 28);
                  if (res?.changed) {
                    toast.success("Chords & lyrics formatted to fit your screen");
                  } else {
                    toast("Already laid out for this screen width");
                  }
                }}
              >
                <Wand2 className="h-4 w-4" /> Format chords & lyrics
              </DropdownMenuItem>
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
          <div className="space-y-1 overflow-x-hidden">
            {section.lines.map((line, i) => (
              <LineRow
                key={line.id}
                sectionId={section.id}
                section={section}
                line={line}
                isFirst={i === 0}
                active={activeLineId === line.id}
                onAddLineAfter={() => addLine(section.id, line.id)}
                onMergeUp={(kind) => handleMergeUp(line.id, kind)}
                onPickerOpen={(lineId, slot, anchorId) => onPickerOpen(section.id, lineId, slot, anchorId)}
                onPickerClose={onPickerClose}
                selection={selection}
                onChordFocus={() => {
                  /* parent handles via picker */
                }}
                draggingIds={draggingIds}
                isAnyDragging={isAnyDragging}
              />
            ))}
          </div>

          {/* Basket chords are now drag-and-dropped directly into chord-row slots. */}

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
    moveChordToSlot,
    moveChordsAcrossLines,
    placeChordInSlot,
    autoLayoutSection,
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
  const isMobile = useIsMobile();

  // Track the in-flight pangea drag (which ids ride along, are we dragging at all).
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const isAnyDragging = draggingIds.size > 0;
  // Suppress the picker-open click that fires after dropping a chord.
  const justDraggedAtRef = useRef<number>(0);

  const openPicker = (sectionId: string, lineId: string, slotIndex: number, anchorId?: string) => {
    if (basket.length > 0) return;
    if (Date.now() - justDraggedAtRef.current < 350) return;
    setPicker({ sectionId, lineId, slotIndex, anchorId });
  };

  useEffect(() => {
    if (basket.length > 0 && picker) setPicker(null);
  }, [basket.length, picker]);

  // Auto-layout watchdog: when a section's chord count grows, debounce a
  // viewport-aware reflow so the user sees them spread out cleanly.
  // Fix B (Issue #2): pause while the FocusedChordEditor is open via the
  // shared UI store. We collect "grown" sections without firing, and flush
  // exactly once when the editor closes.
  const prevCountsRef = useRef<Record<string, number> | null>(null);
  const pendingGrownRef = useRef<Set<string>>(new Set());
  const [overflowToastFor, setOverflowToastFor] = useState<Record<string, number>>({});
  const [residualOverflowFor, setResidualOverflowFor] = useState<Record<string, boolean>>({});
  const [orientationOpen, setOrientationOpen] = useState(false);
  const editorOpen = useUIStore((s) => s.focusedEditorOpen);
  const wasEditorOpenRef = useRef(false);

  const dbgLog = (...args: unknown[]) => {
    try {
      if (window.localStorage.getItem("LV_DEBUG_LAYOUT") === "1") {
        // eslint-disable-next-line no-console
        console.log("[watchdog]", ...args);
      }
    } catch { /* ignore */ }
  };

  const runReflow = (ids: string[]) => {
    const overflowMap: Record<string, number> = {};
    const residualMap: Record<string, boolean> = {};
    ids.forEach((id) => {
      const res = autoLayoutSection(id, window.innerWidth, 28);
      dbgLog("reflow", id, res);
      if (res?.overflowRowsAdded && res.overflowRowsAdded > 0) {
        overflowMap[id] = res.overflowRowsAdded;
      }
      if (res?.residualOverflow && res.residualOverflow > 0) {
        residualMap[id] = true;
      }
    });
    if (Object.keys(overflowMap).length) {
      setOverflowToastFor((prev) => ({ ...prev, ...overflowMap }));
    }
    if (Object.keys(residualMap).length) {
      setResidualOverflowFor((prev) => ({ ...prev, ...residualMap }));
    }
  };

  // Flush pending reflows the moment the editor closes.
  useEffect(() => {
    if (wasEditorOpenRef.current && !editorOpen) {
      const ids = Array.from(pendingGrownRef.current);
      pendingGrownRef.current.clear();
      dbgLog("editor closed — flushing", ids);
      if (ids.length) {
        const handle = window.setTimeout(() => runReflow(ids), 350);
        wasEditorOpenRef.current = editorOpen;
        return () => window.clearTimeout(handle);
      }
    }
    wasEditorOpenRef.current = editorOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen]);

  useEffect(() => {
    if (prevCountsRef.current === null) {
      const seed: Record<string, number> = {};
      sections.forEach((sec) => {
        seed[sec.id] = sec.chords.length > 0 ? sec.chords.length - 1 : 0;
      });
      prevCountsRef.current = seed;
    }
    const counts = prevCountsRef.current;
    const grown: string[] = [];
    sections.forEach((sec) => {
      const prev = counts[sec.id] ?? sec.chords.length;
      if (sec.chords.length > prev) grown.push(sec.id);
      counts[sec.id] = sec.chords.length;
    });
    if (!grown.length) return;
    if (editorOpen) {
      grown.forEach((id) => pendingGrownRef.current.add(id));
      dbgLog("editor open — queued", grown);
      return;
    }
    const handle = window.setTimeout(() => {
      dbgLog("scheduled reflow firing", grown);
      runReflow(grown);
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, autoLayoutSection, editorOpen]);

  // Orientation change (mobile only): suggest export instead of auto-reflow.
  // Desktop window resizes across the portrait/landscape boundary should NOT
  // open the modal — gate by touch-device detection.
  useEffect(() => {
    const isMobileDevice = () =>
      "ontouchstart" in window ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      window.matchMedia("(pointer: coarse)").matches;
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => {
      if (!isMobileDevice()) {
        dbgLog("orientation changed but not a mobile device — skipping modal");
        return;
      }
      setOrientationOpen(true);
    };
    // Modern browsers
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Phase 1.5: desktop window resize → debounced auto-reflow.
  // Mobile devices use the orientation modal instead (above) so we don't
  // double-fire and so the user's manual chord arrangement is preserved
  // during a phone rotation.
  useEffect(() => {
    const isMobileDevice =
      "ontouchstart" in window ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      window.matchMedia("(pointer: coarse)").matches;
    if (isMobileDevice) return;
    let t: number | undefined;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const w = window.innerWidth;
        useSongStore.getState().sections.forEach((sec) => {
          autoLayoutSection(sec.id, w, 28);
        });
        dbgLog("desktop resize reflow", { w });
      }, 500);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [autoLayoutSection]);

  // Issue #1: when a song is loaded that was last edited at a noticeably
  // different screen width, auto-format every section for the current width
  // and surface a friendly toast explaining what happened.
  useEffect(() => {
    type LayoutMeta = { lastEditedScreenWidth: number; lastEditedDevice: string; lastEditedAt: number };
    const apply = (meta: LayoutMeta) => {
      const currentWidth = window.innerWidth;
      const savedWidth = meta.lastEditedScreenWidth;
      if (!savedWidth) return;
      const widthDiff = Math.abs(currentWidth - savedWidth);
      if (widthDiff <= 100) return;
      const sectionIds = useSongStore.getState().sections.map((s) => s.id);
      sectionIds.forEach((id) => autoLayoutSection(id, currentWidth, 28));
      const isSmaller = currentWidth < savedWidth;
      const device = meta.lastEditedDevice || "another device";
      toast.info(
        `Formatted for ${isSmaller ? "smaller" : "larger"} screen — last edited on ${device} (${savedWidth}px). Everything was adjusted to fit.`,
        { duration: 6000, icon: <Sparkles className="w-4 h-4" /> },
      );
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = (window as any).__lvLastLayoutMeta as LayoutMeta | undefined;
    if (cached) {
      apply(cached);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__lvLastLayoutMeta = undefined;
    }
    const onLoaded = (e: Event) => {
      const meta = (e as CustomEvent).detail?.layoutMeta as LayoutMeta | undefined;
      if (meta) apply(meta);
    };
    window.addEventListener("lv-song-loaded", onLoaded);
    return () => window.removeEventListener("lv-song-loaded", onLoaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
    justDraggedAtRef.current = Date.now();
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const dstParts = destination.droppableId.split(":");
    if (dstParts[0] !== "slot") return;
    const toSectionId = dstParts[1];
    const toLineId = dstParts[2];
    const toSlot = Number(dstParts[3]);
    if (Number.isNaN(toSlot)) return;

    // Basket → row: COPY chord(s) into target slot(s). Original chips stay
    // in basket so the user can keep dragging the same chord into multiple
    // destinations. If the dragged chip is part of a multi-selection, every
    // selected chord is placed starting at the drop slot, walking right.
    if (draggableId.startsWith("basket:")) {
      const basketItemId = draggableId.slice("basket:".length);
      const basket = useSongStore.getState().basket;
      const { resolveDragIds, clear: clearBasketSelection } =
        useBasketSelectionStore.getState();
      const ids = resolveDragIds(basketItemId);
      // Preserve basket order for multi-drops so the user gets a predictable layout.
      const ordered = basket.filter((b) => ids.includes(b.id));
      ordered.forEach((b, i) =>
        placeChordInSlot(toSectionId, toLineId, toSlot + i, b.chord),
      );
      clearBasketSelection();
      return;
    }

    const srcParts = source.droppableId.split(":");
    if (srcParts[0] !== "slot") return;
    const fromSectionId = srcParts[1];
    const fromLineId = srcParts[2];

    // Multi-drag: preserve relative spacing between selected chords.
    if (ids.length > 1) {
      const fromSec = sections.find((s) => s.id === fromSectionId);
      const fromLine = fromSec?.lines.find((l) => l.id === fromLineId);
      if (!fromLine) {
        selection.clear();
        return;
      }
      // Anchor = the chord the user actually grabbed.
      const draggedAnchor = fromLine.chords.find((c) => c.id === draggableId);
      const draggedSlot = draggedAnchor?.slotIndex ?? 0;
      // Build (id, originalSlot) pairs for selection, sorted by slot.
      const pairs = ids
        .map((id) => {
          const a = fromLine.chords.find((c) => c.id === id);
          return a ? { id, slot: a.slotIndex ?? 0 } : null;
        })
        .filter((x): x is { id: string; slot: number } => !!x)
        .sort((a, b) => a.slot - b.slot);

      // Compute targets preserving offset to the dragged anchor.
      const targets = pairs.map((p) => ({
        id: p.id,
        target: Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, toSlot + (p.slot - draggedSlot))),
      }));

      // Process in the direction of motion so swaps don't trample siblings.
      const delta = toSlot - draggedSlot;
      const order = delta >= 0 ? [...targets].reverse() : targets;

      if (fromSectionId === toSectionId && fromLineId === toLineId) {
        order.forEach((t) => moveChordToSlot(fromSectionId, fromLineId, t.id, t.target));
      } else {
        order.forEach((t) => {
          moveChordsAcrossLines(fromSectionId, fromLineId, toSectionId, toLineId, [t.id], t.target);
        });
      }
      selection.clear();
      return;
    }

    if (fromSectionId === toSectionId && fromLineId === toLineId) {
      moveChordToSlot(fromSectionId, fromLineId, draggableId, toSlot);
    } else {
      moveChordsAcrossLines(fromSectionId, fromLineId, toSectionId, toLineId, [draggableId], toSlot);
    }
  };

  // Register tab-level handlers with the global DnD store. We use refs so the
  // single <DragDropContext> in Index.tsx always invokes the freshest closure
  // without forcing re-registration on every render.
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;
  const setLyricsHandlers = useDndStore((s) => s.setLyricsHandlers);
  useEffect(() => {
    setLyricsHandlers(
      (s) => onDragStartRef.current(s),
      (r) => onDragEndRef.current(r),
    );
    return () => setLyricsHandlers(null, null);
  }, [setLyricsHandlers]);

  return (
    <div className="space-y-4">
      {sections.map((sec, i) => (
        <div key={sec.id} className="space-y-2">
          <SectionCard
            section={sec}
            index={i}
            total={sections.length}
            displayName={getSectionDisplayName(sections, sec.id)}
            activeLineId={picker?.sectionId === sec.id ? picker?.lineId : undefined}
            onPickerOpen={openPicker}
            onPickerClose={() => setPicker(null)}
            isAnyDragging={isAnyDragging}
            draggingIds={draggingIds}
            selection={selection}
            sortMode={sortMode}
            onMoveSection={(id, direction) => moveSection(id, direction)}
          />
          {overflowToastFor[sec.id] ? (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
              <Wand2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Auto-fit added {overflowToastFor[sec.id]} chord row{overflowToastFor[sec.id] === 1 ? "" : "s"}</p>
                <p className="text-muted-foreground">Chords overflowed your screen width and were spilled onto continuation rows.</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => setOverflowToastFor((p) => { const n = { ...p }; delete n[sec.id]; return n; })}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
          {residualOverflowFor[sec.id] ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-foreground">
              <X className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Some chords still don't fit</p>
                <p className="text-muted-foreground">Try removing or shortening chords, or rotate to landscape.</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => setResidualOverflowFor((p) => { const n = { ...p }; delete n[sec.id]; return n; })}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </div>
      ))}


      <div className="flex flex-col gap-2 pt-4 border-t border-muted-foreground/40">
        <span className="text-sm font-bold text-center text-muted-foreground">Add Section</span>
        <div className="flex flex-wrap items-center justify-center gap-2">
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

      {/* On mobile, the inline bottom-sheet picker fights the on-screen
          keyboard and sticky headers — render a full-screen overlay instead.
          Desktop continues to use the bottom sheet for fast inline editing. */}
      {isMobile && picker ? (
        <FocusedChordEditor
          sectionId={picker.sectionId}
          lineId={picker.lineId}
          initialSlot={picker.slotIndex}
          initialAnchorId={picker.anchorId}
          onClose={() => setPicker(null)}
        />
      ) : (
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
      )}

      <Dialog open={orientationOpen} onOpenChange={setOrientationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Screen size changed</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your viewport changed significantly. Auto-layout was not applied to avoid disturbing your chord placements.
            For the best printable result at this width, consider exporting your lyrics.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrientationOpen(false)}>Keep current layout</Button>
            <Button
              onClick={() => {
                setOrientationOpen(false);
                sections.forEach((s) => autoLayoutSection(s.id, window.innerWidth, 28));
              }}
            >
              Re-fit all sections
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
