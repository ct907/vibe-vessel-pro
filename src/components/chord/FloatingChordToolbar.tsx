import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUIStore } from "@/store/ui";
import { useIsDesktop } from "@/hooks/use-mobile";
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
  Copy,
  Trash2,
  X,
} from "lucide-react";

type Mode = "progression" | "lyrics";

export interface FloatingChordToolbarProps {
  mode: Mode;
  /** When true, the Pencil FAB trigger button is hidden (sticky bar provides it). */
  hideTrigger?: boolean;
  /** On mobile, auto-expand the menu whenever a chord is active/selected.
   *  Progressions opts out: tapping a chord shows a pencil overlay that opens
   *  the menu explicitly instead. Defaults to true. */
  autoExpandOnContext?: boolean;
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
  /** Duplicate the active chord / current selection in place. */
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExitEdit: () => void;
}

const ANIM_STYLE: React.CSSProperties = {
  transitionProperty: "transform, opacity",
  transitionDuration: "400ms",
  transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
};

/** Desktop toolbar control: icon + text label in a single horizontal row. */
function LabeledBtn({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("h-9 px-2.5 gap-1.5 shrink-0", className)}
    >
      {icon}
      <span className="text-sm whitespace-nowrap">{label}</span>
    </Button>
  );
}

/** A single d-pad direction button. */
function DPadButton({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("h-8 w-8 rounded-md", className)}
    >
      {icon}
    </Button>
  );
}

/** Game-controller d-pad clustering the four move directions:
 *  ←/→ shift the chord earlier/later (hopping into the adjacent block at the
 *  edge), ↑/↓ move it to the previous/next block (Arrange) or the row
 *  above/below (Write). */
function MoveDPad({
  mode,
  onShift,
  onMoveVertical,
  canShiftLeft,
  canShiftRight,
  canMoveUp,
  canMoveDown,
  disabled,
}: {
  mode: Mode;
  onShift: (direction: -1 | 1) => void;
  onMoveVertical?: (direction: -1 | 1) => void;
  canShiftLeft: boolean;
  canShiftRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
}) {
  const upLabel = mode === "lyrics" ? "Move to row above" : "Move to previous block";
  const downLabel = mode === "lyrics" ? "Move to row below" : "Move to next block";
  const cell = "flex items-center justify-center";
  return (
    <div
      role="group"
      aria-label="Move chord"
      className="grid shrink-0 rounded-xl bg-muted/50 p-0.5"
      style={{ gridTemplateColumns: "repeat(3, 2rem)", gridTemplateRows: "repeat(3, 2rem)" }}
    >
      <span />
      <div className={cell}>
        <DPadButton
          icon={<ChevronUp className="h-5 w-5" />}
          label={upLabel}
          disabled={disabled || !canMoveUp}
          onClick={() => onMoveVertical?.(-1)}
        />
      </div>
      <span />
      <div className={cell}>
        <DPadButton
          icon={<ChevronLeft className="h-5 w-5" />}
          label="Move earlier"
          disabled={disabled || !canShiftLeft}
          onClick={() => onShift(-1)}
        />
      </div>
      <span className="flex items-center justify-center text-[8px] uppercase tracking-wide text-muted-foreground/70 select-none">
        move
      </span>
      <div className={cell}>
        <DPadButton
          icon={<ChevronRight className="h-5 w-5" />}
          label="Move later"
          disabled={disabled || !canShiftRight}
          onClick={() => onShift(1)}
        />
      </div>
      <span />
      <div className={cell}>
        <DPadButton
          icon={<ChevronDown className="h-5 w-5" />}
          label={downLabel}
          disabled={disabled || !canMoveDown}
          onClick={() => onMoveVertical?.(1)}
        />
      </div>
      <span />
    </div>
  );
}

