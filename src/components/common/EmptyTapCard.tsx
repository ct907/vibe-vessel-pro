import type { ReactNode } from "react";
import { Plus } from "lucide-react";

interface Props {
  icon: ReactNode;
  label: string;
  /** Telegraphs what tapping does, e.g. "Tap to start recording". */
  hint?: string;
  onClick: () => void;
}

export function EmptyTapCard({ icon, label, hint, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border-2 border-dashed border-border/60 bg-[var(--paper-card)]/40 flex flex-col items-center justify-center gap-3 py-14 px-4 text-muted-foreground hover:text-foreground hover:bg-[var(--paper-card)] hover:border-border transition-colors"
    >
      <span className="flex items-center gap-3">
        <Plus className="h-7 w-7" strokeWidth={1.75} />
        {icon}
      </span>
      <span className="text-base font-display font-semibold">{label}</span>
      {hint && <span className="-mt-1.5 text-xs">{hint}</span>}
    </button>
  );
}
