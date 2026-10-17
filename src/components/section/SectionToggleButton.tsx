import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An on/off pill in a section header (Chords, Notes). The dot marks a section with something behind the toggle. */
export function SectionToggleButton({
  icon,
  label,
  pressed,
  hasContent,
  onClick,
  disabled,
  title,
}: {
  icon: ReactNode;
  label: string;
  pressed: boolean;
  hasContent?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        pressed ? "bg-[var(--cocoa)] text-[var(--cocoa-foreground)]" : "bg-black/10 hover:bg-black/15",
      )}
    >
      {icon}
      {label}
      {hasContent && <span aria-hidden className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />}
    </button>
  );
}
