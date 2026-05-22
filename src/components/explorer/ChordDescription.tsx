import {
  CATEGORY_META,
  keyChangeLabel,
  nashvilleNumeral,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";

interface ChordDescriptionProps {
  step: ExplorerStep | null;
  keyRoot: string;
  mode: ExplorerMode;
}

export default function ChordDescription({ step, keyRoot, mode }: ChordDescriptionProps) {
  if (!step) {
    return (
      <div className="rounded-lg bg-[var(--paper-shade)] px-3 py-2 text-center text-[11px] italic text-ink-soft">
        Scroll through the chords to read each one's harmonic role.
      </div>
    );
  }

  const cat = step.category;
  const meta = cat === "starter" || cat === "typed" ? null : CATEGORY_META[cat];
  const numeral = nashvilleNumeral(step.chord, keyRoot, mode);
  const keyTag = keyChangeLabel(step.chord, keyRoot, mode);
  const fnName = meta ? meta.name : cat === "starter" ? "Starter" : "Typed";
  const note =
    step.trait?.note ??
    (cat === "starter"
      ? "The opening chord — the ground this journey departs from."
      : "A chord added by hand.");

  return (
    <div className="rounded-lg bg-[var(--paper-shade)] px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono-chord text-lg font-bold leading-none text-ink">
          {step.chord.display}
        </span>
        <span className="font-mono-chord text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {numeral}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: meta ? meta.ink : undefined }}
        >
          {fnName}
        </span>
        {keyTag && (
          <span
            className="rounded bg-[var(--section-tint-violet)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: "oklch(0.42 0.1 300)" }}
          >
            {keyTag}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs italic leading-snug text-ink-soft">{note}</p>
    </div>
  );
}
