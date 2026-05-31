import { LayoutList, Music } from "lucide-react";
import type { ArrangeView } from "@/store/ui";

interface Props {
  value: ArrangeView;
  onChange: (v: ArrangeView) => void;
}

const VIEW_META: Record<ArrangeView, { label: string; Icon: React.ElementType }> = {
  track: { label: "Track", Icon: LayoutList },
  chords: { label: "Chords", Icon: Music },
};

/** Recessed Track/Chords sub-toggle, shown beside the Key·Time·BPM pill. */
export function ArrangeViewToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      style={{ padding: "3px 3px 5px", background: "var(--paper-shade)", borderRadius: 9, boxShadow: "var(--shadow-recess)" }}
    >
      {(["track", "chords"] as const).map((v) => {
        const active = value === v;
        const { label, Icon } = VIEW_META[v];
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all"
            style={{
              background: active ? "var(--cocoa)" : "transparent",
              color: active ? "var(--cocoa-foreground)" : "var(--ink-soft)",
              boxShadow: active ? "var(--shadow-sculpt-cocoa-rest)" : "none",
              marginTop: active ? -2 : 0,
              marginBottom: active ? 2 : 0,
            }}
          >
            <Icon
              className="h-3 w-3"
              style={{ color: active ? "var(--cocoa-foreground)" : "var(--cocoa-soft)" }}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
