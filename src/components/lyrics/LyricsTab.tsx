import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useDndStore } from "@/store/dnd";
import { useTranscriptionStore } from "@/store/transcription";
import {
  useSongStore,
  getSectionDisplayName,
  getLineChordsViaSSOT,
  withHistoryGroup,
  patternPlayBeats,
  CHORD_ROW_SLOTS,
  type LyricLine,
  type Section,
  type SectionType,
  type ChordAnchor,
  type PatternBlock,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRecordingsStore } from "@/store/recordings";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Copy,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  X,
  Wand2,
  Sparkles,
  Pencil,
  ListMusic,
  Type,
  WholeWord,
  Music2,
  KeyRound,
  Mic,
  Play,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { sectionTintStyle, SectionColorPicker, SECTION_COLOR_KEYS } from "@/components/section/SectionColorPicker";
import { KeyChangeSticker } from "@/components/section/KeyChangeSticker";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { FloatingChordToolbar } from "@/components/chord/FloatingChordToolbar";
import { FocusedRhymeEditor } from "@/components/lyrics/FocusedRhymeEditor";
import { useIsMobile, useIsDesktop } from "@/hooks/use-mobile";
import { useUIStore, type ClipboardChord } from "@/store/ui";
import { useTheme } from "@/hooks/use-theme";
import { useOnboardingStore } from "@/store/onboarding";
import { AnchoredCoachMark, OnboardingCoachMark } from "@/components/onboarding/OnboardingCoachMark";
import { createPortal } from "react-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDefaultsStore } from "@/store/defaults";


const SECTION_TYPES: SectionType[] = ["verse", "chorus", "bridge", "intro", "outro", "pre-chorus", "custom"];


/**
 * Build slot → chord map from a chord list. `slotIndex` is treated as the
 * authoritative preference: every chord with a free preferred slot lands
 * there, regardless of where it sits in the SSOT array. Chords whose
 * preferred slot is already taken (or out of range) fall through to the
 * next free slot in row order.
 *
 * Earlier this routine required slot preferences to be monotonically
 * increasing along the SSOT array — that meant a basket drop, which
 * appends the new SectionChord to the END of `section.chords`, would get
 * pushed past every existing chord even when its slotIndex was the
 * actual drop target. (Reproduces issue 4 in the bug report.)
 */
function chordsBySlot(chords: ChordAnchor[]): (ChordAnchor | undefined)[] {
  const out: (ChordAnchor | undefined)[] = new Array(CHORD_ROW_SLOTS).fill(undefined);
  const overflow: ChordAnchor[] = [];
  // Pass 1: place chords whose preferred slot is free.
  chords.forEach((c) => {
    const pref = c.slotIndex;
    if (
      pref != null &&
      pref >= 0 &&
      pref < CHORD_ROW_SLOTS &&
      out[pref] === undefined
    ) {
      out[pref] = c;
    } else {
      overflow.push(c);
    }
  });
  // Pass 2: anything that didn't fit gets the next free slot in row order,
  // preserving SSOT-array order among the displaced chords.
  let cursor = 0;
  for (const c of overflow) {
    while (cursor < CHORD_ROW_SLOTS && out[cursor] !== undefined) cursor++;
    if (cursor >= CHORD_ROW_SLOTS) break;
    out[cursor] = c;
    cursor++;
  }
  return out;
}

// =============================================================================
//                                LineRow
// =============================================================================

interface LineRowProps {
  sectionId: string;
  section: Section;
  line: LyricLine;
  active?: boolean;
  isFirst: boolean;
  onAddLineAfter: () => string | void;
  onMergeUp: (kind: "lyric" | "chord") => void;
  onPickerOpen: (lineId: string, slotIndex: number, anchorId?: string) => void;
  onChordFocus: (lineId: string) => void;
  /** The chord id that currently shows its X chip (tab-level, one at a time). */
  activeChordId: string | null;
  onSetActiveChordId: (id: string | null) => void;
  multiSelectedIds?: Set<string>;
  onMultiSelectTap?: (anchorId: string) => void;
  onShiftSelectTap?: (anchorId: string) => void;
  isFocused?: boolean;
  onTextFocus: () => void;
  onTextBlur: () => void;
  onRhymeOpen: () => void;
  effectiveOffset: number;
}

