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
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longFired = false;

  const start = () => {
    longFired = false;
    if (onLongPress) {
      pressTimer = setTimeout(() => {
        longFired = true;
        onLongPress();
      }, 500);
    }
  };
  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };
  const handleClick = (e: React.MouseEvent) => {
    if (longFired) return;
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
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(); }}
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
