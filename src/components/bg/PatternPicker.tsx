import { type BackgroundPattern, getPatternStyle } from "@/store/appBackground";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const PATTERNS: BackgroundPattern[] = ["none", "wavy", "checkerboard", "dot", "lined", "quarters"];

interface Props {
  value: BackgroundPattern;
  onChange: (p: BackgroundPattern) => void;
}

export function PatternPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {PATTERNS.map((p) => (
        <button
          key={p}
          type="button"
          aria-label={p === "none" ? "No pattern" : p}
          onClick={() => onChange(p)}
          className={cn(
            "h-7 w-7 rounded border-2 overflow-hidden flex items-center justify-center shrink-0 transition-colors",
            value === p
              ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
              : "border-[var(--border)] hover:border-[var(--primary-soft)]",
          )}
          style={
            p === "none"
              ? { background: "var(--paper)" }
              : { ...getPatternStyle(p), backgroundColor: "var(--paper)", opacity: 1 }
          }
        >
          {p === "none" && <X className="h-3.5 w-3.5 text-[var(--ink-soft)]" />}
        </button>
      ))}
    </div>
  );
}
