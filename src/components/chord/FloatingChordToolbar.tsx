import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import {
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Minus,
  Plus,
  CheckSquare,
  ListChecks,
  Trash2,
  X,
} from "lucide-react";

type Mode = "progression" | "lyrics";

export interface FloatingChordToolbarProps {
  mode: Mode;
  /** When true, the Pencil FAB trigger button is hidden (sticky bar provides it). */
  hideTrigger?: boolean;
  activeChord:
    | { id: string; display: string; octave?: number; lengthBeats?: number }
    | null;
  selectedCount: number;
  selectedOctaves?: number[];
  canShiftLeft: boolean;
  canShiftRight: boolean;
  onShift: (direction: -1 | 1) => void;
  /** Lyrics mode only: move the current selection to the chord row above/below. */
  onMoveVertical?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onResize?: (deltaBeats: number) => void;
  onOctaveChange?: (oct: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  /** Entering multi-select seeds the selection with the active chord. */
  onEnterMultiSelect?: () => void;
  onDelete?: () => void;
  onExitEdit: () => void;
}

const ANIM_STYLE: React.CSSProperties = {
  transitionProperty: "transform, opacity",
  transitionDuration: "400ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
};

export function FloatingChordToolbar({
  mode,
  hideTrigger = false,
  activeChord,
  selectedCount,
  selectedOctaves,
  canShiftLeft,
  canShiftRight,
  onShift,
  onMoveVertical,
  canMoveUp = false,
  canMoveDown = false,
  onResize,
  onOctaveChange,
  onSelectAll,
  onClearAll,
  onEnterMultiSelect,
  onDelete,
  onExitEdit,
}: FloatingChordToolbarProps) {
  const focusedEditorOpen = useUIStore((s) => s.focusedEditorOpen);
  const setToolbarExpanded = useUIStore((s) => s.setToolbarExpanded);
  const multiSelectMode = useUIStore((s) => s.multiSelectMode);
  const setMultiSelectMode = useUIStore((s) => s.setMultiSelectMode);
  const chordToolbarOpen = useUIStore((s) => s.chordToolbarOpen);
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
  const [expanded, setExpanded] = useState(false);
  const visible = !focusedEditorOpen;
  const effectiveExpanded = visible && expanded;

  useEffect(() => {
    if (chordToolbarOpen && visible) {
      setExpanded(true);
      setChordToolbarOpen(false);
    }
  }, [chordToolbarOpen, visible, setChordToolbarOpen]);

  useEffect(() => {
    setToolbarExpanded(effectiveExpanded);
    return () => {
      setToolbarExpanded(false);
      setMultiSelectMode(false);
    };
  }, [effectiveExpanded, setToolbarExpanded, setMultiSelectMode]);

  if (!visible) return null;

  const hasSelection = selectedCount > 0;
  const hasContext = !!activeChord || hasSelection;
  const middleLabel = hasSelection
    ? `${selectedCount} selected`
    : multiSelectMode
      ? "Tap chords to select"
      : activeChord
        ? activeChord.display
        : "Tap a chord to edit";
  const shiftDisabled = !hasContext;
  const beatDisabled = !hasContext;
  const octaveDisplay: string =
    selectedOctaves && selectedOctaves.length > 0
      ? selectedOctaves.every((o) => o === selectedOctaves[0])
        ? String(selectedOctaves[0])
        : "*"
      : activeChord
        ? String(activeChord.octave ?? 3)
        : "3";
  const octaveDisabled = !hasContext;
  const selectAllDisabled = !activeChord && !hasSelection;

  const toggleMode = () => {
    if (multiSelectMode) {
      setMultiSelectMode(false);
      onClearAll();
    } else {
      setMultiSelectMode(true);
      onEnterMultiSelect?.();
    }
  };

  const close = () => {
    setMultiSelectMode(false);
    onExitEdit();
    setExpanded(false);
  };

  const bottomClass = hideTrigger ? "bottom-16" : "bottom-4";

  return (
    <div className={`fixed ${bottomClass} right-4 z-[55] pointer-events-none`}>
      {!hideTrigger && (
        <button
          type="button"
          aria-label="Open chord editing toolbar"
          onClick={() => setExpanded(true)}
          style={ANIM_STYLE}
          className={cn(
            "absolute bottom-0 right-0 origin-bottom-right pointer-events-auto",
            "h-10 w-10 rounded-full flex items-center justify-center btn-sculpt-amber",
            expanded ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100",
          )}
        >
          <Pencil className="h-6 w-6" />
        </button>
      )}

      <div
        role="toolbar"
        aria-label="Chord editing toolbar"
        style={ANIM_STYLE}
        className={cn(
          "absolute bottom-0 right-0 origin-bottom-right pointer-events-auto",
          "rounded-2xl border bg-popover shadow-lg px-2 py-2 flex flex-col gap-1.5 min-w-[18rem]",
          expanded ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={shiftDisabled || !canShiftLeft}
            onClick={() => onShift(-1)}
            aria-label="Move chord earlier"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span
            className={cn(
              "flex-1 text-center text-sm select-none px-1 truncate",
              hasContext ? "font-mono-chord text-foreground" : "text-muted-foreground",
            )}
          >
            {middleLabel}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={shiftDisabled || !canShiftRight}
            onClick={() => onShift(1)}
            aria-label="Move chord later"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="w-px h-6 bg-border mx-0.5" />
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-9 w-9",
              multiSelectMode && "bg-[var(--ink-soft)] text-[var(--paper-card)] hover:bg-[var(--ink-soft)] hover:text-[var(--paper-card)]",
            )}
            onClick={toggleMode}
            aria-label={multiSelectMode ? "Exit multi-select mode" : "Enter multi-select mode"}
            title={multiSelectMode ? "Exit multi-select" : "Multi-select"}
          >
            <CheckSquare className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            className={cn(
              "h-9 w-9 text-destructive border border-destructive/40 bg-destructive/5 hover:text-destructive hover:bg-destructive/10",
              !hasContext && "opacity-60 cursor-not-allowed",
            )}
            aria-disabled={!hasContext}
            onClick={hasContext ? onDelete : undefined}
            aria-label="Delete selected chord(s)"
            title="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
          <div className="w-px h-6 bg-border mx-0.5" />
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={close}
            aria-label="Close toolbar"
            title="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={!hasContext || !canMoveUp}
            onClick={() => onMoveVertical?.(-1)}
            aria-label={mode === "lyrics" ? "Move chord(s) to the row above" : "Move chord to the previous block"}
            title={mode === "lyrics" ? "Move to row above" : "Move to previous block"}
          >
            <ChevronUp className="h-5 w-5" />
          </Button>
          <span className="text-[10px] text-muted-foreground/70 select-none leading-tight text-center w-14">
            move chord
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={!hasContext || !canMoveDown}
            onClick={() => onMoveVertical?.(1)}
            aria-label={mode === "lyrics" ? "Move chord(s) to the row below" : "Move chord to the next block"}
            title={mode === "lyrics" ? "Move to row below" : "Move to next block"}
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
          <div className="w-px h-6 bg-border mx-0.5" />
          {mode === "progression" && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                disabled={beatDisabled}
                onClick={() => onResize?.(-0.5)}
                aria-label="Decrease beat length"
                title="-½ beat"
              >
                <Minus className="h-5 w-5" />
              </Button>
              {activeChord?.lengthBeats !== undefined && (
                <span className="px-1 text-xs font-mono-chord text-muted-foreground select-none">
                  {Number.isInteger(activeChord.lengthBeats) ? activeChord.lengthBeats : activeChord.lengthBeats.toFixed(1)}b
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                disabled={beatDisabled}
                onClick={() => onResize?.(0.5)}
                aria-label="Increase beat length"
                title="+½ beat"
              >
                <Plus className="h-5 w-5" />
              </Button>
              <div className="w-px h-6 bg-border mx-0.5" />
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={selectAllDisabled}
            onClick={onSelectAll}
            aria-label={mode === "progression" ? "Select all chords in block" : "Select all chords in line"}
            title="Select all"
          >
            <ListChecks className="h-5 w-5" />
          </Button>
          <div className="w-px h-6 bg-border mx-0.5" />
          <span className="text-xs text-muted-foreground select-none">Oct</span>
          <Select
            value={octaveDisplay === "*" ? undefined : octaveDisplay}
            disabled={octaveDisabled}
            onValueChange={(v) => onOctaveChange?.(Number(v))}
          >
            <SelectTrigger className="h-8 w-16 text-sm font-mono-chord border-0 shadow-none focus:ring-0 focus:ring-offset-0">
              <SelectValue>{octaveDisplay}</SelectValue>
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
    </div>
  );
}
