import { useUIStore, type ChordInputMode } from "@/store/ui";
import { cn } from "@/lib/utils";

const TABS: { value: ChordInputMode; label: string }[] = [
  { value: "jam", label: "Jam" },
  { value: "type", label: "Type" },
];

interface Props {
  /** Intercept a switch (Jam uses this to protect an unsaved capture). Defaults to switching straight away. */
  onRequestChange?: (mode: ChordInputMode) => void;
  className?: string;
}

export function ChordInputTabs({ onRequestChange, className }: Props) {
  const mode = useUIStore((s) => s.chordInputMode);
  const setMode = useUIStore((s) => s.setChordInputMode);
  return (
    <div
      role="tablist"
      aria-label="Chord input mode"
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg p-0.5", className)}
      style={{ background: "var(--paper-shade)", boxShadow: "var(--shadow-recess)" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {TABS.map((t) => {
        const active = mode === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (active) return;
              if (onRequestChange) onRequestChange(t.value);
              else setMode(t.value);
            }}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-bold uppercase tracking-wide",
              active ? "btn-sculpt-cocoa" : "bg-transparent",
            )}
            style={active ? undefined : { color: "var(--cocoa)" }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
