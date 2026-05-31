import type { ArrangeView } from "@/store/ui";

interface Props {
  value: ArrangeView;
  onChange: (v: ArrangeView) => void;
}

/** Recessed Track/Chords sub-toggle, shown beside the Key·Time·BPM pill. */
export function ArrangeViewToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      style={{ padding: "3px 3px 5px", background: "var(--paper-shade)", borderRadius: 9, boxShadow: "var(--shadow-recess)" }}
    >
      {(["track", "chords"] as const).map((v) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="rounded-md px-2.5 py-1 text-xs font-bold capitalize transition-all"
            style={{
              background: active ? "var(--cocoa)" : "transparent",
              color: active ? "var(--cocoa-foreground)" : "var(--ink-soft)",
              boxShadow: active ? "var(--shadow-sculpt-cocoa-rest)" : "none",
              marginTop: active ? -2 : 0,
              marginBottom: active ? 2 : 0,
            }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
