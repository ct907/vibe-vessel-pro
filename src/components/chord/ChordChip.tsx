import { useEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ChordSymbol, transposeChord } from "@/lib/music/chords";
import { getChordColorClasses, getChordStrokeColor } from "@/lib/music/chordColor";
import { holdChord, playChord } from "@/lib/music/audio";
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
  /** When true (default), pressing-and-holding sustains the chord until release. */
  sustainOnHold?: boolean;
  /** Octave for audition (overrides default 4). */
  octave?: number;
  /** When non-zero, transpose display + audition by N semitones and show a direction arrow. */
  keyChangeOffset?: number;
}

export function ChordChip({
  chord: rawChord,
  onClick,
  onLongPress,
  selected,
  size = "md",
  variant = "card",
  className,
  audition = true,
  sustainOnHold = true,
  octave = 4,
  keyChangeOffset = 0,
}: Props) {
  const chord = useMemo(
    () => (keyChangeOffset ? transposeChord(rawChord, keyChangeOffset) : rawChord),
    [rawChord, keyChangeOffset],
  );
  // Use refs so timer/long-press state survive re-renders.
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const lastTouchAtRef = useRef(0);
  // Sustain bookkeeping
  const releaseRef = useRef<null | (() => void)>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  // True after either: (a) long-press fired, or (b) sustain has been engaged.
  // Used to swallow the trailing click event so it doesn't toggle selection.
  const swallowClickRef = useRef(false);

  // Threshold before we engage sustain — short enough to feel responsive on
  // touch, long enough that a quick tap still routes to onClick/audition.
  const SUSTAIN_DELAY_MS = 140;
  const LONG_PRESS_MS = 500;

  const releaseHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (releaseRef.current) {
      try {
        releaseRef.current();
      } catch {
        /* noop */
      }
      releaseRef.current = null;
    }
    heldRef.current = false;
  };

  // Cleanup on unmount so we never leak a sustained voice.
  useEffect(() => () => releaseHold(), []);

  const start = (fromTouch: boolean) => {
    if (!fromTouch && Date.now() - lastTouchAtRef.current < 600) return;
    if (fromTouch) lastTouchAtRef.current = Date.now();
    longFiredRef.current = false;
    swallowClickRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);

    if (sustainOnHold && audition) {
      // Engage sustained voice after a small delay so a fast tap still uses
      // triggerAttackRelease (so ADSR's release shapes the tail naturally).
      holdTimerRef.current = setTimeout(() => {
        heldRef.current = true;
        swallowClickRef.current = true;
        void holdChord(chord, octave).then((rel) => {
          if (heldRef.current) releaseRef.current = rel;
          else {
            try {
              rel();
            } catch {
              /* noop */
            }
          }
        });
      }, SUSTAIN_DELAY_MS);
    }

    if (onLongPress) {
      pressTimerRef.current = setTimeout(() => {
        longFiredRef.current = true;
        swallowClickRef.current = true;
        // Releasing a sustained voice before firing the long-press feels right
        // (the user clearly wanted to "select" rather than "hold").
        releaseHold();
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const cancel = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    releaseHold();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swallowClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      swallowClickRef.current = false;
      longFiredRef.current = false;
      return;
    }
    if (audition) void playChord(chord, undefined, octave);
    onClick?.();
  };

  const sizeCls =
    size === "sm" ? "px-1 py-1 text-xs" : size === "lg" ? "px-1 py-1 text-base" : "px-1 py-1 text-sm";
  // Chord-tinted backgrounds for ink/card variants come from inline style
  // (oklch + oklch-interpolated gradients). The "filled" variant remains a
  // generic primary fill for non-chord uses (e.g. basket controls).
  const colors = getChordColorClasses(chord);
  const strokeColor = getChordStrokeColor(chord);
  const isFilled = variant === "filled";
  const variantCls = isFilled
    ? "bg-primary/50 text-primary-foreground hover:bg-primary/60"
    : colors.className;

  const chipStyle: React.CSSProperties = isFilled
    ? {}
    : {
        ...colors.style,
        border: selected ? `2px solid ${strokeColor}` : "2px solid transparent",
        transition: "border-color 120ms ease",
      };

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
        swallowClickRef.current = true;
        longFiredRef.current = true;
        releaseHold();
        onLongPress?.();
      }}
      style={chipStyle}
      className={cn(
        "relative noise-texture-chip inline-flex items-center rounded-md font-mono-chord font-semibold select-none",
        sizeCls,
        variantCls,
        selected && "scale-[1.04]",
        className,
      )}
    >
      {chord.display}
      {keyChangeOffset !== 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 -left-1 z-10 inline-flex items-center justify-center rounded-full bg-[var(--paper)] shadow-sm"
          style={{ width: 12, height: 12 }}
        >
          {keyChangeOffset > 0 ? (
            <ArrowUp className="h-2.5 w-2.5" strokeWidth={3} style={{ color: "var(--primary-strong)" }} />
          ) : (
            <ArrowDown className="h-2.5 w-2.5" strokeWidth={3} style={{ color: "var(--primary-strong)" }} />
          )}
        </span>
      )}
    </button>
  );
}