function LineRow({
  sectionId,
  section,
  line,
  active,
  onAddLineAfter,
  onMergeUp,
  onPickerOpen,
  onChordFocus,
  activeChordId,
  onSetActiveChordId,
  multiSelectedIds,
  onMultiSelectTap,
  onShiftSelectTap,
  isFocused,
  onTextFocus,
  onTextBlur,
  onRhymeOpen,
  effectiveOffset,
}: LineRowProps) {
  const {
    setLineText,
    removeChordAnchorsBatch,
    moveChordToSlot,
    addSection,
    undo,
    redo,
    splitLine,
    mergeLineUp,
    addLine,
    noteLyricCaret,
  } = useSongStore();
  const [slashDialog, setSlashDialog] = useState(false);
  const [slashType, setSlashType] = useState<SectionType>("verse");
  const [slashCustomLabel, setSlashCustomLabel] = useState("");
  const isMobile = useIsMobile();
  // Focus a lyric line's textarea and place the caret. Used after split/merge/
  // paste and arrow navigation. The 10ms defer lets React render the new line
  // before we query for it (same pattern as the existing focus-after-add).
  const focusLineAt = useCallback((lineId: string, caret: number) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-lyric-input="${lineId}"]`);
      if (!el) return;
      el.focus();
      const c = Math.max(0, Math.min(caret, el.value.length));
      el.setSelectionRange(c, c);
    }, 10);
  }, []);
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

  // Stable refs so the keydown handler always reads the freshest values.
  const lineChordsRef = useRef(lineChords);
  lineChordsRef.current = lineChords;
  const moveChordToSlotRef = useRef(moveChordToSlot);
  moveChordToSlotRef.current = moveChordToSlot;
  const multiSelectMode = useUIStore((s) => s.multiSelectMode);
  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
  const onMultiSelectTapRef = useRef(onMultiSelectTap);
  onMultiSelectTapRef.current = onMultiSelectTap;
  const onShiftSelectTapRef = useRef(onShiftSelectTap);
  onShiftSelectTapRef.current = onShiftSelectTap;
  const lastClickModifiersRef = useRef({ ctrl: false, shift: false });

  // Task 1: while the chord context menu is showing, arrow keys reorder the chord
  // and Delete removes it.
  useEffect(() => {
    if (!activeChordId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const anchor = lineChordsRef.current.find((c) => c.id === activeChordId);
      if (!anchor) return; // this chord is not in this line
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const slot = anchor.slotIndex ?? 0;
        if (slot > 0) moveChordToSlotRef.current(sectionId, line.id, activeChordId, slot - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const slot = anchor.slotIndex ?? 0;
        if (slot < CHORD_ROW_SLOTS - 1) moveChordToSlotRef.current(sectionId, line.id, activeChordId, slot + 1);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeChordAnchorsBatch(sectionId, line.id, [activeChordId]);
        onSetActiveChordId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeChordId, sectionId, line.id, removeChordAnchorsBatch, onSetActiveChordId]);

  // Edit mode is now managed by SectionCard so a single per-section pencil
  // toggles every row in the section. The per-row pencil that used to live
  // here was lifted out — see the SectionCard header below.

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

  // ---- Slot row keyboard (undo / redo only) ----
  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
    }
  };

  // Task 5: borders become visible when a chord in this line is selected.
  const hasActiveChordInLine = lineChords.some((c) => c.id === activeChordId);
  const slots = chordsBySlot(lineChords);

  return (
    <div
      ref={rowRef}
      className={cn(
        "group pt-1 transition-colors scroll-mt-24",
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
      <div className="flex items-stretch gap-1" style={{ paddingBottom: 4 }}>
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
          className={cn(
            "group relative flex items-center flex-1 min-w-0 rounded-sm bg-[var(--paper-card)] outline-none border border-solid transition-colors",
            hasActiveChordInLine ? "border-muted-foreground/30" : "border-transparent hover:border-muted-foreground/40",
          )}
          style={{ minHeight: 22, paddingTop: 2, paddingBottom: 2, overflowX: "visible", paddingLeft: 8 }}
        >
          {lineChords.length === 0 && (
            <span className="absolute inset-0 flex items-center w-full italic bg-transparent border-0 outline-none resize-none overflow-hidden font-display text-base leading-[1.875rem] text-muted-foreground/60 px-1 ml-1 break-words pointer-events-none select-none" style={{ opacity: 0.4 }}>
              add your chords here
            </span>
          )}

          {/* Slot dividers are now rendered per-slot (border-l on each slot
              past the first) so they stay aligned even when occupied slots
              grow to fit long chord names (28–48px). */}

          {slots.map((anchor, slotIdx) => {
            const occupied = !!anchor;
            const playing = !!anchor && playingAnchorId === anchor.id;
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
                      "relative shrink-0 h-9 flex items-center justify-start border border-solid transition-colors",
                      hasActiveChordInLine ? "border-muted-foreground/20" : "border-transparent",
                      occupied ? "w-10" : "w-7",
                      slotIdx > 0 && (hasActiveChordInLine ? "border-l-muted-foreground/35" : "border-l-transparent"),
                      dropSnapshot.isDraggingOver && !isInvalidDrop && "bg-accent/50 ring-1 ring-primary/50 rounded-sm",
                      dropSnapshot.isDraggingOver && isInvalidDrop && "bg-destructive/10 ring-1 ring-destructive/50 rounded-sm",
                    )}
                    onClick={(e) => {
                      if (occupied) return;
                      e.stopPropagation();
                      onChordFocus(line.id);
                      onPickerOpen(line.id, slotIdx);
                    }}
                  >
                    {occupied && (
                      <div
                        className="relative h-full flex items-center justify-center"
                        data-chip-anchor={anchor!.id}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onSetActiveChordId(null);
                          onPickerOpen(line.id, slotIdx, anchor!.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSetActiveChordId(null);
                          onPickerOpen(line.id, slotIdx, anchor!.id);
                        }}
                        onPointerDown={(e) => {
                          lastClickModifiersRef.current = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChordChip
                          chord={anchor!.chord}
                          variant="ink"
                          size="sm"
                          audition={true}
                          octave={anchor!.chord.octave ?? 4}
                          keyChangeOffset={effectiveOffset}
                          selected={activeChordId === anchor!.id || !!multiSelectedIds?.has(anchor!.id)}
                          onClick={() => {
                            const { ctrl, shift } = lastClickModifiersRef.current;
                            if (ctrl || multiSelectModeRef.current) {
                              onMultiSelectTapRef.current?.(anchor!.id);
                              return;
                            }
                            if (shift) {
                              onShiftSelectTapRef.current?.(anchor!.id);
                              return;
                            }
                            const nextActive = activeChordId === anchor!.id ? null : anchor!.id;
                            onSetActiveChordId(nextActive);
                            if (nextActive) setChordToolbarOpen(true);
                          }}
                          onLongPress={() => {
                            onSetActiveChordId(null);
                            onPickerOpen(line.id, slotIdx, anchor!.id);
                          }}
                        />
                        {playing && (
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-md ring-2 ring-[var(--chord-chip)] animate-pulse pointer-events-none"
                          />
                        )}
                        {activeChordId === anchor!.id && (
                          <button
                            type="button"
                            className="absolute -top-2.5 -left-2.5 z-20 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                            aria-label="Edit chord"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChordToolbarOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {activeChordId === anchor!.id && (
                          <button
                            type="button"
                            className="absolute -bottom-2.5 -left-2.5 z-20 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                            aria-label="Edit chord quality"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetActiveChordId(null);
                              onPickerOpen(line.id, slotIdx, anchor!.id);
                            }}
                          >
                            <ListMusic className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {activeChordId === anchor!.id && (
                          <button
                            type="button"
                            className="absolute -top-2.5 -right-2.5 z-20 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                            aria-label="Delete chord"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeChordAnchorsBatch(sectionId, line.id, [anchor!.id]);
                              onSetActiveChordId(null);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {dropProvided.placeholder}
                  </div>
                )}
              </Droppable>
            );
          })}
          </div>

      </div>

      {/* Floating chord movement menu — appears below chord row when a chord is active.
          Hidden on mobile; mobile uses the global FloatingChordToolbar. */}
      {(() => {
        if (isMobile) return null;
        if (!activeChordId) return null;
        const activeAnchor = lineChords.find((c) => c.id === activeChordId);
        if (!activeAnchor) return null;
        const currentSlot = activeAnchor.slotIndex ?? 0;
        return (
          <div
            data-chord-keep
            className="mt-1 mb-1 flex items-center gap-1 w-fit rounded-lg border bg-popover shadow-md px-1.5 py-1"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={currentSlot <= 0}
              onClick={() => moveChordToSlot(sectionId, line.id, activeChordId, currentSlot - 1)}
              aria-label="Move chord left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-sm font-semibold font-mono">
              {activeAnchor.chord.display}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={currentSlot >= CHORD_ROW_SLOTS - 1}
              onClick={() => moveChordToSlot(sectionId, line.id, activeChordId, currentSlot + 1)}
              aria-label="Move chord right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        );
      })()}

      {/* LYRIC INPUT */}
      <div className="relative flex items-center rounded-sm">
        {isFocused && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRhymeOpen}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded z-10"
            style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-sculpt-cream-rest)", color: "var(--cocoa)" }}
            tabIndex={-1}
            aria-label="Find rhymes"
          >
            <WholeWord className="h-3.5 w-3.5" />
          </button>
        )}
        <textarea
          ref={lyricInputRef}
          data-lyric-input={line.id}
          value={line.text}
          rows={1}
          onFocus={(e) => {
            noteLyricCaret(sectionId, line.id, e.currentTarget.selectionStart ?? 0);
            onTextFocus();
          }}
          onBlur={onTextBlur}
          onSelect={(e) => noteLyricCaret(sectionId, line.id, e.currentTarget.selectionStart ?? 0)}
          onChange={(e) => setLineText(sectionId, line.id, e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            // Single-line paste: let the textarea handle it normally.
            if (!/[\r\n]/.test(text)) return;
            e.preventDefault();
            const ta = lyricInputRef.current;
            const selStart = ta?.selectionStart ?? line.text.length;
            const selEnd = ta?.selectionEnd ?? selStart;
            const segments = text.replace(/\r\n?/g, "\n").split("\n");
            // One grouped undo for the whole multi-line paste.
            withHistoryGroup(() => {
              const cur = line.text;
              setLineText(sectionId, line.id, cur.slice(0, selStart) + segments[0] + cur.slice(selEnd));
              // Push the original tail (text after the selection) onto its own line.
              const res = splitLine(sectionId, line.id, selStart + segments[0].length);
              let afterId = line.id;
              let lastId = res?.newLineId ?? line.id;
              let lastCaret = 0;
              // Insert the middle/last pasted segments before that tail line.
              for (let i = 1; i < segments.length; i++) {
                const newId = addLine(sectionId, afterId);
                setLineText(sectionId, newId, segments[i]);
                afterId = newId;
                lastId = newId;
                lastCaret = segments[i].length;
              }
              focusLineAt(lastId, lastCaret);
            });
          }}
          onBeforeInput={(e: React.FormEvent<HTMLTextAreaElement> & { data?: string }) => {
            // Mobile soft keyboards often fire keydown with key="" / "Unidentified".
            // beforeinput reliably reports the inserted character.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = (e as any).data;
            // Only treat "/" as the new-section command on an empty line, so a
            // literal slash mid-lyric ("24/7", "and/or") types normally.
            if (data === "/" && line.text === "") {
              e.preventDefault();
              setSlashType("verse");
              setSlashCustomLabel("");
              setSlashDialog(true);
              return;
            }
            // Soft-keyboard Enter arrives as an insertLineBreak beforeinput with
            // an empty key, so handle the split here too.
            const inputType = (e.nativeEvent as InputEvent).inputType;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (inputType === "insertLineBreak" && !(e.nativeEvent as any).isComposing) {
              e.preventDefault();
              const ta = lyricInputRef.current;
              const caret = ta?.selectionStart ?? line.text.length;
              const res = splitLine(sectionId, line.id, caret);
              if (res?.newLineId) focusLineAt(res.newLineId, 0);
            }
          }}
          onKeyDown={(e) => {
            // "/" on an empty line opens the New Section dialog. Skip during IME.
            if (e.key === "/" && line.text === "" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              setSlashType("verse");
              setSlashCustomLabel("");
              setSlashDialog(true);
              return;
            }
            const ta = lyricInputRef.current;
            const idx = section.lines.findIndex((l) => l.id === line.id);
            // Enter / Shift+Enter: split the line at the caret, carrying the text
            // after the caret (and its chords) down to a new line.
            if (e.key === "Enter") {
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              const caret = ta?.selectionStart ?? line.text.length;
              const res = splitLine(sectionId, line.id, caret);
              if (res?.newLineId) focusLineAt(res.newLineId, 0);
              return;
            }
            // Backspace at column 0: merge this line onto the END of the previous
            // line (text + chords). Empty or not. First line falls through to the
            // browser default (nothing to merge into).
            if (
              e.key === "Backspace" &&
              ta?.selectionStart === 0 &&
              ta.selectionEnd === 0 &&
              !e.nativeEvent.isComposing
            ) {
              if (idx <= 0) return;
              e.preventDefault();
              const res = mergeLineUp(sectionId, line.id);
              if (res) focusLineAt(res.prevLineId, res.caretIndex);
              return;
            }
            // Delete at end of line: pull the next line up into this one.
            if (
              e.key === "Delete" &&
              ta?.selectionStart === line.text.length &&
              ta.selectionEnd === line.text.length &&
              !e.nativeEvent.isComposing
            ) {
              const next = section.lines[idx + 1];
              if (!next) return;
              e.preventDefault();
              const caret = line.text.length;
              mergeLineUp(sectionId, next.id);
              focusLineAt(line.id, caret);
              return;
            }
            // Arrow Up at line start → end of previous line.
            if (
              e.key === "ArrowUp" &&
              ta?.selectionStart === 0 &&
              ta.selectionEnd === 0 &&
              !e.nativeEvent.isComposing
            ) {
              const prev = section.lines[idx - 1];
              if (prev) {
                e.preventDefault();
                focusLineAt(prev.id, prev.text.length);
              }
              return;
            }
            // Arrow Down at line end → next line, keeping the column where possible.
            if (
              e.key === "ArrowDown" &&
              ta?.selectionStart === line.text.length &&
              ta.selectionEnd === line.text.length &&
              !e.nativeEvent.isComposing
            ) {
              const next = section.lines[idx + 1];
              if (next) {
                e.preventDefault();
                focusLineAt(next.id, next.text.length);
              }
              return;
            }
          }}
          placeholder="Write your lyric line…"
          className={cn(
            "w-full min-h-[1.875rem] bg-transparent border-0 outline-none resize-none overflow-hidden font-display text-base leading-[1.875rem] text-foreground placeholder:italic placeholder:text-muted-foreground/60 dark:placeholder:opacity-40 px-1 ml-1 break-words",
            isFocused && "pr-8",
          )}
        />
      </div>
      <div aria-hidden="true" style={{ height: 1, background: "var(--cocoa)" }} />

      {/* "/" on an empty line → new section dialog */}
      <Dialog
        open={slashDialog}
        onOpenChange={(o) => {
          setSlashDialog(o);
          // Return the caret to the line so typing continues without a re-tap.
          if (!o) setTimeout(() => lyricInputRef.current?.focus(), 0);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New section</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select value={slashType} onValueChange={(v) => setSlashType(v as SectionType)}>
              <SelectTrigger className="capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {slashType === "custom" && (
              <Input
                autoFocus
                placeholder="Custom name (optional)"
                value={slashCustomLabel}
                onChange={(e) => setSlashCustomLabel(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSlashDialog(false); setTimeout(() => lyricInputRef.current?.focus(), 0); }}>Cancel</Button>
            <Button
              onClick={() => {
                addSection(slashType, slashType === "custom" ? slashCustomLabel || undefined : undefined);
                setSlashDialog(false);
                lyricInputRef.current?.focus();
              }}
            >
              Add section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getSectionStartSec(
  sectionId: string,
  allSections: Section[],
  progression: PatternBlock[],
  bpm: number,
): number {
  const spb = 60 / bpm;
  let cursor = 0;
  for (const sec of allSections) {
    if (sec.id === sectionId) return cursor * spb;
    const patterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    for (const p of patterns) cursor += patternPlayBeats(p);
  }
  return cursor * spb;
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
  /** Open the chord editor for an unplaced (progression-only) chord (Door B). */
  onEditProgChord: (sectionId: string, patternId: string, chordId: string) => void;
  sortMode?: boolean;
  onMoveSection?: (id: string, direction: -1 | 1) => void;
  /** Tab-level active chord for X chip (one across all sections). */
  activeChordId: string | null;
  onSetActiveChordId: (id: string | null) => void;
  multiSelectedIds?: Set<string>;
  onMultiSelectTap?: (lineId: string, anchorId: string) => void;
  onShiftSelectTap?: (lineId: string, anchorId: string) => void;
  focusedLineId?: string;
  onLineTextFocus: (lineId: string) => void;
  onLineTextBlur: () => void;
  onRhymeOpen: (lineId: string) => void;
}

function SectionCard({
  section,
  index,
  total,
  displayName,
  activeLineId,
  onPickerOpen,
  onPickerClose,
  onEditProgChord,
  sortMode,
  onMoveSection,
  activeChordId,
  onSetActiveChordId,
  multiSelectedIds,
  onMultiSelectTap,
  onShiftSelectTap,
  focusedLineId,
  onLineTextFocus,
  onLineTextBlur,
  onRhymeOpen,
}: SectionCardProps) {
  const {
    addLine,
    removeLine,
    updateSection,
    removeSection,
    duplicateSection,
    toggleSectionCollapsed,
    upsertChordAt,
    setSectionComment,
    setSectionColor,
    setSectionArpArmed,
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
    movePatternChord,
    removeChordAnchorsBatch,
    attachChordToLyrics,
    undo,
  } = useSongStore();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(section.label);
  const prevTypeRef = useRef<SectionType | null>(null);
  const prevLabelRef = useRef<string>(section.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [pendingKeyChange, setPendingKeyChange] = useState(false);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false);
  const [overdubOpen, setOverdubOpen] = useState(false);
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const allSections = useSongStore((s) => s.sections);
  const progression = useSongStore((s) => s.progression);
  const bpm = useSongStore((s) => s.meta.bpm);
  const recTracks = useRecordingsStore((s) => s.tracks);
  const effectiveOffsets = useMemo(() => computeEffectiveOffsets(allSections), [allSections]);
  const effectiveOffset = effectiveOffsets[index] ?? 0;
  const isFirstSection = index === 0;

  // Play-from-section, mirroring the Arrange tab's section header button.
  const sectionBlocks = useMemo(
    () => progression.filter((p) => (p.sectionId ?? p.id) === section.id),
    [progression, section.id],
  );

  // Unplaced (progression-only) chords: a block anchor but no lyric word.
  // Ordered by block order then position within the block, mirroring the
  // Arrange/ProgressionsTab layout — they are NOT pinned to any lyric line, so
  // they never travel when lyrics move. Rendered in their own chord row below.
  const unplacedChords = useMemo(() => {
    const blockOrder = new Map(sectionBlocks.map((b, i) => [b.id, i]));
    return section.chords
      .filter((sc) => sc.progressionPlacement && !sc.lyricsPlacement)
      .map((sc) => {
        const pp = sc.progressionPlacement!;
        return { sc, patternId: pp.patternId, key: (blockOrder.get(pp.patternId) ?? 1e6) * 1e6 + pp.startBeat };
      })
      .sort((a, b) => a.key - b.key);
  }, [section.chords, sectionBlocks]);
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isGlobalPlaying = usePlaybackStore((s) => s.isPlaying);
  const isSectionPlaying = isGlobalPlaying && sectionBlocks.some((b) => b.id === playbackCurrent?.patternId);
  const firstSectionChord = useMemo(() => {
    const blockOrder = new Map(sectionBlocks.map((b, i) => [b.id, i]));
    const withPlacement = section.chords.filter((c) => c.progressionPlacement != null);
    if (!withPlacement.length) return null;
    return [...withPlacement].sort((a, b) => {
      const ao = blockOrder.get(a.progressionPlacement!.patternId) ?? Infinity;
      const bo = blockOrder.get(b.progressionPlacement!.patternId) ?? Infinity;
      if (ao !== bo) return ao - bo;
      return a.progressionPlacement!.startBeat - b.progressionPlacement!.startBeat;
    })[0];
  }, [section.chords, sectionBlocks]);

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

  const changeSectionType = (next: SectionType) => {
    if (next === "custom") {
      prevTypeRef.current = section.type;
      prevLabelRef.current = section.label;
      updateSection(section.id, { type: next, label: section.label || "Section" });
      setDraftLabel(section.label && section.type === "custom" ? section.label : "");
      setCustomRenameOpen(true);
    } else {
      updateSection(section.id, { type: next, label: section.label });
    }
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
    // Backspace-merge never interrupts the typing flow with a dialog — the row
    // is removed immediately and an undoable toast covers the rare case where
    // the merged row still carried chords (or lyrics).
    removeLine(section.id, lineId);
    focusPrevLine(lineId);
    if (hasOpposite) {
      toast("Row deleted", { action: { label: "Undo", onClick: () => undo() } });
    }
  };

  const hasComment = !!(section.comment && section.comment.trim().length);

  return (
    <div
      data-section-id={section.id}
      style={{ ...sectionTintStyle(section.color, 0.35), backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      className={cn("noise-texture-surface rounded-xl px-2 py-2 shadow-none border-0")}
    >
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-3 h-12 rounded-xl bg-[#b2b0a4] select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
        style={{ color: "oklch(0.3267 0.027 60.1)" }}
      >
        <button
          type="button"
          onClick={() => toggleSectionCollapsed(section.id)}
          disabled={sortMode}
          aria-expanded={!section.collapsed}
          aria-label={section.collapsed ? "Expand section" : "Collapse section"}
          title={section.collapsed ? "Expand section" : "Collapse section"}
          className="inline-flex min-w-0 items-center gap-2 rounded-[var(--pill-radius,8px)] disabled:opacity-100"
          style={{
            padding: "5px 12px",
            background: "transparent",
            color: "inherit",
            fontFamily: "'Nunito', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <Music2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{displayName}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", section.collapsed && "-rotate-90")}
          />
        </button>

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

        {!sortMode && !isFirstSection && (
          <KeyChangeSticker
            sectionId={section.id}
            effectiveOffset={effectiveOffset}
            explicitOffset={section.keyChangeRootOffset}
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
            <SectionColorPicker
              value={section.color}
              onChange={(c) => setSectionColor(section.id, c)}
              className={isMobile ? "hidden" : undefined}
            />
            <button
              onClick={() => {
                if (section.collapsed) toggleSectionCollapsed(section.id);
                setCommentOpen((o) => !o);
              }}
              className="relative h-9 w-9 inline-flex items-center justify-center rounded-md bg-[#dad8d2] text-[var(--pill-rest-fg)]/80 hover:text-[var(--pill-rest-fg)] transition-colors"
              aria-label={hasComment ? "View comment" : "Add comment"}
            >
              <Plus className="h-3 w-3 absolute top-2 left-2" />
              <MessageSquare className="h-4 w-4" />
              {hasComment && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => duplicateSection(section.id)}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-[#dad8d2] text-[var(--pill-rest-fg)]/80 hover:text-[var(--pill-rest-fg)] transition-colors"
              aria-label="Duplicate section"
              title="Duplicate section"
            >
              <Copy className="h-4 w-4" />
            </button>
            {recTracks.length > 0 && (
              <Popover open={overdubOpen} onOpenChange={setOverdubOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-[#dad8d2] text-destructive/90 hover:text-destructive transition-colors"
                    aria-label="Overdub this section"
                    title="Overdub this section"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-2">
                  <p className="text-xs font-semibold mb-2 px-1">Record onto track</p>
                  <div className="flex flex-col gap-1">
                    {recTracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                        onClick={() => {
                          setOverdubOpen(false);
                          const startSec = getSectionStartSec(section.id, allSections, progression, bpm);
                          // The multitrack recorder lives in arrange mode's
                          // TrackTimeline. Hand the request off through the store
                          // and switch surfaces so it's mounted to receive it.
                          useRecordingsStore.getState().setPendingOverdub({ trackId: t.id, startSec });
                          useUIStore.getState().setArrangeView("track");
                          useUIStore.getState().setMode("arrange");
                        }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: t.color }}
                        />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-[#dad8d2] text-[var(--pill-rest-fg)]/80 hover:text-[var(--pill-rest-fg)] transition-colors"
                  aria-label="Section options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Section</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Music2 className="h-4 w-4" /> Change type
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {SECTION_TYPES.map((t) => (
                      <DropdownMenuItem
                        key={t}
                        className="capitalize"
                        onClick={() => changeSectionType(t)}
                      >
                        {t}
                        {section.type === t && <Check className="ml-auto h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {isMobile && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <p className="text-xs text-muted-foreground mb-1.5">Section color</p>
                      <div className="grid grid-cols-8 gap-1">
                        {SECTION_COLOR_KEYS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSectionColor(section.id, c)}
                            aria-label={`Set color ${c}`}
                            title={c}
                            className={cn(
                              "h-6 w-6 rounded-md border border-border transition-transform",
                              section.color === c && "ring-2 ring-primary scale-110",
                            )}
                            style={{ backgroundColor: `var(--section-tint-${c})` }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSectionColor(section.id, null)}
                        className="mt-1.5 w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-0.5"
                      >
                        <X className="h-3 w-3" /> Clear color
                      </button>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
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
                    checked={section.arpArmed !== false}
                    onCheckedChange={(b) => setSectionArpArmed(section.id, b)}
                    aria-label="Toggle arpeggiator for this section"
                  />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (suppressCrossTabDeleteWarning) removeSection(section.id);
                    else setConfirmDeleteSection(true);
                  }}
                  disabled={total <= 1}
                  title={total <= 1 ? "Cannot delete the last section" : undefined}
                >
                  <Trash2 className="h-4 w-4" /> Delete section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

      </div>

      {/* Body */}
      {!section.collapsed && (
        <>

          <div className="mt-2 space-y-1">
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
                onChordFocus={() => {}}
                activeChordId={activeChordId}
                onSetActiveChordId={onSetActiveChordId}
                multiSelectedIds={multiSelectedIds}
                onMultiSelectTap={(anchorId) => onMultiSelectTap?.(line.id, anchorId)}
                onShiftSelectTap={(anchorId) => onShiftSelectTap?.(line.id, anchorId)}
                isFocused={focusedLineId === line.id}
                onTextFocus={() => onLineTextFocus(line.id)}
                onTextBlur={onLineTextBlur}
                onRhymeOpen={() => onRhymeOpen(line.id)}
                effectiveOffset={effectiveOffset}
              />
            ))}
          </div>

          {/* Basket chords are now drag-and-dropped directly into chord-row slots. */}

          {/* Progression-only chords: anchored to blocks, not lyric words.
              Tap to select, again (or long-press) to edit; reorder with the
              arrows; X removes. They follow block order, not the lyrics. */}
          {unplacedChords.length > 0 && (
            <div
              data-chord-keep
              className="mt-2 rounded-md px-2 py-2"
              style={{ background: "var(--paper-shade)", boxShadow: "var(--shadow-recess)" }}
              onClick={() => onSetActiveChordId(null)}
            >
              <div className="mb-1.5 flex items-center gap-1 text-[11px] uppercase tracking-wide text-[var(--ink-soft)]">
                <Music2 className="h-3 w-3" />
                Chords
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unplacedChords.map(({ sc, patternId }) => {
                  const selected = activeChordId === sc.id;
                  return (
                    <div key={sc.id} className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
                      <ChordChip
                        chord={sc.chord}
                        keyChangeOffset={effectiveOffset}
                        selected={selected}
                        onClick={() =>
                          selected ? onEditProgChord(section.id, patternId, sc.id) : onSetActiveChordId(sc.id)
                        }
                        onLongPress={() => onEditProgChord(section.id, patternId, sc.id)}
                      />
                      {selected && (
                        <span className="ml-0.5 inline-flex items-center">
                          <button
                            type="button"
                            aria-label="Edit chord"
                            onClick={() => onEditProgChord(section.id, patternId, sc.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Add to lyrics"
                            title="Add to lyric line"
                            onClick={() => attachChordToLyrics(section.id, sc.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          >
                            <Type className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move chord earlier"
                            onClick={() => movePatternChord(patternId, sc.id, -1)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move chord later"
                            onClick={() => movePatternChord(patternId, sc.id, 1)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove chord"
                            onClick={() => {
                              removeChordAnchorsBatch(section.id, "", [sc.id]);
                              onSetActiveChordId(null);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comment textarea (toggle button is in the section header) */}
          {commentOpen && (
            <div className="mt-3 w-full">
              <Textarea
                value={section.comment ?? ""}
                onChange={(e) => setSectionComment(section.id, e.target.value)}
                placeholder="Notes for this section…"
                className="min-h-[80px] font-display text-base"
              />
            </div>
          )}
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
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions" | "recordings" | "voicekey") => void;
  showOnboarding?: boolean;
}

export function LyricsTab({ sortMode = false, onSwitchTab, showOnboarding = true }: LyricsTabProps) {
  const {
    sections,
    upsertChordAt,
    updatePatternChord,
    addSection,
    moveSection,
    moveChordToSlot,
    setLineText,
    placeChordInSlot,
    pasteChordsAt,
    autoLayoutSection,
    updatePattern,
    setSectionChordsLength,
    setPatternChordLength,
  } = useSongStore();
  const progression = useSongStore((s) => s.progression);
  const defaultChordLen = useDefaultsStore((s) => s.defaultChordLengthBeats);

  const [picker, setPicker] = useState<{
    sectionId: string;
    lineId: string;
    /** Target slot in the chord row (0..19). */
    slotIndex: number;
    anchorId?: string;
    /** Set when editing an unplaced progression-only chord (Door B): edits
     *  route to updatePatternChord and never touch lyrics placement. */
    prog?: { patternId: string; chordId: string };
  } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  // After an undo/redo that moved a lyric line, restore the caret to where the
  // edit happened so typing continues uninterrupted.
  const pendingCaret = useSongStore((s) => s.pendingCaret);
  const clearPendingCaret = useSongStore((s) => s.clearPendingCaret);
  useEffect(() => {
    if (!pendingCaret) return;
    const { lineId, caret } = pendingCaret;
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-lyric-input="${lineId}"]`);
      if (el) {
        el.focus();
        const c = Math.max(0, Math.min(caret, el.value.length));
        el.setSelectionRange(c, c);
      }
      clearPendingCaret();
    }, 20);
    return () => window.clearTimeout(handle);
  }, [pendingCaret, clearPendingCaret]);

  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const { enabled: onboardingEnabled, lyricsStep, setLyricsStep, progressionsStep, setProgressionsStep, showNewSongPrompt, dismissNewSongPrompt, disable: disableOnboarding, dismissedKey, dismissCoachMark } = useOnboardingStore();
  const canShowCoachMark = onboardingEnabled && showOnboarding;
  const lyricsRootRef = useRef<HTMLDivElement>(null);
  const chordPickerHeaderRef = useRef<HTMLDivElement | null>(null);
  const focusedEditorHeaderRef = useRef<HTMLDivElement | null>(null);
  const firstLyricRowRef = useRef<HTMLElement | null>(null);
  const firstChordRowRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const lineId = sections[0]?.lines[0]?.id;
    if (!lineId) {
      firstLyricRowRef.current = null;
      firstChordRowRef.current = null;
      return;
    }
    firstLyricRowRef.current = document.querySelector<HTMLElement>(`[data-lyric-input="${lineId}"]`);
    firstChordRowRef.current = document.querySelector<HTMLElement>(`[data-chord-row="${lineId}"]`);
  });
  useEffect(() => {
    if (onboardingEnabled && lyricsStep === 3 && picker?.anchorId) {
      setLyricsStep(4);
    }
  }, [picker?.anchorId, lyricsStep, onboardingEnabled, setLyricsStep]);
  const pickerOpenRef = useRef<boolean>(false);
  useEffect(() => {
    const wasOpen = pickerOpenRef.current;
    const isOpen = !!picker;
    pickerOpenRef.current = isOpen;
    if (wasOpen && !isOpen && onboardingEnabled && lyricsStep === 2) {
      setLyricsStep(3);
    }
  }, [picker, lyricsStep, onboardingEnabled, setLyricsStep]);
  const [activeChordId, setActiveChordId] = useState<string | null>(null);
  const [lyricMultiSelected, setLyricMultiSelected] =
    useState<Map<string, { sectionId: string; lineId: string }>>(new Map());
  const lyricMultiSelectedIds = useMemo(
    () => new Set(lyricMultiSelected.keys()),
    [lyricMultiSelected],
  );
  const rangeAnchorRef = useRef<{ sectionId: string; lineId: string; anchorId: string } | null>(null);
  const toggleLyricMultiSelected = useCallback(
    (anchorId: string, ctx: { sectionId: string; lineId: string }) => {
      rangeAnchorRef.current = { ...ctx, anchorId };
      setLyricMultiSelected((prev) => {
        const next = new Map(prev);
        if (next.has(anchorId)) next.delete(anchorId);
        else next.set(anchorId, ctx);
        return next;
      });
    },
    [],
  );
  const rangeSelectLyricChords = useCallback(
    (sectionId: string, lineId: string, anchorId: string) => {
      const sec = sections.find((s) => s.id === sectionId);
      if (!sec) return;
      const ordered = sec.lines.flatMap((l) =>
        getLineChordsViaSSOT(sec, l.id)
          .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
          .map((c) => ({ anchorId: c.id, sectionId, lineId: l.id }))
      );
      const fromId = rangeAnchorRef.current?.anchorId ?? activeChordId;
      if (!fromId) {
        toggleLyricMultiSelected(anchorId, { sectionId, lineId });
        return;
      }
      const fromIdx = ordered.findIndex((x) => x.anchorId === fromId);
      const toIdx = ordered.findIndex((x) => x.anchorId === anchorId);
      if (fromIdx < 0 || toIdx < 0) {
        toggleLyricMultiSelected(anchorId, { sectionId, lineId });
        return;
      }
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      setLyricMultiSelected((prev) => {
        const next = new Map(prev);
        for (let i = lo; i <= hi; i++) {
          const item = ordered[i];
          next.set(item.anchorId, { sectionId: item.sectionId, lineId: item.lineId });
        }
        return next;
      });
    },
    [sections, activeChordId, toggleLyricMultiSelected],
  );
  const chordClipboard = useUIStore((s) => s.chordClipboard);
  const setChordClipboard = useUIStore((s) => s.setChordClipboard);
  const [pastePending, setPastePending] = useState<{
    chords: ClipboardChord[];
    target: { sectionId: string; lineId: string; atCol: number } | null;
  } | null>(null);
  const [focusedLineInfo, setFocusedLineInfo] = useState<{ sectionId: string; lineId: string } | null>(null);
  const [rhymeOpen, setRhymeOpen] = useState(false);
  const [rhymeTarget, setRhymeTarget] = useState<{
    sectionId: string;
    lineId: string;
    lines: string[];
    lineIds: string[];
    activeIdx: number;
  } | null>(null);

  const handleCopyChords = useCallback(() => {
    const sec = sections;
    const getChordData = (anchorId: string, sectionId: string): ClipboardChord | null => {
      const section = sec.find((s) => s.id === sectionId);
      const sc = section?.chords.find((c) => c.id === anchorId);
      if (!sc) return null;
      return { chord: sc.chord, lengthBeats: sc.progressionPlacement?.lengthBeats };
    };
    let copied: ClipboardChord[] = [];
    if (lyricMultiSelected.size > 0) {
      const sorted = Array.from(lyricMultiSelected.entries()).map(([id, ctx]) => {
        const section = sec.find((s) => s.id === ctx.sectionId);
        const anchor = section?.lines.find((l) => l.id === ctx.lineId)?.chords.find((c) => c.id === id);
        return { id, ctx, slotIndex: anchor?.slotIndex ?? 0 };
      }).sort((a, b) => a.slotIndex - b.slotIndex);
      copied = sorted.flatMap(({ id, ctx }) => {
        const data = getChordData(id, ctx.sectionId);
        return data ? [data] : [];
      });
    } else if (activeChordId) {
      for (const section of sec) {
        const sc = section.chords.find((c) => c.id === activeChordId);
        if (sc) {
          copied = [{ chord: sc.chord, lengthBeats: sc.progressionPlacement?.lengthBeats }];
          break;
        }
      }
    }
    if (copied.length > 0) setChordClipboard(copied);
  }, [sections, lyricMultiSelected, activeChordId, setChordClipboard]);

  const handlePasteRequest = useCallback(() => {
    if (chordClipboard.length === 0) return;
    // Default target: after active chord, or slot 0 of active section's first line
    let target: { sectionId: string; lineId: string; atCol: number } | null = null;
    if (activeChordId) {
      for (const section of sections) {
        for (const line of section.lines) {
          const anchor = line.chords.find((c) => c.id === activeChordId);
          if (anchor) {
            target = { sectionId: section.id, lineId: line.id, atCol: (anchor.slotIndex ?? 0) + 1 };
            break;
          }
        }
        if (target) break;
      }
    }
    if (!target && sections.length > 0) {
      const sec = sections[0];
      const line = sec.lines[0];
      if (line) target = { sectionId: sec.id, lineId: line.id, atCol: 0 };
    }
    setPastePending({ chords: chordClipboard, target });
  }, [chordClipboard, sections, activeChordId]);

  const handleLineTextFocus = (sectionId: string, lineId: string) => {
    setFocusedLineInfo({ sectionId, lineId });
    if (onboardingEnabled && lyricsStep === 1) setLyricsStep(2);
  };
  const handleLineTextBlur = () =>
    setFocusedLineInfo(null);
  const handleRhymeOpen = (sectionId: string, lineId: string) => {
    setFocusedLineInfo({ sectionId, lineId });
    const section = sections.find((s) => s.id === sectionId);
    const nonOverflowLines = section?.lines.filter((l) => !l._isChordOverflow) ?? [];
    const activeIdx = Math.max(0, nonOverflowLines.findIndex((l) => l.id === lineId));
    setRhymeTarget({
      sectionId,
      lineId,
      lines: nonOverflowLines.map((l) => l.text),
      lineIds: nonOverflowLines.map((l) => l.id),
      activeIdx,
    });
    setRhymeOpen(true);
  };
  const handleRhymeClose = () => {
    setRhymeOpen(false);
    const lineId = rhymeTarget?.lineId;
    setRhymeTarget(null);
    if (lineId) setTimeout(() =>
      document.querySelector<HTMLTextAreaElement>(`[data-lyric-input="${lineId}"]`)?.focus()
    , 50);
  };

  // Suppress the picker-open click that fires after dropping a chord.
  const justDraggedAtRef = useRef<number>(0);

  const openPicker = (sectionId: string, lineId: string, slotIndex: number, anchorId?: string) => {
    if (Date.now() - justDraggedAtRef.current < 350) return;
    setPicker({ sectionId, lineId, slotIndex, anchorId });
  };

  // Edit an unplaced progression-only chord. Reuses the chord picker but
  // commits through the progression door (updatePatternChord), so the chord
  // stays unplaced and never acquires a lyrics placement.
  const openProgPicker = (sectionId: string, patternId: string, chordId: string) => {
    setPicker({ sectionId, lineId: "", slotIndex: 0, anchorId: chordId, prog: { patternId, chordId } });
  };

  // Auto-layout watchdog: when a section's chord count grows, debounce a
  // viewport-aware reflow so the user sees them spread out cleanly.
  // Fix B (Issue #2): pause while the FocusedChordEditor is open via the
  // shared UI store. We collect "grown" sections without firing, and flush
  // exactly once when the editor closes.
  const prevCountsRef = useRef<Record<string, number> | null>(null);
  const pendingGrownRef = useRef<Set<string>>(new Set());
  const [overflowToastFor, setOverflowToastFor] = useState<Record<string, number>>({});
  const [residualOverflowFor, setResidualOverflowFor] = useState<Record<string, boolean>>({});
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
        dbgLog("orientation changed but not a mobile device — skipping toast");
        return;
      }
      // Non-blocking: don't interrupt writing with a modal. Offer a one-tap
      // re-fit and otherwise leave the user's chord placements alone.
      toast("Screen rotated", {
        description: "Chord layouts were kept as-is.",
        action: {
          label: "Re-fit",
          onClick: () => {
            const st = useSongStore.getState();
            st.sections.forEach((s) => st.autoLayoutSection(s.id, window.innerWidth, 28));
          },
        },
      });
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


  // Desktop: hold Shift or Ctrl to enter multi-select mode
  const setMultiSelectMode = useUIStore((s) => s.setMultiSelectMode);
  useEffect(() => {
    if (!isDesktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Shift" || e.key === "Control") &&
          (e.target as HTMLElement)?.tagName !== "INPUT" &&
          (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        setMultiSelectMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key === "Control") setMultiSelectMode(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      setMultiSelectMode(false);
    };
  }, [isDesktop, setMultiSelectMode]);

  // Desktop: Up/Down arrows move chord selection between chord rows
  const activeChordIdRef = useRef<string | null>(null);
  activeChordIdRef.current = activeChordId;
  useEffect(() => {
    if (!isDesktop) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const aid = activeChordIdRef.current;
      if (!aid) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const { sections: allSections } = useSongStore.getState();
      let foundSI = -1, foundLI = -1, foundChord: ChordAnchor | null = null;
      outer: for (let si = 0; si < allSections.length; si++) {
        for (let li = 0; li < allSections[si].lines.length; li++) {
          const ch = allSections[si].lines[li].chords.find((c) => c.id === aid);
          if (ch) { foundSI = si; foundLI = li; foundChord = ch; break outer; }
        }
      }
      if (!foundChord) return;
      const currentSlot = foundChord.slotIndex ?? 0;
      const dir = e.key === "ArrowUp" ? -1 : 1;
      let targetSection: (typeof allSections)[0] | null = null;
      let targetLineIdx = -1;
      const nextLI = foundLI + dir;
      if (nextLI >= 0 && nextLI < allSections[foundSI].lines.length) {
        targetSection = allSections[foundSI]; targetLineIdx = nextLI;
      } else if (dir < 0 && foundSI > 0) {
        const ps = allSections[foundSI - 1];
        targetSection = ps; targetLineIdx = ps.lines.length - 1;
      } else if (dir > 0 && foundSI < allSections.length - 1) {
        targetSection = allSections[foundSI + 1]; targetLineIdx = 0;
      }
      if (!targetSection || targetLineIdx < 0) return;
      const targetLine = targetSection.lines[targetLineIdx];
      if (!targetLine) return;
      const targetChords = getLineChordsViaSSOT(targetSection, targetLine.id);
      if (!targetChords.length) return;
      const closest = targetChords.reduce((best, c) =>
        Math.abs((c.slotIndex ?? 0) - currentSlot) < Math.abs((best.slotIndex ?? 0) - currentSlot) ? c : best,
      );
      setActiveChordId(closest.id);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop]);

  const activeSection = picker ? sections.find((s) => s.id === picker.sectionId) : undefined;
  const activeLine = activeSection?.lines.find((l) => l.id === picker?.lineId);
  const initialChord = picker?.prog
    ? activeSection?.chords.find((c) => c.id === picker.prog!.chordId)?.chord
    : activeLine?.chords.find((c) => c.id === picker?.anchorId)?.chord;

  useEffect(() => {
    if (picker) setPickerQuery(initialChord?.display ?? "");
    else setPickerQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker?.sectionId, picker?.lineId, picker?.anchorId]);

  // ── Overflow detection ───────────────────────────────────────────────────
  // Captures a pending chord when adding it would spill into a new continuation
  // block. The resolver sheet lets the user choose how to handle it instead of
  // silently spawning extra blocks.
  const [overflowPending, setOverflowPending] = useState<{
    chords: ChordSymbol[];
    sectionId: string;
    lineId: string;
    startSlot: number;
    totalCap: number;
    totalUsed: number;
    existingPlacedCount: number;
    lastBlock: PatternBlock;
  } | null>(null);

  const checkOverflow = (sectionId: string, newChordCount = 1) => {
    const sec = sections.find((s) => s.id === sectionId);
    const sectionBlocks = progression.filter((p) => (p.sectionId ?? p.id) === sectionId);
    if (!sec || !sectionBlocks.length) return null;
    const totalCap = sectionBlocks.reduce((s, p) => s + p.bars * p.beatsPerBar, 0);
    const placedChords = sec.chords.filter((sc) => sc.progressionPlacement);
    const totalUsed = placedChords.reduce((s, sc) => s + sc.progressionPlacement!.lengthBeats, 0);
    const wouldOverflow = totalUsed + newChordCount * defaultChordLen > totalCap + 1e-9;
    if (!wouldOverflow) return null;
    return {
      totalCap,
      totalUsed,
      existingPlacedCount: placedChords.length,
      lastBlock: sectionBlocks[sectionBlocks.length - 1],
    };
  };

  // Resolve overflow: resize all chords in the section to `newLength` then
  // place the pending chord(s). Zustand set is synchronous so the second
  // placeChordInSlot call sees the updated (smaller) usage.
  const resolveOverflowCompress = (newLength: number) => {
    if (!overflowPending) return;
    const { chords, sectionId, lineId, startSlot } = overflowPending;
    setSectionChordsLength(sectionId, newLength);
    let nextSlot = startSlot;
    for (const chord of chords) {
      const result = placeChordInSlot(sectionId, lineId, nextSlot, chord);
      if (result) {
        const fresh = useSongStore.getState().sections.find((s) => s.id === sectionId);
        const sc = fresh?.chords.find((c) => c.id === result.id);
        if (sc?.progressionPlacement) {
          setPatternChordLength(sc.progressionPlacement.patternId, result.id, newLength);
        }
      }
      nextSlot = Math.min(CHORD_ROW_SLOTS - 1, (result?.slotIndex ?? nextSlot) + 1);
    }
    advancePickerAfterBatch(startSlot, nextSlot);
    setOverflowPending(null);
  };

  // Resolve overflow: expand the last block then place pending chord(s).
  const resolveOverflowExpand = () => {
    if (!overflowPending) return;
    const { chords, sectionId, lineId, startSlot, totalUsed, totalCap, existingPlacedCount, lastBlock } = overflowPending;
    const incoming = chords.length * defaultChordLen;
    const deficit = totalUsed + incoming - totalCap;
    const extraBars = Math.ceil(deficit / lastBlock.beatsPerBar);
    updatePattern(lastBlock.id, { bars: lastBlock.bars + extraBars });
    let nextSlot = startSlot;
    for (const chord of chords) {
      const result = placeChordInSlot(sectionId, lineId, nextSlot, chord);
      nextSlot = Math.min(CHORD_ROW_SLOTS - 1, (result?.slotIndex ?? nextSlot) + 1);
    }
    advancePickerAfterBatch(startSlot, nextSlot);
    setOverflowPending(null);
    void existingPlacedCount; // used for display only
  };

  // Resolve overflow: proceed normally (spawn continuation block).
  const resolveOverflowContinue = () => {
    if (!overflowPending) return;
    const { chords, sectionId, lineId, startSlot } = overflowPending;
    let nextSlot = startSlot;
    for (const chord of chords) {
      const result = placeChordInSlot(sectionId, lineId, nextSlot, chord);
      nextSlot = Math.min(CHORD_ROW_SLOTS - 1, (result?.slotIndex ?? nextSlot) + 1);
    }
    advancePickerAfterBatch(startSlot, nextSlot);
    setOverflowPending(null);
  };

  const advancePickerAfterBatch = (startSlot: number, nextSlot: number) => {
    void startSlot;
    setPickerQuery("");
    setPicker((prev) =>
      prev ? { ...prev, anchorId: undefined, slotIndex: Math.min(CHORD_ROW_SLOTS - 1, nextSlot) } : prev,
    );
  };

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    // Door B: editing an unplaced progression-only chord — swap the symbol on
    // the block chord without ever creating a lyrics placement.
    if (picker.prog) {
      updatePatternChord(picker.prog.patternId, picker.prog.chordId, { chord });
      setPickerQuery("");
      setPicker(null);
      return;
    }
    const sec = sections.find((s) => s.id === picker.sectionId);
    const line = sec?.lines.find((l) => l.id === picker.lineId);
    if (!sec || !line) return;
    if (picker.anchorId) {
      // Editing existing chord: keep its slot, swap symbol, then close.
      upsertChordAt(picker.sectionId, picker.lineId, picker.slotIndex, chord, picker.anchorId);
      if (onboardingEnabled && lyricsStep === 4) setLyricsStep(5);
      setPickerQuery("");
      setPicker(null);
      return;
    }
    // Placing new chord into the requested slot — check for block overflow first.
    const overflow = checkOverflow(picker.sectionId, 1);
    if (overflow) {
      setOverflowPending({
        chords: [chord],
        sectionId: picker.sectionId,
        lineId: picker.lineId,
        startSlot: picker.slotIndex,
        ...overflow,
      });
      setPickerQuery("");
      return;
    }
    placeChordInSlot(picker.sectionId, picker.lineId, picker.slotIndex, chord);
    setPickerQuery("");
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

  // Nashville batch insert: picker.slotIndex is stale inside a forEach closure
  // because React batches the setPicker updates. We track the slot synchronously
  // using the actual placed-slot returned by placeChordInSlot (Zustand set is
  // synchronous, so each call sees state from the previous one).
  const handlePickBatch = (chords: ChordSymbol[]) => {
    if (!picker || picker.prog || picker.anchorId) return;
    const overflow = checkOverflow(picker.sectionId, chords.length);
    if (overflow) {
      setOverflowPending({
        chords,
        sectionId: picker.sectionId,
        lineId: picker.lineId,
        startSlot: picker.slotIndex,
        ...overflow,
      });
      setPickerQuery("");
      return;
    }
    let nextSlot = picker.slotIndex;
    for (const chord of chords) {
      const result = placeChordInSlot(picker.sectionId, picker.lineId, nextSlot, chord);
      nextSlot = Math.min(CHORD_ROW_SLOTS - 1, (result?.slotIndex ?? nextSlot) + 1);
    }
    setPickerQuery("");
    setPicker((prev) => (prev ? { ...prev, anchorId: undefined, slotIndex: nextSlot } : prev));
  };

  // Detected-chord chips (from the recordings strip) are the only draggables
  // that target lyric slots. Their draggableId is `detected:<chordId>`; the
  // slot droppableId is `slot:<sectionId>:<lineId>:<slotIndex>`. Resolve the
  // chord from the transcription store and let placeChordInSlot reflow.
  const onDragEnd = (result: DropResult) => {
    justDraggedAtRef.current = Date.now();
    const { destination, draggableId } = result;
    if (!destination || !draggableId.startsWith("detected:")) return;
    const parts = destination.droppableId.split(":");
    if (parts[0] !== "slot") return;
    const [, sectionId, lineId, slotStr] = parts;
    const slotIndex = parseInt(slotStr, 10);
    if (Number.isNaN(slotIndex)) return;
    const chordId = draggableId.slice("detected:".length);
    const detected = useTranscriptionStore.getState().findChord(chordId);
    if (!detected) return;
    useSongStore.getState().placeChordInSlot(sectionId, lineId, slotIndex, detected.chord);
    useTranscriptionStore.getState().removeChordById(chordId);
  };

  // Register tab-level handlers with the global DnD store. We use refs so the
  // single <DragDropContext> in Index.tsx always invokes the freshest closure
  // without forcing re-registration on every render.
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const setLyricsOnDragEnd = useDndStore((s) => s.setLyricsOnDragEnd);
  useEffect(() => {
    setLyricsOnDragEnd((r) => onDragEndRef.current(r));
    return () => setLyricsOnDragEnd(null);
  }, [setLyricsOnDragEnd]);

  // Ctrl+C / Ctrl+V keyboard shortcuts for chord copy/paste.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "c" || e.key === "C") {
        if (activeChordId || lyricMultiSelected.size > 0) {
          e.preventDefault();
          handleCopyChords();
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
  }, [activeChordId, lyricMultiSelected, chordClipboard, handleCopyChords, handlePasteRequest]);

  // Tapping anywhere outside a chord, its overlay icons, the chord-editing
  // toolbar/menu, or any open menu/sheet clears the active-chord selection.
  useEffect(() => {
    if (!activeChordId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveChordId(null);
    };
    const handlePointer = (e: PointerEvent) => {
      // Ignore pointer events while the full-screen chord editor is open — it's
      // a modal that owns dismissal, and a scroll inside it must not clear the
      // selection out from under it.
      if (useUIStore.getState().focusedEditorOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-chip-anchor],[data-chord-keep],[role="dialog"],[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper]')) return;
      setActiveChordId(null);
      setLyricMultiSelected(new Map());
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointer, true);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointer, true);
    };
  }, [activeChordId]);

  return (
    <>
    <div className="relative space-y-4" ref={lyricsRootRef}>
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
            onEditProgChord={openProgPicker}
            activeChordId={activeChordId}
            onSetActiveChordId={setActiveChordId}
            multiSelectedIds={lyricMultiSelectedIds}
            onMultiSelectTap={(lineId, anchorId) =>
              toggleLyricMultiSelected(anchorId, { sectionId: sec.id, lineId })
            }
            onShiftSelectTap={(lineId, anchorId) =>
              rangeSelectLyricChords(sec.id, lineId, anchorId)
            }
            sortMode={sortMode}
            onMoveSection={(id, direction) => moveSection(id, direction)}
            focusedLineId={focusedLineInfo?.sectionId === sec.id ? focusedLineInfo.lineId : undefined}
            onLineTextFocus={(lineId) => handleLineTextFocus(sec.id, lineId)}
            onLineTextBlur={handleLineTextBlur}
            onRhymeOpen={(lineId) => handleRhymeOpen(sec.id, lineId)}
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


      {canShowCoachMark && lyricsStep === 1 && dismissedKey !== "lyrics-1" && (
        <AnchoredCoachMark
          anchorRef={firstLyricRowRef}
          anchorEdge="bottom"
          gap={12}
          step="3/7"
          message="Write your lyrics here! Press enter to create a new line."
          arrowSide="top"
          onDismiss={() => dismissCoachMark("lyrics-1")}
        />
      )}
      {canShowCoachMark && lyricsStep === 2 && dismissedKey !== "lyrics-2" && (
        picker ? (
          <AnchoredCoachMark
            anchorRef={isMobile ? focusedEditorHeaderRef : chordPickerHeaderRef}
            anchorEdge="top"
            gap={8}
            step="4/7"
            message="Add your chords here. Try adding the Royal Road progression!"
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("lyrics-2")}
          />
        ) : (
          <AnchoredCoachMark
            anchorRef={firstChordRowRef}
            anchorEdge="top"
            gap={12}
            step="4/7"
            message="Add your chords here. Try adding the Royal Road progression!"
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("lyrics-2")}
          />
        )
      )}
      {canShowCoachMark && lyricsStep === 3 && dismissedKey !== "lyrics-3" && (
        picker ? (
          <AnchoredCoachMark
            anchorRef={isMobile ? focusedEditorHeaderRef : chordPickerHeaderRef}
            anchorEdge="top"
            gap={8}
            step="5/7"
            message="Right click or tap & hold a chord chip to edit it."
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("lyrics-3")}
          />
        ) : (
          <AnchoredCoachMark
            anchorRef={firstChordRowRef}
            anchorEdge="top"
            gap={12}
            step="5/7"
            message="Right click or tap & hold a chord chip to edit it."
            arrowSide="bottom"
            onDismiss={() => dismissCoachMark("lyrics-3")}
          />
        )
      )}
      {canShowCoachMark && lyricsStep === 4 && dismissedKey !== "lyrics-4" && (
        <AnchoredCoachMark
          anchorRef={isMobile ? focusedEditorHeaderRef : chordPickerHeaderRef}
          anchorEdge="top"
          gap={8}
          step="6/7"
          message="Pick a chord from the list to replace it."
          arrowSide="bottom"
          onDismiss={() => dismissCoachMark("lyrics-4")}
        />
      )}
      {canShowCoachMark && lyricsStep === 5 && dismissedKey !== "lyrics-5" && createPortal(
        <div
          className="pointer-events-auto"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 9999,
          }}
        >
          <OnboardingCoachMark
            step="7/7"
            message="This is the end of the tutorial! You can press the Chord Progressions here to learn the other side of this app."
            actionLabel="Finish"
            onAction={() => {
              setLyricsStep(6);
              if (progressionsStep === 0 || progressionsStep >= 6) setProgressionsStep(1);
              dismissNewSongPrompt();
            }}
            onDismiss={() => dismissCoachMark("lyrics-5")}
          />
        </div>,
        document.body,
      )}

      {onboardingEnabled && showNewSongPrompt && (
        <div className="fixed bottom-16 left-0 right-0 z-50">
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


      {/* On mobile, the inline bottom-sheet picker fights the on-screen
          keyboard and sticky headers — render a full-screen overlay instead.
          Desktop continues to use the bottom sheet for fast inline editing. */}
      {isMobile && picker && !picker.prog ? (
        <FocusedChordEditor
          sectionId={picker.sectionId}
          lineId={picker.lineId}
          initialSlot={picker.slotIndex}
          initialAnchorId={picker.anchorId}
          onClose={() => setPicker(null)}
          headerRef={focusedEditorHeaderRef}
        />
      ) : (
        <ChordPickerSheet
          open={!!picker}
          onOpenChange={(o) => {
            if (!o) setPicker(null);
          }}
          headerRef={chordPickerHeaderRef}
          initialChord={initialChord}
          onPick={handlePick}
          onPickBatch={handlePickBatch}
          sectionId={picker?.sectionId}
          activeLineId={picker?.lineId}
          activeSlotIndex={picker?.slotIndex}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
          onOctaveChange={(oct) => {
            if (!picker?.anchorId) return;
            if (picker.prog) {
              const sec = sections.find((s) => s.id === picker.sectionId);
              const cur = sec?.chords.find((c) => c.id === picker.prog!.chordId)?.chord;
              if (!cur) return;
              updatePatternChord(picker.prog.patternId, picker.prog.chordId, { chord: { ...cur, octave: oct } });
              return;
            }
            const sec = sections.find((s) => s.id === picker.sectionId);
            const line = sec?.lines.find((l) => l.id === picker.lineId);
            const cur = line?.chords.find((c) => c.id === picker.anchorId)?.chord;
            if (!cur) return;
            upsertChordAt(picker.sectionId, picker.lineId, picker.slotIndex, { ...cur, octave: oct }, picker.anchorId);
          }}
        />
      )}

      <FocusedRhymeEditor
        isOpen={rhymeOpen}
        onClose={handleRhymeClose}
        activeLineIndex={rhymeTarget?.activeIdx ?? 0}
        lines={rhymeTarget?.lines ?? []}
        onReplaceLine={(idx, newText) => {
          const targetId = rhymeTarget?.lineIds[idx];
          if (targetId && rhymeTarget) setLineText(rhymeTarget.sectionId, targetId, newText);
        }}
      />

      {(() => {
        const activeCtx = (() => {
          if (!activeChordId) return null;
          for (const sec of sections) {
            for (const line of sec.lines) {
              const anchor = line.chords.find((c) => c.id === activeChordId);
              if (anchor) return { sectionId: sec.id, lineId: line.id, anchor };
            }
          }
          return null;
        })();
        const lookupAnchor = (id: string) => {
          for (const sec of sections) {
            for (const line of sec.lines) {
              const anchor = line.chords.find((c) => c.id === id);
              if (anchor) return { sectionId: sec.id, lineId: line.id, anchor };
            }
          }
          return null;
        };

        const useMulti = lyricMultiSelected.size > 0;
        const targets = useMulti
          ? Array.from(lyricMultiSelected.entries()).map(([id, ctx]) => ({ id, ...ctx }))
          : activeCtx
            ? [{ id: activeCtx.anchor.id, sectionId: activeCtx.sectionId, lineId: activeCtx.lineId }]
            : [];
        const slotsOf = targets.map((t) => lookupAnchor(t.id)?.anchor.slotIndex ?? 0);

        // A single chord at the row edge wraps onto the adjacent line (crossing
        // sections when needed): left from slot 0 lands at the end of the line
        // above, right from the last slot lands at the start of the line below.
        const adjacentLine = (sectionId: string, lineId: string, dir: -1 | 1) => {
          const si = sections.findIndex((sec) => sec.id === sectionId);
          if (si < 0) return null;
          const li = sections[si].lines.findIndex((l) => l.id === lineId);
          if (li < 0) return null;
          const sameSection = sections[si].lines[li + dir];
          if (sameSection) return { sectionId, lineId: sameSection.id };
          const adjSec = sections[si + dir];
          if (!adjSec || adjSec.lines.length === 0) return null;
          const line = dir === -1 ? adjSec.lines[adjSec.lines.length - 1] : adjSec.lines[0];
          return { sectionId: adjSec.id, lineId: line.id };
        };
        const singleTarget = !useMulti && targets.length === 1 ? targets[0] : null;
        const canWrap = (dir: -1 | 1) =>
          !!singleTarget && !!adjacentLine(singleTarget.sectionId, singleTarget.lineId, dir);
        const canShiftLeft =
          targets.length > 0 && (slotsOf.every((s) => s > 0) || (slotsOf[0] === 0 && canWrap(-1)));
        const canShiftRight =
          targets.length > 0 &&
          (slotsOf.every((s) => s < CHORD_ROW_SLOTS - 1) ||
            (slotsOf[0] === CHORD_ROW_SLOTS - 1 && canWrap(1)));

        // Vertical move is row-scoped: enabled only when the whole selection
        // sits on one line of one section.
        const sourceRows = new Set(targets.map((t) => `${t.sectionId}:${t.lineId}`));
        const sourceRow = sourceRows.size === 1 && targets[0]
          ? { sectionId: targets[0].sectionId, lineId: targets[0].lineId }
          : null;
        const canMoveVertical = (dir: -1 | 1): boolean => {
          if (!sourceRow) return false;
          const si = sections.findIndex((sec) => sec.id === sourceRow.sectionId);
          if (si < 0) return false;
          const li = sections[si].lines.findIndex((l) => l.id === sourceRow.lineId);
          if (li < 0) return false;
          return !!sections[si].lines[li + dir] || !!sections[si + dir];
        };

        const selectedOctaves: number[] = [];
        lyricMultiSelected.forEach((_ctx, anchorId) => {
          const found = lookupAnchor(anchorId);
          if (found?.anchor.chord.octave !== undefined) {
            selectedOctaves.push(found.anchor.chord.octave);
          }
        });

        return (
          <FloatingChordToolbar
            mode="lyrics"
            hideTrigger
            autoExpandOnContext={false}
            activeChord={
              activeCtx
                ? {
                    id: activeCtx.anchor.id,
                    display: activeCtx.anchor.chord.display,
                    octave: activeCtx.anchor.chord.octave,
                  }
                : null
            }
            selectedCount={lyricMultiSelected.size}
            selectedOctaves={selectedOctaves}
            canShiftLeft={canShiftLeft}
            canShiftRight={canShiftRight}
            canMoveUp={canMoveVertical(-1)}
            canMoveDown={canMoveVertical(1)}
            onMoveVertical={(dir) => {
              if (!sourceRow) return;
              const res = useSongStore
                .getState()
                .moveChordsToAdjacentRow(
                  sourceRow.sectionId,
                  sourceRow.lineId,
                  targets.map((t) => t.id),
                  dir,
                );
              if (!res.moved) return;
              if (res.createdBlock) {
                toast.info("New pattern block created to fit the moved chords");
              }
              if (res.targetSectionId && res.targetLineId) {
                if (useMulti) {
                  const next = new Map<string, { sectionId: string; lineId: string }>();
                  res.movedIds.forEach((id) =>
                    next.set(id, { sectionId: res.targetSectionId!, lineId: res.targetLineId! }),
                  );
                  setLyricMultiSelected(next);
                } else {
                  setActiveChordId(res.movedIds[0] ?? null);
                }
              }
            }}
            onShift={(dir) => {
              if (singleTarget) {
                const found = lookupAnchor(singleTarget.id);
                if (!found) return;
                const slot = found.anchor.slotIndex ?? 0;
                const atEdge = dir === -1 ? slot === 0 : slot === CHORD_ROW_SLOTS - 1;
                if (atEdge) {
                  const adj = adjacentLine(singleTarget.sectionId, singleTarget.lineId, dir);
                  if (!adj) return;
                  // Hop to the adjacent row via the SSOT move (conserves the
                  // chord + stays collision-free; moveChordAnchor split it into
                  // a lyric-only + leftover progression-only chord).
                  const res = useSongStore.getState().moveChordsToAdjacentRow(
                    singleTarget.sectionId,
                    singleTarget.lineId,
                    [singleTarget.id],
                    dir,
                  );
                  if (res.moved) setActiveChordId(res.movedIds[0] ?? null);
                  return;
                }
                moveChordToSlot(singleTarget.sectionId, singleTarget.lineId, singleTarget.id, slot + dir);
                return;
              }
              for (const t of targets) {
                const found = lookupAnchor(t.id);
                if (!found) continue;
                const slot = found.anchor.slotIndex ?? 0;
                const next = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, slot + dir));
                if (next !== slot) moveChordToSlot(t.sectionId, t.lineId, t.id, next);
              }
            }}
            onOctaveChange={(oct) => {
              for (const t of targets) {
                const found = lookupAnchor(t.id);
                if (!found) continue;
                const slot = found.anchor.slotIndex ?? 0;
                upsertChordAt(t.sectionId, t.lineId, slot, { ...found.anchor.chord, octave: oct }, t.id);
              }
              const auditionTarget = activeCtx ?? (targets[0] ? lookupAnchor(targets[0].id) : null);
              if (auditionTarget) {
                void playChord(auditionTarget.anchor.chord, undefined, oct);
              }
            }}
            onSelectAll={() => {
              if (!activeCtx) return;
              const sec = sections.find((s) => s.id === activeCtx.sectionId);
              const line = sec?.lines.find((l) => l.id === activeCtx.lineId);
              if (!line) return;
              line.chords.forEach((c) => {
                if (!lyricMultiSelected.has(c.id)) {
                  toggleLyricMultiSelected(c.id, { sectionId: activeCtx.sectionId, lineId: activeCtx.lineId });
                }
              });
            }}
            onClearAll={() => {
              setActiveChordId(null);
              setLyricMultiSelected(new Map());
            }}
            onEnterMultiSelect={() => {
              if (activeCtx && !lyricMultiSelected.has(activeCtx.anchor.id)) {
                toggleLyricMultiSelected(activeCtx.anchor.id, {
                  sectionId: activeCtx.sectionId,
                  lineId: activeCtx.lineId,
                });
              }
            }}
            onDuplicate={() => {
              if (targets.length === 0) return;
              for (const t of targets) {
                const found = lookupAnchor(t.id);
                if (!found) continue;
                const store = useSongStore.getState();
                const sec = store.sections.find((x) => x.id === t.sectionId);
                const line = sec?.lines.find((l) => l.id === t.lineId);
                if (!line) continue;
                const srcLen = sec?.chords.find((sc) => sc.id === t.id)?.progressionPlacement?.lengthBeats;
                const occupied = new Set(line.chords.map((c) => c.slotIndex ?? 0));
                const start = (found.anchor.slotIndex ?? 0) + 1;
                let slot = -1;
                for (let cand = start; cand < CHORD_ROW_SLOTS; cand++) {
                  if (!occupied.has(cand)) { slot = cand; break; }
                }
                if (slot < 0) {
                  for (let cand = CHORD_ROW_SLOTS - 1; cand >= 0; cand--) {
                    if (!occupied.has(cand)) { slot = cand; break; }
                  }
                }
                if (slot < 0) continue;
                const result = store.placeChordInSlot(t.sectionId, t.lineId, slot, found.anchor.chord);
                if (result && srcLen !== undefined) {
                  const fresh = useSongStore.getState();
                  const newSC = fresh.sections.find((x) => x.id === t.sectionId)?.chords.find((sc) => sc.id === result.id);
                  if (newSC?.progressionPlacement) {
                    fresh.setPatternChordLength(newSC.progressionPlacement.patternId, result.id, srcLen);
                  }
                }
              }
            }}
            onDelete={() => {
              if (targets.length === 0) return;
              const byLine = new Map<string, { sectionId: string; lineId: string; ids: string[] }>();
              for (const t of targets) {
                const key = `${t.sectionId}:${t.lineId}`;
                const entry = byLine.get(key) ?? { sectionId: t.sectionId, lineId: t.lineId, ids: [] };
                entry.ids.push(t.id);
                byLine.set(key, entry);
              }
              const removeBatch = useSongStore.getState().removeChordAnchorsBatch;
              for (const { sectionId, lineId, ids } of byLine.values()) {
                removeBatch(sectionId, lineId, ids);
              }
              setActiveChordId(null);
              setLyricMultiSelected(new Map());
            }}
            onCopy={handleCopyChords}
            canPaste={chordClipboard.length > 0}
            onPaste={handlePasteRequest}
            onExitEdit={() => {
              setActiveChordId(null);
              setLyricMultiSelected(new Map());
            }}
          />
        );
      })()}

    </div>

    {/* ── Block overflow resolver ───────────────────────────────────────── */}
    {overflowPending && (() => {
      const { totalCap, totalUsed, existingPlacedCount, lastBlock, chords } = overflowPending;
      const incoming = chords.length * defaultChordLen;
      const newCount = existingPlacedCount + chords.length;
      const compressedLen = Math.max(0.5, Math.floor((totalCap / newCount) * 2) / 2);
      const extraBars = Math.ceil(Math.max(0, totalUsed + incoming - totalCap) / lastBlock.beatsPerBar);
      const newBars = lastBlock.bars + extraBars;
      const chordLabel = chords.length === 1
        ? chords[0].display
        : chords.map((c) => c.display).join(", ");
      return (
        <Sheet open onOpenChange={(o) => { if (!o) setOverflowPending(null); }}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl flex flex-col p-0 [&>button[type=button]]:hidden"
            style={{ background: "var(--paper)", maxHeight: "80vh" }}
          >
            <SheetHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <SheetTitle className="font-display text-lg" style={{ color: "var(--ink)" }}>
                Block is full
              </SheetTitle>
              <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                Adding{" "}
                <span className="font-mono-chord font-semibold" style={{ color: "var(--ink)" }}>
                  {chordLabel}
                </span>{" "}
                would overflow the current block ({Math.round(totalUsed)}/{totalCap} beats used).
                How would you like to handle it?
              </p>
            </SheetHeader>

            <div className="flex flex-col gap-3 px-4 py-4">
              <button
                type="button"
                className="btn-sculpt-amber flex flex-col items-start rounded-xl px-4 py-3 text-left"
                onClick={resolveOverflowExpand}
              >
                <span className="text-sm font-semibold">Expand block</span>
                <span className="text-xs mt-0.5 opacity-80">
                  Grow the last block from {lastBlock.bars} → {newBars} bars to fit all chords
                </span>
              </button>

              <button
                type="button"
                className="btn-sculpt-cream flex flex-col items-start rounded-xl px-4 py-3 text-left"
                onClick={resolveOverflowContinue}
              >
                <span className="text-sm font-semibold">Add a continuation block</span>
                <span className="text-xs mt-0.5 opacity-80">
                  Overflow the extra chord{chords.length > 1 ? "s" : ""} into a new block after this one
                </span>
              </button>

              <button
                type="button"
                className="btn-sculpt-cocoa flex flex-col items-start rounded-xl px-4 py-3 text-left"
                onClick={() => resolveOverflowCompress(compressedLen)}
              >
                <span className="text-sm font-semibold">Shorten chord beats</span>
                <span className="text-xs mt-0.5 opacity-80">
                  Compress all {newCount} chords to {compressedLen}b each so they fit in the existing block
                </span>
              </button>

              <button
                type="button"
                className="text-xs py-2"
                style={{ color: "var(--ink-soft)" }}
                onClick={() => setOverflowPending(null)}
              >
                Cancel
              </button>
            </div>
          </SheetContent>
        </Sheet>
      );
    })()}
    {/* ── Paste confirmation ──────────────────────────────────────────────── */}
    {pastePending && (
      <Sheet open onOpenChange={(o) => { if (!o) setPastePending(null); }}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl flex flex-col p-0 [&>button[type=button]]:hidden"
          style={{ background: "var(--paper)", maxHeight: "80vh" }}
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <SheetTitle className="font-display text-lg" style={{ color: "var(--ink)" }}>
              Paste {pastePending.chords.length} chord{pastePending.chords.length !== 1 ? "s" : ""}
            </SheetTitle>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {pastePending.chords.map((c, i) => (
                <ChordChip key={i} chord={c.chord} size="sm" variant="ink" audition={false} />
              ))}
            </div>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 py-4 overflow-y-auto">
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Choose where to paste:</p>
            {sections.flatMap((sec) =>
              sec.lines.filter((l) => !l._isChordOverflow).map((line, li) => {
                const isActive = pastePending.target?.sectionId === sec.id && pastePending.target?.lineId === line.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm transition-colors",
                      isActive ? "btn-sculpt-amber" : "btn-sculpt-cream",
                    )}
                    onClick={() => setPastePending((p) => p ? { ...p, target: { sectionId: sec.id, lineId: line.id, atCol: 0 } } : p)}
                  >
                    <span className="font-semibold truncate">{getSectionDisplayName(sections, sec.id)}</span>
                    {sec.lines.filter((l) => !l._isChordOverflow).length > 1 && (
                      <span className="text-xs opacity-70">line {li + 1}</span>
                    )}
                    <span className="ml-auto text-xs opacity-60 font-mono-chord">{line.text.slice(0, 20) || "(empty)"}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex gap-2 px-4 pb-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <Button
              className="flex-1 btn-sculpt-amber"
              disabled={!pastePending.target}
              onClick={() => {
                if (!pastePending.target) return;
                const { sectionId, lineId, atCol } = pastePending.target;
                const beforeIds = new Set(
                  useSongStore.getState().sections.find((s) => s.id === sectionId)?.chords.map((c) => c.id) ?? [],
                );
                pasteChordsAt(
                  sectionId, lineId, atCol,
                  pastePending.chords.map((c, i) => ({ chord: c.chord, relCol: i * 2, widthCh: 1 })),
                );
                // pasteChordsAt places chords at the default length; restore the
                // copied beat lengths. New chords land on this line with
                // increasing slotIndex, matching the clipboard order.
                const store = useSongStore.getState();
                const after = store.sections.find((s) => s.id === sectionId);
                const newChords = (after?.chords ?? [])
                  .filter((c) => !beforeIds.has(c.id) && c.lyricsPlacement?.lineId === lineId && c.progressionPlacement)
                  .sort((a, b) => a.lyricsPlacement!.slotIndex - b.lyricsPlacement!.slotIndex);
                newChords.forEach((nc, i) => {
                  const want = pastePending.chords[i]?.lengthBeats;
                  if (want != null && nc.progressionPlacement) {
                    store.setPatternChordLength(nc.progressionPlacement.patternId, nc.id, want);
                  }
                });
                setPastePending(null);
              }}
            >
              Paste here
            </Button>
            <Button variant="ghost" onClick={() => setPastePending(null)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    )}
    </>
  );
}
