import { useRef } from "react";
import { ChordSymbol } from "@/lib/music/chords";
import { playChord } from "@/lib/music/audio";
import { cn } from "@/lib/utils";

interface Props {
  chord: ChordSymbol;
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "ink" | "card" | "filled";
  className?: string;
  audition?: boolean; // play sound on click by default
}

export function ChordChip({
  chord,
  onClick,
  onLongPress,
  selected,
  size = "md",
  variant = "card",
  className,
  audition = true,
}: Props) {
  // Use refs so timer/long-press state survive re-renders. Plain `let` inside
  // the render body would reset on every render, leading to stale `longFired`
  // reads after a state-update re-render — which caused tap→toggle→re-render→
  // tap-handler-runs-again-with-stale-state bugs (chord selected then deselected
  // in a single tap).
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  // De-dupe touch + synthesized mouse events. On touch devices the browser
  // fires touchstart → touchend → mousedown → mouseup → click, which would
  // otherwise create two timers and fire onLongPress twice.
  const lastTouchAtRef = useRef(0);

  const start = (fromTouch: boolean) => {
    if (!fromTouch && Date.now() - lastTouchAtRef.current < 600) return;
    if (fromTouch) lastTouchAtRef.current = Date.now();
    longFiredRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (onLongPress) {
      pressTimerRef.current = setTimeout(() => {
        longFiredRef.current = true;
        onLongPress();
      }, 500);
    }
  };
  const cancel = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const handleClick = (_e: React.MouseEvent) => {
    if (longFiredRef.current) {
      // Reset for next interaction; swallow this click so we don't also toggle.
      longFiredRef.current = false;
      return;
    }
    // Audition runs alongside any selection toggle the parent performs via the
    // wrapper's onClick — they're independent and both fire on a single tap.
    if (audition) void playChord(chord);
    onClick?.();
  };

  const sizeCls = size === "sm" ? "px-2 py-0.5 text-xs" : size === "lg" ? "px-3 py-1.5 text-base" : "px-2.5 py-1 text-sm";
  const variantCls =
    variant === "ink"
      ? "bg-chord-chip text-chord-chip-foreground hover:bg-chord-chip/90 border border-chord-chip/60"
      : variant === "filled"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "bg-chord-chip text-chord-chip-foreground border border-chord-chip/70 hover:bg-chord-chip/90";

  return (
    <button
      type="button"
      onMouseDown={() => start(false)}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={() => start(true)}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        // Mark as long-press so the subsequent click is swallowed — prevents
        // the "select then immediately deselect" double-toggle.
        longFiredRef.current = true;
        onLongPress?.();
      }}
      className={cn(
        "inline-flex items-center rounded-md font-mono-chord font-semibold transition-colors select-none",
        sizeCls,
        variantCls,
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {chord.display}
    </button>
  );
}