export function FloatingChordToolbar({
  mode,
  hideTrigger = false,
  autoExpandOnContext = true,
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
  onDuplicate,
  onDelete,
  onExitEdit,
}: FloatingChordToolbarProps) {
  const isDesktop = useIsDesktop();
  const focusedEditorOpen = useUIStore((s) => s.focusedEditorOpen);
  const setToolbarExpanded = useUIStore((s) => s.setToolbarExpanded);
  const multiSelectMode = useUIStore((s) => s.multiSelectMode);
  const setMultiSelectMode = useUIStore((s) => s.setMultiSelectMode);
  const chordToolbarOpen = useUIStore((s) => s.chordToolbarOpen);
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
  const [expanded, setExpanded] = useState(false);
  const visible = !focusedEditorOpen;
  const hasSelection = selectedCount > 0;
  const hasContext = !!activeChord || hasSelection;
  // On mobile the menu follows the selection: tapping a chord (which sets an
  // active chord) opens it and clearing the selection closes it, so a tap
  // toggles the menu. Desktop keeps the explicit open/close via the trigger
  // button and the chordToolbarOpen signal.
  const effectiveExpanded =
    visible && (expanded || (autoExpandOnContext && !isDesktop && hasContext));

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

  const middleLabel = hasSelection
    ? `${selectedCount} selected`
    : multiSelectMode
      ? "Tap chords to select"
      : activeChord
        ? activeChord.display
        : "Tap a chord to edit";
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

  const lenBadge =
    mode === "progression" && activeChord?.lengthBeats !== undefined ? (
      <span className="px-1 text-xs font-mono-chord text-muted-foreground select-none">
        {Number.isInteger(activeChord.lengthBeats) ? activeChord.lengthBeats : activeChord.lengthBeats.toFixed(1)}b
      </span>
    ) : null;
  const divider = <div className="w-px h-6 bg-border mx-0.5" />;
  const octaveSelect = (
    <div className="flex items-center gap-1 shrink-0">
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
  );

  // Desktop: a single horizontal row of labeled controls, centered above the
  // sticky bar — the mobile version stacks icon-only controls in the corner.
  if (isDesktop) {
    return (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[55] pointer-events-none">
        <div
          role="toolbar"
          aria-label="Chord editing toolbar"
          style={ANIM_STYLE}
          className={cn(
            "pointer-events-auto origin-bottom rounded-2xl border bg-popover shadow-lg px-3 py-2",
            "flex flex-row items-center gap-1 max-w-[calc(100vw-2rem)] overflow-x-auto",
            expanded ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none",
          )}
        >
          <MoveDPad
            mode={mode}
            onShift={onShift}
            onMoveVertical={onMoveVertical}
            canShiftLeft={canShiftLeft}
            canShiftRight={canShiftRight}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            disabled={!hasContext}
          />
          {divider}
          <span
            className={cn(
              "px-2 text-sm select-none truncate max-w-[8rem] shrink-0",
              hasContext ? "font-mono-chord text-foreground" : "text-muted-foreground",
            )}
          >
            {middleLabel}
          </span>
          {divider}
          {mode === "progression" && (
            <>
              <LabeledBtn
                icon={<Minus className="h-5 w-5" />}
                label="Shorter"
                disabled={beatDisabled}
                onClick={() => onResize?.(-0.5)}
              />
              {lenBadge}
              <LabeledBtn
                icon={<Plus className="h-5 w-5" />}
                label="Longer"
                disabled={beatDisabled}
                onClick={() => onResize?.(0.5)}
              />
              {divider}
            </>
          )}
          <LabeledBtn
            icon={<ListChecks className="h-5 w-5" />}
            label="All"
            disabled={selectAllDisabled}
            onClick={onSelectAll}
          />
          <LabeledBtn
            icon={<CheckSquare className="h-5 w-5" />}
            label={multiSelectMode ? "Exit" : "Multi"}
            onClick={toggleMode}
            className={cn(
              multiSelectMode &&
                "bg-[var(--ink-soft)] text-[var(--paper-card)] hover:bg-[var(--ink-soft)] hover:text-[var(--paper-card)]",
            )}
          />
          {divider}
          {octaveSelect}
          {divider}
          <LabeledBtn
            icon={<Copy className="h-5 w-5" />}
            label="Duplicate"
            disabled={!hasContext}
            onClick={hasContext ? onDuplicate : undefined}
          />
          <LabeledBtn
            icon={<Trash2 className="h-5 w-5" />}
            label="Delete"
            disabled={!hasContext}
            onClick={hasContext ? onDelete : undefined}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-60"
          />
          <LabeledBtn icon={<X className="h-5 w-5" />} label="Close" onClick={close} />
        </div>
      </div>
    );
  }

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
          "rounded-2xl border bg-[var(--paper-card)] shadow-lg overflow-hidden",
          "w-[22rem] max-w-[calc(100vw-2rem)]",
          expanded ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none",
        )}
      >
        {/* Header: chord name / status + close */}
        <div className="flex items-center gap-1 border-b px-3 py-1.5">
          <span
            className={cn(
              "flex-1 text-center text-base font-mono-chord font-semibold select-none truncate",
              hasContext ? "text-foreground" : "capitalize text-[var(--ink-soft)]",
            )}
          >
            {middleLabel}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={close}
            aria-label="Close toolbar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body grid: a Move cross on the left, the Select / Length / Octave
            rows stacked in the middle, and a full-height Delete on the right —
            each region separated by hairline dividers. */}
        <div className="flex items-stretch">
          {/* Move cross — chevrons around a bold "Move" label. */}
          <div
            role="group"
            aria-label="Move chord"
            className="grid shrink-0 place-items-center border-r px-1 py-2"
            style={{ gridTemplateColumns: "auto auto auto", gridTemplateRows: "auto auto auto" }}
          >
            <span />
            <DPadButton
              icon={<ChevronUp className="h-6 w-6" />}
              label={mode === "lyrics" ? "Move to row above" : "Move to previous block"}
              disabled={!hasContext || !canMoveUp}
              onClick={() => onMoveVertical?.(-1)}
            />
            <span />
            <DPadButton
              icon={<ChevronLeft className="h-6 w-6" />}
              label="Move earlier"
              disabled={!hasContext || !canShiftLeft}
              onClick={() => onShift(-1)}
            />
            <span className="px-1 text-base font-semibold text-foreground select-none">Move</span>
            <DPadButton
              icon={<ChevronRight className="h-6 w-6" />}
              label="Move later"
              disabled={!hasContext || !canShiftRight}
              onClick={() => onShift(1)}
            />
            <span />
            <DPadButton
              icon={<ChevronDown className="h-6 w-6" />}
              label={mode === "lyrics" ? "Move to row below" : "Move to next block"}
              disabled={!hasContext || !canMoveDown}
              onClick={() => onMoveVertical?.(1)}
            />
            <span />
          </div>

          {/* Middle: stacked control rows. */}
          <div className="flex min-w-0 flex-1 flex-col divide-y">
            {/* Select: multi-select · select-all · duplicate */}
            <div className="flex items-center gap-1 px-3 py-2">
              <span className="mr-auto text-sm font-mono-chord text-[var(--ink-soft)] select-none">
                Select
              </span>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-8 w-8",
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
                variant="ghost"
                className="h-8 w-8"
                disabled={selectAllDisabled}
                onClick={onSelectAll}
                aria-label={mode === "progression" ? "Select all chords in block" : "Select all chords in line"}
                title="Select all"
              >
                <ListChecks className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={!hasContext}
                onClick={onDuplicate}
                aria-label="Duplicate selected chord(s)"
                title="Duplicate"
              >
                <Copy className="h-5 w-5" />
              </Button>
            </div>

            {/* Length (progression only): −½ · beats · +½ */}
            {mode === "progression" && (
              <div className="flex items-center gap-1 px-3 py-2">
                <span className="mr-auto text-sm font-mono-chord text-[var(--ink-soft)] select-none">
                  Length
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={beatDisabled}
                  onClick={() => onResize?.(-0.5)}
                  aria-label="Decrease beat length"
                  title="-½ beat"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="w-9 text-center text-sm font-mono-chord text-muted-foreground select-none">
                  {activeChord?.lengthBeats !== undefined
                    ? `${Number.isInteger(activeChord.lengthBeats) ? activeChord.lengthBeats : activeChord.lengthBeats.toFixed(1)}b`
                    : "—"}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={beatDisabled}
                  onClick={() => onResize?.(0.5)}
                  aria-label="Increase beat length"
                  title="+½ beat"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Chord Octave */}
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="mr-auto text-sm font-mono-chord text-[var(--ink-soft)] select-none">
                Chord Octave
              </span>
              <Select
                value={octaveDisplay === "*" ? undefined : octaveDisplay}
                disabled={octaveDisabled}
                onValueChange={(v) => onOctaveChange?.(Number(v))}
              >
                <SelectTrigger className="h-8 w-16 rounded-lg border-0 bg-[var(--paper-shade)] text-sm font-mono-chord shadow-none focus:ring-0 focus:ring-offset-0">
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

          {/* Delete — full-height, right column. */}
          <div className="flex items-center justify-center border-l px-2">
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10",
                !hasContext && "opacity-50 cursor-not-allowed",
              )}
              aria-disabled={!hasContext}
              onClick={hasContext ? onDelete : undefined}
              aria-label="Delete selected chord(s)"
              title="Delete"
            >
              <Trash2 className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
