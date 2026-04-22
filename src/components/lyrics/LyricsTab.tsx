import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSongStore, getSectionDisplayName, type LyricLine, type Section, type SectionType } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { parseChord, ChordSymbol } from "@/lib/music/chords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronRight, MoreVertical, Copy, ArrowUp, ArrowDown, Pencil, MessageSquare, Scissors, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";

// Module-scoped chord clipboard (cut/copy/paste across rows).
type ChordClip = { chord: ChordSymbol; relCol: number; widthCh: number };
let chordClipboard: ChordClip[] = [];

const SECTION_TYPES: SectionType[] = ["verse", "chorus", "bridge", "intro", "outro", "pre-chorus", "custom"];

const colOf = (a: { chordCol?: number; offset?: number }) => a.chordCol ?? a.offset ?? 0;

interface LineRowProps {
  sectionId: string;
  line: LyricLine;
  active?: boolean;
  isFirst: boolean;
  onAddLineAfter: () => string | void;
  onMergeUp: (kind: "lyric" | "chord", currentRowText: string, currentRowChordsCount: number, currentRowLen: number) => boolean;
  onPickerOpen: (lineId: string, col: number, anchorId?: string) => void;
  /** col-cell width in px, computed from a hidden measurer */
  cellPx: number;
  /** Tell parent which row is focused on chord side, for picker context */
  onChordFocus: (lineId: string) => void;
  /** Drag a chord chip from this row onto another row */
  onChordDragStart: (anchorId: string) => void;
  onChordDrop: (toLineId: string, toCol: number) => void;
  /** Live query from the chord picker (only meaningful when active). */
  chordRowQuery?: string;
  onChordRowQueryChange?: (q: string) => void;
}

