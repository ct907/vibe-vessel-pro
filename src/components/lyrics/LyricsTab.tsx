import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useDndStore } from "@/store/dnd";
import {
  useSongStore,
  getSectionDisplayName,
  getLineChordsViaSSOT,
  withHistoryGroup,
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
import { Switch } from "@/components/ui/switch";
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
  WholeWord,
  Music2,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { sectionTintStyle, SectionColorPicker, SECTION_COLOR_KEYS } from "@/components/section/SectionColorPicker";
import { KeyChangeSticker } from "@/components/section/KeyChangeSticker";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { useBasketSelectionStore } from "@/store/basket-selection";
import { FocusedChordEditor } from "@/components/lyrics/FocusedChordEditor";
import { FocusedRhymeEditor } from "@/components/lyrics/FocusedRhymeEditor";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUIStore } from "@/store/ui";
import { useTheme } from "@/hooks/use-theme";


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
  isFocused?: boolean;
  onTextFocus: () => void;
  onTextBlur: () => void;
  onRhymeOpen: () => void;
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
  isFocused,
  onTextFocus,
  onTextBlur,
  onRhymeOpen,
}: LineRowProps) {
  const {
    setLineText,
    removeChordAnchorsBatch,
    moveChordToSlot,
    addSection,
    undo,
    redo,
  } = useSongStore();
  const [slashDialog, setSlashDialog] = useState(false);
  const [slashType, setSlashType] = useState<SectionType>("verse");
  const [slashCustomLabel, setSlashCustomLabel] = useState("");
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

  // Stable refs so the keydown handler always reads the freshest values.
  const lineChordsRef = useRef(lineChords);
  lineChordsRef.current = lineChords;
  const moveChordToSlotRef = useRef(moveChordToSlot);
  moveChordToSlotRef.current = moveChordToSlot;

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

  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          style={{ minHeight: 22, paddingTop: 2, paddingBottom: 2, overflowX: "clip", paddingLeft: 8 }}
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
                      hasActiveChordInLine
                        ? "border-muted-foreground/20"
                        : "border-transparent group-hover:border-muted-foreground/40",
                      occupied ? "w-10" : "w-7",
                      slotIdx > 0 && (hasActiveChordInLine
                        ? "border-l-muted-foreground/35"
                        : "border-l-muted-foreground/12 group-hover:border-l-muted-foreground/35"),
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
                          if (singleClickTimerRef.current) {
                            clearTimeout(singleClickTimerRef.current);
                            singleClickTimerRef.current = null;
                          }
                          onSetActiveChordId(null);
                          onPickerOpen(line.id, slotIdx, anchor!.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChordChip
                          chord={anchor!.chord}
                          variant="ink"
                          size="sm"
                          audition={true}
                          octave={anchor!.chord.octave ?? 4}
                          selected={activeChordId === anchor!.id}
                          onClick={() => {
                            if (singleClickTimerRef.current) {
                              clearTimeout(singleClickTimerRef.current);
                              singleClickTimerRef.current = null;
                            }
                            singleClickTimerRef.current = setTimeout(() => {
                              singleClickTimerRef.current = null;
                              onSetActiveChordId(activeChordId === anchor!.id ? null : anchor!.id);
                            }, 250);
                          }}
                          onLongPress={() => {
                            if (singleClickTimerRef.current) {
                              clearTimeout(singleClickTimerRef.current);
                              singleClickTimerRef.current = null;
                            }
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
                            className="absolute -top-1.5 -right-1.5 z-20 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                            aria-label="Delete chord"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeChordAnchorsBatch(sectionId, line.id, [anchor!.id]);
                              onSetActiveChordId(null);
                            }}
                          >
                            <X className="h-2.5 w-2.5" />
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

      {/* Floating chord movement menu — appears below chord row when a chord is active */}
      {(() => {
        if (!activeChordId) return null;
        const activeAnchor = lineChords.find((c) => c.id === activeChordId);
        if (!activeAnchor) return null;
        const currentSlot = activeAnchor.slotIndex ?? 0;
        return (
          <div
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
          onFocus={onTextFocus}
          onBlur={onTextBlur}
          onChange={(e) => setLineText(sectionId, line.id, e.target.value)}
          onBeforeInput={(e: React.FormEvent<HTMLTextAreaElement> & { data?: string }) => {
            // Mobile soft keyboards often fire keydown with key="" / "Unidentified".
            // beforeinput reliably reports the inserted character.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = (e as any).data;
            if (data === "/") {
              e.preventDefault();
              setSlashType("verse");
              setSlashCustomLabel("");
              setSlashDialog(true);
            }
          }}
          onKeyDown={(e) => {
            // Item 5 — "/" intercepts to open New Section dialog. Skip during IME.
            if (e.key === "/" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              setSlashType("verse");
              setSlashCustomLabel("");
              setSlashDialog(true);
              return;
            }
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
          className={cn(
            "w-full min-h-[1.875rem] bg-transparent border-0 outline-none resize-none overflow-hidden font-display text-base leading-[1.875rem] text-foreground placeholder:italic placeholder:text-muted-foreground/60 dark:placeholder:opacity-40 px-1 ml-1 break-words",
            isFocused && "pr-8",
          )}
        />
      </div>
      <div aria-hidden="true" style={{ height: 1, background: "var(--cocoa)" }} />

      {/* Item 5 — "/" → new section dialog */}
      <Dialog open={slashDialog} onOpenChange={setSlashDialog}>
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
            <Button variant="ghost" onClick={() => setSlashDialog(false)}>Cancel</Button>
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
  sortMode?: boolean;
  onMoveSection?: (id: string, direction: -1 | 1) => void;
  /** Tab-level active chord for X chip (one across all sections). */
  activeChordId: string | null;
  onSetActiveChordId: (id: string | null) => void;
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
  sortMode,
  onMoveSection,
  activeChordId,
  onSetActiveChordId,
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
    basket,
    setSectionComment,
    setSectionColor,
    setSectionArpArmed,
    suppressCrossTabDeleteWarning,
    setSuppressCrossTabDeleteWarning,
  } = useSongStore();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(section.label);
  const prevTypeRef = useRef<SectionType | null>(null);
  const prevLabelRef = useRef<string>(section.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [pendingKeyChange, setPendingKeyChange] = useState(false);
  const [confirm, setConfirm] = useState<null | { lineId: string; kind: "lyric" | "chord" }>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false);
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const allSections = useSongStore((s) => s.sections);
  const effectiveOffsets = useMemo(() => computeEffectiveOffsets(allSections), [allSections]);
  const effectiveOffset = effectiveOffsets[index] ?? 0;
  const isFirstSection = index === 0;

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
      style={{ ...sectionTintStyle(section.color, 0.35), backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      className={cn("noise-texture-surface rounded-xl px-2 py-2 shadow-none border-0")}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 -ml-4 select-none [-webkit-touch-callout:none] [-webkit-user-select:none]" style={{ paddingLeft: 8 }}>
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
          disabled={sortMode || total === 1}
        >
          <SelectTrigger
            className="h-auto w-auto min-w-[120px] ml-2 border-0 shadow-none outline-none ring-0 focus:ring-0 gap-2"
            style={{
              padding: "7px 16px",
              borderRadius: "var(--pill-radius, 8px)",
              background: "var(--pill-rest-bg)",
              color: "var(--pill-rest-fg)",
              fontFamily: "'Nunito', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <Music2 className="h-3.5 w-3.5 shrink-0" />
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
          <div className="ml-auto flex items-center gap-1">
            <SectionColorPicker
              value={section.color}
              onChange={(c) => setSectionColor(section.id, c)}
              className={isMobile ? "hidden" : undefined}
            />
            <button
              onClick={() => setCommentOpen((o) => !o)}
              className="relative h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={hasComment ? "View comment" : "Add comment"}
            >
              <Plus className="h-3 w-3 absolute top-1.5 left-1.5" />
              <MessageSquare className="h-3.5 w-3.5" />
              {hasComment && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
                />
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Section</DropdownMenuLabel>
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
                <DropdownMenuItem onClick={() => duplicateSection(section.id)}>
                  <Copy className="h-4 w-4" /> Duplicate
                </DropdownMenuItem>
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
                onChordFocus={() => {}}
                activeChordId={activeChordId}
                onSetActiveChordId={onSetActiveChordId}
                isFocused={focusedLineId === line.id}
                onTextFocus={() => onLineTextFocus(line.id)}
                onTextBlur={onLineTextBlur}
                onRhymeOpen={() => onRhymeOpen(line.id)}
              />
            ))}
          </div>

          {/* Basket chords are now drag-and-dropped directly into chord-row slots. */}

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
    setLineText,
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

  const isMobile = useIsMobile();
  const [activeChordId, setActiveChordId] = useState<string | null>(null);
  const [focusedLineInfo, setFocusedLineInfo] = useState<{ sectionId: string; lineId: string } | null>(null);
  const [rhymeOpen, setRhymeOpen] = useState(false);
  const [rhymeTarget, setRhymeTarget] = useState<{
    sectionId: string;
    lineId: string;
    lines: string[];
    lineIds: string[];
    activeIdx: number;
  } | null>(null);

  const handleLineTextFocus = (sectionId: string, lineId: string) =>
    setFocusedLineInfo({ sectionId, lineId });
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

  // ---- Drag handlers (basket → slot only; chord chips are no longer draggable) ----
  const onDragEnd = (result: DropResult) => {
    justDraggedAtRef.current = Date.now();
    if (!result.destination) return;
    const { destination, draggableId } = result;
    const dstParts = destination.droppableId.split(":");
    if (dstParts[0] !== "slot") return;
    const toSectionId = dstParts[1];
    const toLineId = dstParts[2];
    const toSlot = Number(dstParts[3]);
    if (Number.isNaN(toSlot)) return;

    if (!draggableId.startsWith("basket:")) return;
    const basketItemId = draggableId.slice("basket:".length);
    const basketState = useSongStore.getState().basket;
    const { resolveDragIds, clear: clearBasketSelection } =
      useBasketSelectionStore.getState();
    const ids = resolveDragIds(basketItemId);
    const ordered = basketState.filter((b) => ids.includes(b.id));
    ordered.forEach((b, i) =>
      placeChordInSlot(toSectionId, toLineId, toSlot + i, b.chord),
    );
    clearBasketSelection();
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

  useEffect(() => {
    if (!activeChordId || isMobile) return;

    const activeRow = document
      .querySelector(`[data-chip-anchor="${activeChordId}"]`)
      ?.closest("[data-chord-row]");

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveChordId(null);
    };
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (activeRow && activeRow.contains(target)) return;
      setActiveChordId(null);
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointer);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointer);
    };
  }, [activeChordId, isMobile]);

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
            activeChordId={activeChordId}
            onSetActiveChordId={setActiveChordId}
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


      <div
        className="flex flex-col gap-3 px-4 pt-4 mt-2 rounded-t-xl pb-[60rem]"
        style={{ borderTop: "1px solid color-mix(in oklch, var(--border) 60%, transparent)", background: "color-mix(in oklch, var(--ink-soft) 40%, transparent)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
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
          {(["verse", "chorus", "bridge", "intro"] as SectionType[]).map((t) => (
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
          sectionId={picker?.sectionId}
          activeLineId={picker?.lineId}
          activeSlotIndex={picker?.slotIndex}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
          onOctaveChange={(oct) => {
            if (!picker?.anchorId) return;
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
