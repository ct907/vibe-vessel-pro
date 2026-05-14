import { type MaskStyle } from "@/store/appBackground";
import { cn } from "@/lib/utils";

const OPTIONS: { value: MaskStyle; label: string }[] = [
  { value: "none",   label: "None"       },
  { value: "top",    label: "Top Mask"   },
  { value: "bottom", label: "Bottom Mask"},
];

interface Props {
  value: MaskStyle;
  onChange: (m: MaskStyle) => void;
}

export function MaskToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md overflow-hidden border border-[var(--border)]">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2.5 h-7 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-[var(--background)] text-[var(--ink-soft)] hover:bg-[var(--accent)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