function LineRow({
  sectionId, line, active, isFirst, onAddLineAfter, onMergeUp, onPickerOpen, cellPx, onChordFocus,
  onChordDragStart, onChordDrop, chordRowQuery, onChordRowQueryChange,
}: LineRowProps) {
  const {
    setLineText, upsertChordAt,
    removeChordAnchor, removeChordAnchorsBatch, shiftChordAnchors, moveSelectedChordsByOrder,
    setChordRowLen, insertChordSpaceAt, removeChordCellAt, pasteChordsAt,
  } = useSongStore();
  const lyricInputRef = useRef<HTMLInputElement>(null);
  const chordRowRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [chordCaret, setChordCaret] = useState(0); // column index in chord row
  const [chordFocused, setChordFocused] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Scroll the active row to ~80px below the top of the visual viewport
  // whenever it becomes the active (picker-open) row.
  useEffect(() => {
    if (!active || !rowRef.current) return;
    const el = rowRef.current;
    const rect = el.getBoundingClientRect();
    const targetTop = 80;
    const delta = rect.top - targetTop;
    // Use the visualViewport offset if present so mobile keyboards behave.
    window.scrollBy({ top: delta, behavior: "smooth" });
  }, [active]);

  // Build a clipboard payload from the current selection.
  const collectClip = (ids: string[]): ChordClip[] => {
    const sel = line.chords.filter((c) => ids.includes(c.id));
    if (!sel.length) return [];
    const minCol = Math.min(...sel.map((c) => colOf(c)));
    return sel.map((c) => ({
      chord: c.chord,
      relCol: colOf(c) - minCol,
      widthCh: Math.max(1, c.chord.display.length),
    }));
  };

  const doCopy = () => {
    chordClipboard = collectClip(Array.from(selected));
  };
  const doCut = () => {
    chordClipboard = collectClip(Array.from(selected));
    removeChordAnchorsBatch(sectionId, line.id, Array.from(selected));
    exitSelect();
  };
  const doPaste = () => {
    if (!chordClipboard.length) return;
    pasteChordsAt(sectionId, line.id, chordCaret, chordClipboard);
  };

  // Effective row length must account for the visual width of each chord chip
  // (e.g. "Fmaj7" occupies 5 ch-cells), so the caret can land to the right of
  // any chord, not just one cell after its starting column.
  const chordEndCol = (a: { chordCol?: number; offset?: number; chord: { display: string } }) =>
    colOf(a) + Math.max(1, a.chord.display.length);
  const len = Math.max(
    line.chordRowLen ?? 0,
    ...line.chords.map(chordEndCol),
    1,
  );

  useEffect(() => {
    if (selectMode && line.chords.length === 0) { setSelectMode(false); setSelected(new Set()); }
  }, [line.chords.length, selectMode]);

  // Auto-exit select mode when the user has deselected the last chord.
  useEffect(() => {
    if (selectMode && selected.size === 0) setSelectMode(false);
  }, [selected, selectMode]);

  // Outside-tap closes the chord-row context menu (select mode).
  useEffect(() => {
    if (!selectMode) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (rowRef.current && rowRef.current.contains(t)) return;
      // Allow interactions with the picker sheet too (so users can switch).
      if (t.closest("[data-radix-dialog-content]")) return;
      setSelectMode(false);
      setSelected(new Set());
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [selectMode]);

  // ---------- Chord row interactions ----------
  const focusChord = () => {
    chordRowRef.current?.focus();
    setChordFocused(true);
    onChordFocus(line.id);
  };

  const handleChordRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectMode) return;
    const rect = chordRowRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const col = Math.max(0, Math.min(len, Math.round(px / Math.max(cellPx, 1))));
    setChordCaret(col);
    focusChord();
    // Always open the picker on tap so the keyboard surfaces on mobile and the
    // user can extend the chord row with another chord next to existing ones.
    // (Tapping directly on a chord chip is handled by the chip's own onClick.)
    onPickerOpen(line.id, col);
  };

  const handleChordKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (selectMode) return;
    const k = e.key;
    // Picker is "live" when this row is active and the parent passed query handlers.
    const pickerLive = !!(active && onChordRowQueryChange);
    const liveQuery = chordRowQuery ?? "";

    if (k === "ArrowUp" || k === "ArrowDown") {
      // Shortcut: if the picker sheet is open, toggle focus to its input.
      const pickerInput = document.querySelector<HTMLInputElement>("[data-chord-picker-input]");
      if (pickerInput) {
        e.preventDefault();
        pickerInput.focus();
        return;
      }
    }
    // While the picker is open, treat letter/digit/chord-symbol keys as edits
    // to the shared chord query (mirrored in the picker input).
    if (pickerLive && k.length === 1 && /[A-Za-z0-9#b/+°Δø]/.test(k)) {
      e.preventDefault();
      onChordRowQueryChange!(liveQuery + k);
      return;
    }
    if (pickerLive && k === "Backspace" && liveQuery.length > 0) {
      e.preventDefault();
      onChordRowQueryChange!(liveQuery.slice(0, -1));
      return;
    }
    if (pickerLive && k === "Enter" && liveQuery.trim()) {
      // Let the picker's own Enter handler commit; forward focus to it.
      const pickerInput = document.querySelector<HTMLInputElement>("[data-chord-picker-input]");
      if (pickerInput) {
        e.preventDefault();
        pickerInput.focus();
        // Synthesize an Enter on the picker input.
        pickerInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        return;
      }
    }

    if (k === " " || k === "Spacebar") {
      e.preventDefault();
      insertChordSpaceAt(sectionId, line.id, chordCaret);
      setChordCaret((c) => c + 1);
    } else if (k === "ArrowLeft") {
      e.preventDefault();
      setChordCaret((c) => Math.max(0, c - 1));
    } else if (k === "ArrowRight") {
      e.preventDefault();
      setChordCaret((c) => Math.min(len, c + 1));
    } else if (k === "Home") {
      e.preventDefault(); setChordCaret(0);
    } else if (k === "End") {
      e.preventDefault(); setChordCaret(len);
    } else if (k === "Backspace") {
      e.preventDefault();
      if (chordCaret === 0) {
        if (line.chords.length === 0 && (line.chordRowLen ?? 0) === 0) {
          onMergeUp("chord", line.text, 0, 0);
        } else {
          onMergeUp("chord", line.text, line.chords.length, line.chordRowLen ?? 0);
        }
        return;
      }
      const target = chordCaret - 1;
      const removed = removeChordCellAt(sectionId, line.id, target);
      if (removed) setChordCaret(target);
    } else if (k === "Delete") {
      e.preventDefault();
      if (chordCaret >= len) return;
      removeChordCellAt(sectionId, line.id, chordCaret);
    } else if (k === "Enter") {
      e.preventDefault();
      const newId = onAddLineAfter();
      if (typeof newId === "string") {
        setTimeout(() => {
          document.querySelector<HTMLDivElement>(`[data-chord-row="${newId}"]`)?.focus();
        }, 10);
      }
    } else if (k.length === 1 && /[A-Za-z]/.test(k)) {
      // Picker is not yet open — open it and seed the query with this letter.
      e.preventDefault();
      onChordRowQueryChange?.(k);
      onPickerOpen(line.id, chordCaret);
    }
  };

  // ---------- Lyric input interactions ----------
  const handleLyricChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLineText(sectionId, line.id, e.target.value);
  };

  const handleLyricKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newId = onAddLineAfter();
      if (typeof newId === "string") {
        setTimeout(() => {
          document.querySelector<HTMLInputElement>(`[data-lyric-input="${newId}"]`)?.focus();
        }, 10);
      }
    } else if (e.key === "Backspace" && lyricInputRef.current?.selectionStart === 0 && lyricInputRef.current.selectionEnd === 0) {
      if (line.text === "") {
        e.preventDefault();
        // If chord row has content, confirm; else merge silently
        const hasChordContent = line.chords.length > 0 || (line.chordRowLen ?? 0) > 0;
        onMergeUp("lyric", "", line.chords.length, line.chordRowLen ?? 0);
      }
    }
  };

  const enterSelect = (anchorId: string) => { setSelectMode(true); setSelected(new Set([anchorId])); };
  const toggleSelected = (anchorId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(anchorId)) next.delete(anchorId); else next.add(anchorId);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const selectedIds = Array.from(selected);

  return (
    <div
      ref={rowRef}
      className={cn(
        "group py-1 transition-colors",
        active
          ? "relative z-[60] rounded-md ring-2 ring-primary/70 bg-paper px-2 -mx-2 shadow-lg"
          : "relative",
      )}
      data-line-id={line.id}
    >
      {/* CHORD ROW (focusable, like a text cursor) */}
      <div
        ref={chordRowRef}
        data-chord-row={line.id}
        tabIndex={0}
        onClick={handleChordRowClick}
        onKeyDown={handleChordKeyDown}
        onFocus={() => { setChordFocused(true); onChordFocus(line.id); }}
        onBlur={() => setChordFocused(false)}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => {
          e.preventDefault();
          const rect = chordRowRef.current!.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const col = Math.max(0, Math.round(px / Math.max(cellPx, 1)));
          onChordDrop(line.id, col);
        }}
        className="relative h-7 cursor-text outline-none rounded-sm focus:bg-accent/30"
        style={{ minWidth: `${Math.max(len + 1, 8) * cellPx}px` }}
      >
        {/* Placeholder */}
        {line.chords.length === 0 && (line.chordRowLen ?? 0) === 0 && !chordFocused && (
          <span className="absolute left-0 top-0 text-xs italic text-muted-foreground/60 leading-7 pointer-events-none select-none">
            add your chords here
          </span>
        )}
        {/* Chord chips at columns */}
        {line.chords.map((a) => {
          const col = colOf(a);
          const isSel = selected.has(a.id);
          return (
            <div
              key={a.id}
              className="absolute top-0 leading-7"
              style={{ left: `${col * cellPx}px` }}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", a.chord.display);
                onChordDragStart(a.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (selectMode) { toggleSelected(a.id); return; }
                setChordCaret(col);
                focusChord();
                onPickerOpen(line.id, col, a.id);
              }}
            >
              <ChordChip
                chord={a.chord}
                variant="ink"
                size="sm"
                selected={selectMode && isSel}
                audition={!selectMode}
                onLongPress={() => {
                  if (selectMode) toggleSelected(a.id); else enterSelect(a.id);
                }}
              />
            </div>
          );
        })}
        {/* Caret + live chord query (mirrored from picker input) */}
        {chordFocused && !selectMode && (
          <>
            {active && chordRowQuery && chordRowQuery.length > 0 && (
              <span
                aria-hidden
                className="absolute top-0 leading-7 font-mono-chord text-sm font-semibold text-primary/80 pointer-events-none whitespace-pre"
                style={{ left: `${chordCaret * cellPx}px` }}
              >
                {chordRowQuery}
              </span>
            )}
            <span
              aria-hidden
              className="absolute top-1 bottom-1 w-px bg-primary animate-pulse pointer-events-none"
              style={{ left: `${(chordCaret + (active ? (chordRowQuery?.length ?? 0) : 0)) * cellPx}px` }}
            />
          </>
        )}
      </div>

      {selectMode && (
        <div className="mb-1 flex flex-wrap items-center gap-1 rounded-md border border-border bg-card px-2 py-1 shadow-sm text-xs">
          <span className="text-muted-foreground">{selectedIds.length} selected</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!selectedIds.length}
            onClick={() => moveSelectedChordsByOrder(sectionId, line.id, selectedIds, -1)} aria-label="Move chord left (by order)">
            <ArrowUp className="h-3 w-3 -rotate-90" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!selectedIds.length}
            onClick={() => moveSelectedChordsByOrder(sectionId, line.id, selectedIds, 1)} aria-label="Move chord right (by order)">
            <ArrowDown className="h-3 w-3 -rotate-90" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!selectedIds.length}
            onClick={doCut} aria-label="Cut">
            <Scissors className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!selectedIds.length}
            onClick={doCopy} aria-label="Copy">
            <Copy className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6"
            onClick={doPaste} aria-label="Paste">
            <ClipboardPaste className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" disabled={!selectedIds.length}
            onClick={() => { removeChordAnchorsBatch(sectionId, line.id, selectedIds); exitSelect(); }} aria-label="Delete selected">
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 ml-auto" onClick={exitSelect}>Done</Button>
        </div>
      )}

      {/* LYRIC INPUT */}
      <div className="relative">
        <input
          ref={lyricInputRef}
          data-lyric-input={line.id}
          value={line.text}
          onChange={handleLyricChange}
          onKeyDown={handleLyricKeyDown}
          placeholder="Write your lyric line…"
          className="w-full bg-transparent border-0 outline-none font-display text-lg leading-9 text-foreground placeholder:text-muted-foreground/60 px-0"
        />
      </div>
    </div>
  );
}

