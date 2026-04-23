import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSongStore, getSectionDisplayName, type LyricLine, type Section, type SectionType } from "@/store/song";
import { usePlaybackStore } from "@/store/playback";
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
import { Plus, Trash2, ChevronDown, ChevronRight, MoreVertical, Copy, ArrowUp, ArrowDown, Pencil, MessageSquare, Scissors, ClipboardPaste, CheckSquare, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";

// Module-scoped chord clipboard (cut/copy/paste across rows).
type ChordClip = { chord: ChordSymbol; relCol: number; widthCh: number };
let chordClipboard: ChordClip[] = [];

/** Parse "Amaj7 G#maj7 Dmaj7" (or comma/newline separated) into chord clips. */
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
  /** Multi-chord pointer-based drag-and-drop across rows. */
  onMultiDragStart?: (sectionId: string, lineId: string, anchorIds: string[]) => void;
}

function LineRow({
  sectionId, line, active, isFirst, onAddLineAfter, onMergeUp, onPickerOpen, cellPx, onChordFocus,
  onChordDragStart, onChordDrop, chordRowQuery, onChordRowQueryChange, onMultiDragStart,
}: LineRowProps) {
  const {
    setLineText, upsertChordAt,
    removeChordAnchor, removeChordAnchorsBatch, moveSelectedChordsByOrder,
    setChordRowLen, insertChordSpaceAt, removeChordCellAt, pasteChordsAt,
    moveSelectedChordsTo,
    undo, redo,
  } = useSongStore();
  const playbackCurrent = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setFocusedPattern = usePlaybackStore((s) => s.setFocusedPattern);
  const playingAnchorId = isPlaying && playbackCurrent?.mirrorId ? playbackCurrent.mirrorId : null;
  const lyricInputRef = useRef<HTMLTextAreaElement>(null);
  const chordRowRef = useRef<HTMLDivElement>(null);
  const keyHostRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [chordCaret, setChordCaret] = useState(0); // column index in chord row
  const [chordFocused, setChordFocused] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);
  const [areaSel, setAreaSel] = useState<{ x1: number; x2: number } | null>(null);
  const areaStartRef = useRef<{ x: number; additive: boolean } | null>(null);
  // Long-press-on-empty-space paste popover.
  const [pastePopover, setPastePopover] = useState<null | { col: number; x: number }>(null);
  const pastePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Outside-tap closes the paste popover.
  useEffect(() => {
    if (!pastePopover) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (rowRef.current && rowRef.current.contains(t)) return;
      setPastePopover(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [pastePopover]);
  // Pointer-based multi-chord drag state.
  const [drag, setDrag] = useState<null | {
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    ids: string[];
    displays: string[];
    targetLineId?: string;
    targetCol?: number;
  }>(null);
  const dragRef2 = useRef<typeof drag>(null);
  dragRef2.current = drag;

  // Auto-resize lyric textarea to fit wrapped content.
  useLayoutEffect(() => {
    const ta = lyricInputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [line.text]);

  // Scroll the active row into view, recomputing as the visualViewport changes
  // (e.g. when the mobile soft keyboard appears and shrinks vv.height).
  useEffect(() => {
    if (!active || !rowRef.current) return;
    const el = rowRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const scrollIntoView = () => {
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      const vvTop = vv?.offsetTop ?? 0;
      const targetTop = vvTop + 80;
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

  const writeOSClipboard = (clip: ChordClip[]) => {
    if (!clip.length) return;
    try {
      const text = clip
        .sort((a, b) => a.relCol - b.relCol)
        .map((c) => c.chord.display)
        .join(" ");
      void navigator.clipboard?.writeText(text);
    } catch { /* ignore */ }
  };

  const doCopy = () => {
    chordClipboard = collectClip(Array.from(selected));
    writeOSClipboard(chordClipboard);
  };
  const doCut = () => {
    chordClipboard = collectClip(Array.from(selected));
    writeOSClipboard(chordClipboard);
    removeChordAnchorsBatch(sectionId, line.id, Array.from(selected));
    exitSelect();
  };
  const doPaste = async (atCol?: number) => {
    const col = atCol ?? chordCaret;
    // Prefer OS clipboard if it parses into chords (lets users paste typed
    // chord runs like "Amaj7 G#maj7 Dmaj7" directly into the row).
    let clip: ChordClip[] = [];
    try {
      const text = await navigator.clipboard?.readText();
      if (text && text.trim()) {
        clip = parseChordTextToClips(text);
      }
    } catch { /* clipboard read denied — fall back */ }
    if (!clip.length) clip = chordClipboard;
    if (!clip.length) return;
    pasteChordsAt(sectionId, line.id, col, clip);
  };

  // Effective row length must account for the visual width of each chord chip,
  // including the chip's horizontal padding (px-2 ≈ 2ch each side ≈ 4ch total).
  // Without this padding budget, neighboring chips visually overlap even though
  // their starting columns are technically distinct.
  const CHIP_PAD_CH = 4;
  const chordVisualWidth = (display: string) => Math.max(1, display.length) + CHIP_PAD_CH;
  const chordEndCol = (a: { chordCol?: number; offset?: number; chord: { display: string } }) =>
    colOf(a) + chordVisualWidth(a.chord.display);
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
      // Suppress outside-tap-exit while a pointer drag is in progress.
      if (dragRef2.current) return;
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
    if (isMobile && keyHostRef.current) {
      keyHostRef.current.focus({ preventScroll: true });
    } else {
      chordRowRef.current?.focus();
    }
    setChordFocused(true);
    onChordFocus(line.id);
  };

  const sortedChords = [...line.chords].sort(
    (a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0),
  );

  const selectRangeTo = (anchorId: string, additive: boolean) => {
    const anchor = lastSelectedRef.current;
    const ids = sortedChords.map((c) => c.id);
    const i2 = ids.indexOf(anchorId);
    if (i2 < 0) return;
    const i1 = anchor ? ids.indexOf(anchor) : i2;
    const [from, to] = i1 <= i2 ? [i1, i2] : [i2, i1];
    const range = ids.slice(from, to + 1);
    setSelectMode(true);
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      range.forEach((id) => next.add(id));
      return next;
    });
    lastSelectedRef.current = anchorId;
  };

  const handleChordRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectMode) return;
    if (areaStartRef.current) return; // a drag just ended — skip caret
    // Interacting with a chord row in lyrics clears any pattern-block focus
    // so global play resumes from the start of the progression.
    setFocusedPattern(null);
    const rect = chordRowRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const col = Math.max(0, Math.min(len, Math.round(px / Math.max(cellPx, 1))));
    setChordCaret(col);
    focusChord();
    onPickerOpen(line.id, col);
  };

  // ---------- Drag-area select on empty chord row ----------
  const handleRowMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Skip if mousedown started on a chip (chip wrapper has data-chip-anchor)
    if (target.closest("[data-chip-anchor]")) return;
    const rect = chordRowRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    areaStartRef.current = { x, additive: e.shiftKey || e.metaKey || e.ctrlKey };
    setAreaSel({ x1: x, x2: x });
  };

  useEffect(() => {
    if (!areaSel) return;
    const onMove = (ev: MouseEvent) => {
      const rect = chordRowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ev.clientX - rect.left;
      setAreaSel((prev) => prev ? { ...prev, x2: x } : prev);
    };
    const onUp = () => {
      const start = areaStartRef.current;
      const cur = areaSel;
      setAreaSel(null);
      if (!start || !cur) { areaStartRef.current = null; return; }
      const [x1, x2] = [Math.min(cur.x1, cur.x2), Math.max(cur.x1, cur.x2)];
      if (Math.abs(cur.x2 - cur.x1) < 4) { areaStartRef.current = null; return; }
      const cellWidth = Math.max(cellPx, 1);
      const c1 = x1 / cellWidth;
      const c2 = x2 / cellWidth;
      const hits = sortedChords.filter((c) => {
        const cc = c.chordCol ?? c.offset ?? 0;
        const cEnd = cc + Math.max(1, c.chord.display.length);
        return cc <= c2 && cEnd >= c1;
      }).map((c) => c.id);
      if (hits.length) {
        setSelectMode(true);
        setSelected((prev) => {
          const next = start.additive ? new Set(prev) : new Set<string>();
          hits.forEach((id) => next.add(id));
          return next;
        });
        lastSelectedRef.current = hits[hits.length - 1];
      }
      // Defer clearing so the click handler can see we just dragged
      setTimeout(() => { areaStartRef.current = null; }, 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [areaSel, cellPx, sortedChords]);

  const selectAll = () => {
    if (line.chords.length === 0) return;
    setSelectMode(true);
    setSelected(new Set(line.chords.map((c) => c.id)));
  };

  // Global Ctrl/Cmd+A: select all chords in this row when the row is "active"
  // (chord row focused OR already in select mode). Works even if focus drifted
  // to the picker, lyric input, or elsewhere on the page.
  useEffect(() => {
    if (!chordFocused && !selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || (e.key !== "a" && e.key !== "A")) return;
      // Don't hijack ⌘A inside an input/textarea unless we're in selectMode.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!selectMode && (tag === "INPUT" || tag === "TEXTAREA")) return;
      e.preventDefault();
      selectAll();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chordFocused, selectMode, line.chords]);

  const handleChordKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;

    // Undo / Redo (chord-row history). Cmd/Ctrl+Z = undo; Cmd/Ctrl+Y or Cmd/Ctrl+Shift+Z = redo.
    if (mod && (k === "z" || k === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && (k === "y" || k === "Y")) {
      e.preventDefault();
      redo();
      return;
    }

    // Keyboard shortcuts: Cmd/Ctrl + A / C / X / V — work in or out of selectMode.
    if (mod && (k === "a" || k === "A")) {
      e.preventDefault();
      selectAll();
      return;
    }
    if (mod && (k === "c" || k === "C")) {
      if (selected.size > 0) { e.preventDefault(); doCopy(); return; }
    }
    if (mod && (k === "x" || k === "X")) {
      if (selected.size > 0) { e.preventDefault(); doCut(); return; }
    }
    if (mod && (k === "v" || k === "V")) {
      e.preventDefault(); doPaste(); return;
    }

    if (selectMode) return;
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

  // Pointer-based drag for multi-selected chords (touch + mouse).
  useEffect(() => {
    if (!drag) return;
    const DRAG_THRESHOLD = 6;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      const moved = Math.hypot(dx, dy) >= DRAG_THRESHOLD;

      // Compute hit-tested target chord row (if any).
      let targetLineId: string | undefined;
      let targetCol: number | undefined;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const rowEl = hit?.closest("[data-chord-row]") as HTMLElement | null;
      if (rowEl) {
        targetLineId = rowEl.getAttribute("data-chord-row") ?? undefined;
        const r = rowEl.getBoundingClientRect();
        targetCol = Math.max(0, Math.round((ev.clientX - r.left) / Math.max(cellPx, 1)));
      }

      setDrag((prev) => prev ? {
        ...prev,
        x: ev.clientX,
        y: ev.clientY,
        active: prev.active || moved,
        targetLineId,
        targetCol,
      } : prev);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.pointerId) return;
      const cur = dragRef2.current;
      setDrag(null);
      if (!cur || !cur.active) return;
      if (!cur.targetLineId || cur.targetCol == null) return;

      // Determine target section by walking the DOM up from the row el.
      const rowEl = document.querySelector<HTMLElement>(`[data-chord-row="${cur.targetLineId}"]`);
      const sectionEl = rowEl?.closest("[data-section-id]") as HTMLElement | null;
      const toSectionId = sectionEl?.getAttribute("data-section-id") ?? sectionId;

      moveSelectedChordsTo(sectionId, line.id, toSectionId, cur.targetLineId, cur.targetCol, cur.ids);
      exitSelect();
    };

    const onCancel = () => setDrag(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag?.pointerId]); // re-bind only when a new drag starts
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
        onMouseDown={handleRowMouseDown}
        onClick={handleChordRowClick}
        onKeyDown={handleChordKeyDown}
        onFocus={() => { setChordFocused(true); onChordFocus(line.id); }}
        onBlur={() => setChordFocused(false)}
        onPointerDown={(e) => {
          // Long-press on empty space (not on a chip) opens the paste menu.
          const t = e.target as HTMLElement;
          if (t.closest("[data-chip-anchor]")) return;
          if (pastePressTimerRef.current) clearTimeout(pastePressTimerRef.current);
          const rect = chordRowRef.current!.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const col = Math.max(0, Math.round(px / Math.max(cellPx, 1)));
          pastePressTimerRef.current = setTimeout(() => {
            setPastePopover({ col, x: px });
          }, 500);
        }}
        onPointerMove={() => {
          if (pastePressTimerRef.current) { clearTimeout(pastePressTimerRef.current); pastePressTimerRef.current = null; }
        }}
        onPointerUp={() => {
          if (pastePressTimerRef.current) { clearTimeout(pastePressTimerRef.current); pastePressTimerRef.current = null; }
        }}
        onPointerCancel={() => {
          if (pastePressTimerRef.current) { clearTimeout(pastePressTimerRef.current); pastePressTimerRef.current = null; }
        }}
        onContextMenu={(e) => {
          // Right-click also opens the paste popover (desktop convenience).
          const t = e.target as HTMLElement;
          if (t.closest("[data-chip-anchor]")) return;
          e.preventDefault();
          const rect = chordRowRef.current!.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const col = Math.max(0, Math.round(px / Math.max(cellPx, 1)));
          setPastePopover({ col, x: px });
        }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => {
          e.preventDefault();
          const rect = chordRowRef.current!.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const col = Math.max(0, Math.round(px / Math.max(cellPx, 1)));
          onChordDrop(line.id, col);
        }}
        className="relative h-7 cursor-text outline-none rounded-sm bg-accent/20 focus:bg-accent/40"
        style={{ minWidth: `${Math.max(len + 1, 8) * cellPx}px` }}
      >
        {/* Placeholder */}
        {line.chords.length === 0 && (line.chordRowLen ?? 0) === 0 && !chordFocused && (
          <span className="absolute left-0 top-0 text-xs italic text-muted-foreground/60 leading-7 pointer-events-none select-none">
            add your chords here
          </span>
        )}
        {/* Drag-area visual rectangle */}
        {areaSel && (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 bg-primary/20 border border-primary/50 rounded-sm pointer-events-none"
            style={{
              left: `${Math.min(areaSel.x1, areaSel.x2)}px`,
              width: `${Math.abs(areaSel.x2 - areaSel.x1)}px`,
            }}
          />
        )}
        {/* Playback playhead — bright orange typing-cursor stick at left of currently-playing chord, with a downward arrow on top */}
        {playingAnchorId && (() => {
          const playing = line.chords.find((a) => a.id === playingAnchorId);
          if (!playing) return null;
          return (
            <div
              aria-hidden
              className="absolute top-0 bottom-0 pointer-events-none animate-pulse"
              style={{ left: `${colOf(playing) * cellPx - 1}px`, width: "3px" }}
            >
              <span className="absolute left-0 right-0 top-[7px] bottom-0 rounded-sm bg-[hsl(var(--chord-chip))] shadow-[0_0_8px_hsl(var(--chord-chip))]" />
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
        {/* Chord chips at columns */}
        {line.chords.map((a) => {
          const col = colOf(a);
          const isSel = selected.has(a.id);
          const handleChipTap = (e?: React.MouseEvent) => {
            // Shift+click = range select (works in or out of selectMode)
            if (e && e.shiftKey) {
              selectRangeTo(a.id, true);
              return;
            }
            if (selectMode) {
              toggleSelected(a.id);
              lastSelectedRef.current = a.id;
              return;
            }
            setChordCaret(col);
            focusChord();
            onPickerOpen(line.id, col, a.id);
          };
          // Begin a pointer drag from this chip when in selectMode and chip is selected.
          const beginPointerDrag = (e: React.PointerEvent) => {
            if (!selectMode || !selected.has(a.id)) return;
            // Use selected set as the drag payload.
            const ids = Array.from(selected);
            const displays = sortedChords
              .filter((c) => selected.has(c.id))
              .map((c) => c.chord.display);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            setDrag({
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              x: e.clientX,
              y: e.clientY,
              active: false,
              ids,
              displays,
            });
            onMultiDragStart?.(sectionId, line.id, ids);
          };
          return (
            <div
              key={a.id}
              data-chip-anchor={a.id}
              className="absolute top-0 leading-7"
              style={{ left: `${col * cellPx}px` }}
              draggable={!selectMode}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", a.chord.display);
                onChordDragStart(a.id);
              }}
              onPointerDown={beginPointerDrag}
              onClick={(e) => {
                // Suppress click if we just dragged.
                if (drag?.active) { e.stopPropagation(); e.preventDefault(); return; }
                e.stopPropagation();
                handleChipTap(e);
              }}
            >
              <ChordChip
                chord={a.chord}
                variant="ink"
                size="sm"
                selected={selectMode && isSel}
                audition
                onLongPress={() => {
                  if (selectMode) {
                    // If already selected, do nothing — the user is about to drag.
                    if (selected.has(a.id)) return;
                    toggleSelected(a.id);
                  } else {
                    enterSelect(a.id);
                  }
                  lastSelectedRef.current = a.id;
                }}
              />
            </div>
          );
        })}
        {/* Caret + live chord query (mirrored from picker input) */}
        {chordFocused && !selectMode && (() => {
          // Hide the ghost overlay if the query matches an existing chord at the caret —
          // i.e. the picker was opened to edit, not to type a new chord. This prevents
          // a stale "clone" of the chord display from rendering at the old position.
          const editingExisting = !!sortedChords.find(
            (c) => colOf(c) === chordCaret && c.chord.display === chordRowQuery,
          );
          const showOverlay = !!(active && chordRowQuery && chordRowQuery.length > 0 && !editingExisting);
          return (
            <>
              {showOverlay && (
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
                style={{ left: `${(chordCaret + (showOverlay ? (chordRowQuery?.length ?? 0) : 0)) * cellPx}px` }}
              />
            </>
          );
        })()}
      </div>

      {/* Long-press paste popover for empty chord-row spaces. */}
      {pastePopover && (
        <div
          className="absolute z-[80] mt-1 flex items-center gap-1 rounded-md border border-border bg-popover px-1.5 py-1 shadow-lg text-xs"
          style={{ left: `${pastePopover.x}px`, top: "100%" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={async () => {
              const col = pastePopover.col;
              setPastePopover(null);
              await doPaste(col);
            }}
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste chords
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPastePopover(null)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Hidden text input — used on mobile so the soft keyboard stays open
          while the user types/presses Space inside the chord row. */}
      <input
        ref={keyHostRef}
        data-chord-row-keyhost={line.id}
        aria-hidden
        tabIndex={-1}
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="absolute opacity-0 pointer-events-none"
        style={{ left: 0, top: 0, width: 1, height: 1 }}
        onKeyDown={(e) => handleChordKeyDown(e as unknown as React.KeyboardEvent<HTMLDivElement>)}
        onFocus={() => { setChordFocused(true); onChordFocus(line.id); }}
        onBlur={() => setChordFocused(false)}
        onChange={() => { /* swallow — we only consume keydown */ }}
      />

      {/* Drag insert marker on the target chord row. */}
      {drag?.active && drag.targetLineId === line.id && drag.targetCol != null && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-7 w-px bg-primary pointer-events-none"
          style={{ left: `${drag.targetCol * cellPx}px` }}
        />
      )}

      {/* Floating drag ghost (rendered while this row owns the drag). */}
      {drag?.active && (
        <div
          aria-hidden
          className="fixed z-[100] pointer-events-none rounded-md border border-primary/60 bg-card/95 shadow-lg px-2 py-1 font-mono-chord text-xs ink-chord"
          style={{ left: drag.x + 12, top: drag.y + 8 }}
        >
          {drag.displays.join(" ")}
        </div>
      )}

      {selectMode && (
        <div className="mt-5 mb-1 flex flex-col gap-[10px] rounded-md border border-border bg-card px-2 py-2 shadow-sm text-xs">
          {/* Row 1: status + action buttons */}
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-muted-foreground">{selectedIds.length} selected</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={selectAll}
              aria-label="Select all chords" title="Select all (⌘/Ctrl+A)">
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
              onClick={doCut} aria-label="Cut" title="Cut (⌘/Ctrl+X)">
              <Scissors className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
              onClick={doCopy} aria-label="Copy" title="Copy (⌘/Ctrl+C)">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => doPaste()} aria-label="Paste" title="Paste (⌘/Ctrl+V)">
              <ClipboardPaste className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={!selectedIds.length}
              onClick={() => { removeChordAnchorsBatch(sectionId, line.id, selectedIds); exitSelect(); }} aria-label="Delete selected">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Row 2: arrows + Done */}
          <div className="flex flex-wrap items-center gap-[10px]">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
              onClick={() => moveSelectedChordsByOrder(sectionId, line.id, selectedIds, -1)} aria-label="Move chord left (by order)">
              <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
              onClick={() => moveSelectedChordsByOrder(sectionId, line.id, selectedIds, 1)} aria-label="Move chord right (by order)">
              <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 ml-auto" onClick={exitSelect}>Done</Button>
          </div>
        </div>
      )}

      {/* LYRIC INPUT — textarea so long lines wrap to new visual lines within the same lyric row */}
      <div className="relative rounded-sm bg-accent/10">
        <textarea
          ref={lyricInputRef}
          data-lyric-input={line.id}
          value={line.text}
          rows={1}
          onChange={(e) => {
            setLineText(sectionId, line.id, e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const newId = onAddLineAfter();
              if (typeof newId === "string") {
                setTimeout(() => {
                  document.querySelector<HTMLTextAreaElement>(`[data-lyric-input="${newId}"]`)?.focus();
                }, 10);
              }
            } else if (
              e.key === "Backspace" &&
              lyricInputRef.current?.selectionStart === 0 &&
              lyricInputRef.current.selectionEnd === 0 &&
              line.text === ""
            ) {
              e.preventDefault();
              onMergeUp("lyric", "", line.chords.length, line.chordRowLen ?? 0);
            }
          }}
          placeholder="Write your lyric line…"
          className="w-full bg-transparent border-0 outline-none resize-none overflow-hidden font-display text-lg leading-9 text-foreground placeholder:text-muted-foreground/60 px-1 break-words"
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
  chordRowQuery?: string;
  onChordRowQueryChange?: (q: string) => void;
  sortMode?: boolean;
}

function SectionCard({ section, index, total, displayName, activeLineId, onPickerOpen, onChordDragStart, onChordDrop, chordRowQuery, onChordRowQueryChange, sortMode }: SectionCardProps) {
  const {
    addLine, removeLine, updateSection, removeSection, duplicateSection,
    toggleSectionCollapsed, upsertChordAt, basket, setSectionComment,
    suppressCrossTabDeleteWarning, setSuppressCrossTabDeleteWarning,
    moveSection,
  } = useSongStore();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(section.label);
  const prevTypeRef = useRef<SectionType | null>(null);
  const prevLabelRef = useRef<string>(section.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { lineId: string; kind: "lyric" | "chord" }>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false);
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
    <div
      ref={cardRef}
      data-section-id={section.id}
      className="paper-card rounded-xl px-5 py-5 transition-shadow"
    >
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 -ml-4 select-none [-webkit-touch-callout:none] [-webkit-user-select:none]">
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
              className="h-7 w-7"
              onClick={() => moveSection(section.id, -1)}
              disabled={index === 0}
              aria-label="Move section up"
              title="Move section up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => moveSection(section.id, 1)}
              disabled={index >= total - 1}
              aria-label="Move section down"
              title="Move section down"
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

        {/* Expand/collapse toggle — moved to the right of the header */}
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
                onMergeUp={(kind) => { handleMergeUp(line.id, kind); return true; }}
                onPickerOpen={(lineId, col, anchorId) => onPickerOpen(section.id, lineId, col, anchorId)}
                cellPx={cellPx}
                onChordFocus={() => { /* parent handles via picker */ }}
                onChordDragStart={(anchorId) => onChordDragStart(section.id, line.id, anchorId)}
                onChordDrop={(toLineId, toCol) => onChordDrop(section.id, toLineId, toCol)}
                chordRowQuery={activeLineId === line.id ? chordRowQuery : undefined}
                onChordRowQueryChange={activeLineId === line.id ? onChordRowQueryChange : undefined}
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

interface LyricsTabProps {
  sortMode?: boolean;
}

export function LyricsTab({ sortMode = false }: LyricsTabProps) {
  const { sections, upsertChordAt, addSection, moveChordAnchor, basket } = useSongStore();
  const [picker, setPicker] = useState<{ sectionId: string; lineId: string; col: number; anchorId?: string } | null>(null);
  // Shared chord query: typed in either the picker input OR the active chord row.
  const [pickerQuery, setPickerQuery] = useState("");
  // Track which chord chip is being dragged (across rows / sections).
  const dragRef = useRef<{ sectionId: string; lineId: string; anchorId: string } | null>(null);

  const openPicker = (sectionId: string, lineId: string, col: number, anchorId?: string) => {
    // Basket steals focus: while it has items, the chord picker cannot open.
    if (basket.length > 0) return;
    setPicker({ sectionId, lineId, col, anchorId });
  };

  // If basket becomes non-empty while picker is open, close it.
  useEffect(() => {
    if (basket.length > 0 && picker) setPicker(null);
  }, [basket.length, picker]);

  const activeSection = picker ? sections.find((s) => s.id === picker.sectionId) : undefined;
  const activeLine = activeSection?.lines.find((l) => l.id === picker?.lineId);
  const initialChord = activeLine?.chords.find((c) => c.id === picker?.anchorId)?.chord;

  // Seed the shared query when the picker opens onto a specific chord.
  useEffect(() => {
    if (picker) setPickerQuery(initialChord?.display ?? "");
    else setPickerQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker?.sectionId, picker?.lineId, picker?.anchorId]);

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    upsertChordAt(picker.sectionId, picker.lineId, picker.col, chord, picker.anchorId);
    setPickerQuery("");
    // After committing, drop the anchor so subsequent typing creates a NEW
    // chord instead of editing the one we just placed. Advance the caret
    // past the placed chord (display width + 1 space) so the next chord
    // appears next to it rather than overlapping.
    const advance = Math.max(1, chord.display.length) + 1;
    setPicker((prev) => prev ? { ...prev, anchorId: undefined, col: prev.col + advance } : prev);
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
          chordRowQuery={picker?.sectionId === sec.id ? pickerQuery : undefined}
          onChordRowQueryChange={picker?.sectionId === sec.id ? setPickerQuery : undefined}
          sortMode={sortMode}
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
        activeLineId={picker?.lineId}
        query={pickerQuery}
        onQueryChange={setPickerQuery}
      />
    </div>
  );
}
