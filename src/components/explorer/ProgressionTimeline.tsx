import { useState } from "react";
import { X } from "lucide-react";
import type { Quality } from "@/lib/music/chords";
import {
  CATEGORY_META,
  extensionOptions,
  keyChangeLabel,
  nashvilleNumeral,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";

interface ProgressionTimelineProps {
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  focusIdx: number;
  playIndex: number;
  onFocus: (idx: number) => void;
  onRemove: (idx: number) => void;
  onSetExtension: (idx: number, quality: Quality) => void;
  onAddTyped: (input: string) => boolean;
}

export default function ProgressionTimeline({
  steps,
  keyRoot,
  mode,
  focusIdx,
  playIndex,
  onFocus,
  onRemove,
  onSetExtension,
  onAddTyped,
}: ProgressionTimelineProps) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submitDraft = () => {
    if (!draft.trim()) return;
    if (onAddTyped(draft)) {
      setDraft("");
      setInvalid(false);
    } else {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 700);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-[var(--paper-card)] p-3">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
        Your Progression
      </h2>
      <div className="flex flex-wrap items-start gap-2">
        {steps.map((step, idx) => {
          const cat = step.category;
          const meta = cat === "starter" || cat === "typed" ? null : CATEGORY_META[cat];
          const numeral = nashvilleNumeral(step.chord, keyRoot, mode);
          const keyTag = keyChangeLabel(step.chord, keyRoot, mode);
          const exts = extensionOptions(step.chord.quality);
          const focused = idx === focusIdx;
          const playing = idx === playIndex;
          return (
            <div
              key={step.id}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(idx)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFocus(idx);
                }
              }}
              className={`group relative w-[96px] cursor-pointer rounded-lg border bg-[var(--paper)] px-2 pb-2 pt-2.5 text-center transition-all ${
                focused
                  ? "border-[var(--primary)] shadow-[var(--shadow-card)] -translate-y-0.5"
                  : "border-border hover:-translate-y-0.5"
              } ${playing ? "ring-2 ring-[var(--primary-halo)]" : ""}`}
              style={{ borderBottom: meta ? `3px solid ${meta.tint}` : undefined }}
            >
              <button
                type="button"
                aria-label="Remove chord"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(idx);
                }}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-ink text-[var(--paper)] group-hover:flex group-focus-within:flex"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <div className="font-mono-chord text-lg font-bold leading-tight text-ink">
                {step.chord.display}
              </div>
              <div className="mt-0.5 font-mono-chord text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                {numeral}
              </div>
              {meta && (
                <div
                  className="mt-0.5 text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: meta.ink }}
                >
                  {meta.name.split(" ")[0]}
                </div>
              )}
              {step.trait && (
                <div className="mt-0.5 truncate text-[8px] uppercase tracking-wide text-ink-soft/80">
                  {step.trait}
                </div>
              )}
              {keyTag && (
                <div
                  className="mt-1 inline-block rounded bg-[var(--section-tint-violet)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide"
                  style={{ color: "oklch(0.42 0.1 300)" }}
                >
                  {keyTag}
                </div>
              )}
              {exts.length > 1 && (
                <select
                  value={step.chord.quality}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onSetExtension(idx, e.target.value as Quality)}
                  className="mt-1.5 w-full rounded border border-border bg-[var(--paper-shade)] py-0.5 text-center font-mono-chord text-[10px] text-ink-soft"
                >
                  {exts.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
        <div className="w-[96px]">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitDraft();
            }}
            placeholder="Type chord…"
            className={`h-[58px] w-full rounded-lg border border-dashed bg-transparent px-2 text-center font-mono-chord text-sm text-ink outline-none transition-colors focus:border-solid focus:bg-[var(--paper)] ${
              invalid ? "border-[var(--destructive)]" : "border-border focus:border-[var(--primary)]"
            }`}
          />
          <div className="mt-1 text-center text-[8px] uppercase tracking-wide text-ink-soft">
            e.g. Dm7, G, C#m
          </div>
        </div>
      </div>
    </div>
  );
}