interface SectionCardProps {
  section: Section;
  index: number;
  total: number;
  displayName: string;
  activeLineId?: string;
  onPickerOpen: (sectionId: string, lineId: string, col: number, anchorId?: string) => void;
  onChordDragStart: (sectionId: string, lineId: string, anchorId: string) => void;
  onChordDrop: (toSectionId: string, toLineId: string, toCol: number) => void;
}

function SectionCard({ section, index, total, displayName, activeLineId, onPickerOpen, onChordDragStart, onChordDrop }: SectionCardProps) {
  const {
    addLine, removeLine, updateSection, removeSection, duplicateSection, moveSection,
    toggleSectionCollapsed, upsertChordAt, basket, setSectionComment,
  } = useSongStore();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(section.label);
  // Remember previous type so we can revert if the user cancels the custom-name dialog
  const prevTypeRef = useRef<SectionType | null>(null);
  const prevLabelRef = useRef<string>(section.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { lineId: string; kind: "lyric" | "chord" }>(null);
  const cellPx = useCellPx();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraftLabel(section.label); }, [section.label]);

  const acceptCustomName = () => {
    const trimmed = draftLabel.trim() || "Section";
    updateSection(section.id, { label: trimmed });
    prevTypeRef.current = null;
    setCustomRenameOpen(false);
  };

  const cancelCustomName = () => {
    // Revert to the previous section type/label if Custom was just selected
    if (prevTypeRef.current && prevTypeRef.current !== "custom") {
      updateSection(section.id, { type: prevTypeRef.current, label: prevLabelRef.current });
    }
    prevTypeRef.current = null;
    setCustomRenameOpen(false);
  };

  const focusPrevLine = (lineId: string, kind: "lyric" | "chord") => {
    const idx = section.lines.findIndex((l) => l.id === lineId);
    if (idx <= 0) return;
    const prev = section.lines[idx - 1];
    setTimeout(() => {
      if (kind === "chord") {
        const el = document.querySelector<HTMLInputElement>(`[data-lyric-input="${prev.id}"]`);
        if (el) { el.focus(); const end = el.value.length; el.setSelectionRange(end, end); }
      } else {
        const el = document.querySelector<HTMLInputElement>(`[data-lyric-input="${prev.id}"]`);
        if (el) { el.focus(); const end = el.value.length; el.setSelectionRange(end, end); }
      }
    }, 10);
  };

  const handleMergeUp = (lineId: string, kind: "lyric" | "chord") => {
    const idx = section.lines.findIndex((l) => l.id === lineId);
    if (idx <= 0) return; // can't merge above the first line of section
    const line = section.lines[idx];
    const hasOpposite =
      kind === "lyric"
        ? (line.chords.length > 0 || (line.chordRowLen ?? 0) > 0)
        : line.text.trim().length > 0;
    if (hasOpposite) {
      setConfirm({ lineId, kind });
    } else {
      removeLine(section.id, lineId);
      focusPrevLine(lineId, kind);
    }
  };

  const confirmDelete = () => {
    if (!confirm) return;
    const { lineId, kind } = confirm;
    setConfirm(null);
    removeLine(section.id, lineId);
    focusPrevLine(lineId, kind);
  };

  const hasComment = !!(section.comment && section.comment.trim().length);

  return (
    <div ref={cardRef} className="paper-card paper-ruled paper-margin rounded-xl px-10 py-5">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 -ml-4">
        <button
          onClick={() => toggleSectionCollapsed(section.id)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={section.collapsed ? "Expand section" : "Collapse section"}
        >
          {section.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <Select
          value={section.type}
          onValueChange={(v) => {
            const next = v as SectionType;
            if (next === "custom") {
              // Stash previous so Cancel can revert
              prevTypeRef.current = section.type;
              prevLabelRef.current = section.label;
              updateSection(section.id, { type: next, label: section.label || "Section" });
              setDraftLabel(section.label && section.type === "custom" ? section.label : "");
              setCustomRenameOpen(true);
            } else {
              updateSection(section.id, { type: next, label: section.label });
            }
          }}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-sm font-display font-semibold ink-chord capitalize">
            <SelectValue>{displayName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SECTION_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {section.type === "custom" && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCustomRenameOpen(true)} aria-label="Rename custom section">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-1">
          {section.lines.length} line{section.lines.length === 1 ? "" : "s"}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
            <DropdownMenuItem onClick={() => moveSection(section.id, -1)} disabled={index === 0}>
              <ArrowUp className="h-4 w-4" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => moveSection(section.id, 1)} disabled={index === total - 1}>
              <ArrowDown className="h-4 w-4" /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => removeSection(section.id)}
              disabled={total <= 1}
            >
              <Trash2 className="h-4 w-4" /> Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
                onMergeUp={(kind) => { handleMergeUp(line.id, kind); return true; }}
                onPickerOpen={(lineId, col, anchorId) => onPickerOpen(section.id, lineId, col, anchorId)}
                cellPx={cellPx}
                onChordFocus={() => { /* parent handles via picker */ }}
                onChordDragStart={(anchorId) => onChordDragStart(section.id, line.id, anchorId)}
                onChordDrop={(toLineId, toCol) => onChordDrop(section.id, toLineId, toCol)}
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
                        const nextCol = (last.chordRowLen ?? 0) > 0 ? (last.chordRowLen ?? 0) + 1 : 0;
                        upsertChordAt(section.id, last.id, nextCol, b.chord);
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
                <><MessageSquare className="h-3.5 w-3.5" /> Comment</>
              ) : (
                <><Plus className="h-3.5 w-3.5" /> add comment</>
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
      <Dialog open={customRenameOpen} onOpenChange={(o) => { if (!o) cancelCustomName(); else setCustomRenameOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name this section</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") acceptCustomName(); }}
            placeholder="e.g. Refrain, Tag, Solo…"
            className="font-display text-base"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={cancelCustomName}>Cancel</Button>
            <Button onClick={acceptCustomName}>Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm row delete (cross-row backspace) */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
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
    </div>
  );
}

/** Measure the width of a single monospace "ch" using the chord-row font. */
function useCellPx(): number {
  const [px, setPx] = useState(8);
  useLayoutEffect(() => {
    const probe = document.createElement("span");
    probe.className = "font-mono-chord text-sm font-semibold";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    probe.textContent = " ".repeat(20);
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 20;
    document.body.removeChild(probe);
    if (w > 0) setPx(w);
  }, []);
  return px;
}

export function LyricsTab() {
  const { sections, upsertChordAt, removeChordAnchor, addSection, moveChordAnchor } = useSongStore();
  const [picker, setPicker] = useState<{ sectionId: string; lineId: string; col: number; anchorId?: string } | null>(null);
  // Track which chord chip is being dragged (across rows / sections).
  const dragRef = useRef<{ sectionId: string; lineId: string; anchorId: string } | null>(null);

  const openPicker = (sectionId: string, lineId: string, col: number, anchorId?: string) => {
    setPicker({ sectionId, lineId, col, anchorId });
  };

  const activeSection = picker ? sections.find((s) => s.id === picker.sectionId) : undefined;
  const activeLine = activeSection?.lines.find((l) => l.id === picker?.lineId);
  const initialChord = activeLine?.chords.find((c) => c.id === picker?.anchorId)?.chord;

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    upsertChordAt(picker.sectionId, picker.lineId, picker.col, chord, picker.anchorId);
  };
  const handleRemove = () => {
    if (!picker?.anchorId) return;
    removeChordAnchor(picker.sectionId, picker.lineId, picker.anchorId);
  };

  const handleChordDragStart = (sectionId: string, lineId: string, anchorId: string) => {
    dragRef.current = { sectionId, lineId, anchorId };
  };
  const handleChordDrop = (toSectionId: string, toLineId: string, toCol: number) => {
    const src = dragRef.current;
    dragRef.current = null;
    if (!src) return;
    moveChordAnchor(src.sectionId, src.lineId, src.anchorId, toSectionId, toLineId, toCol);
  };

  return (
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
          onChordDragStart={handleChordDragStart}
          onChordDrop={handleChordDrop}
        />
      ))}

      <div className={cn("flex flex-wrap items-center gap-2")}>
        <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Add section</span>
        {(["verse", "chorus", "bridge", "intro"] as SectionType[]).map((t) => (
          <Button key={t} size="sm" variant="outline" onClick={() => addSection(t)} className="capitalize">
            <Plus className="h-3.5 w-3.5" /> {t}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addSection("custom")}>
          <Plus className="h-3.5 w-3.5" /> Custom…
        </Button>
      </div>

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => { if (!o) setPicker(null); }}
        initialChord={initialChord}
        onPick={handlePick}
        onRemove={picker?.anchorId ? handleRemove : undefined}
        activeLineId={picker?.lineId}
      />
    </div>
  );
}
