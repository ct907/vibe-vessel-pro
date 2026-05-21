import { Info, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChordSymbol } from "@/lib/music/chords";
import {
  explorerChordsByGroup,
  FUNCTION_LABEL,
  MOOD_TAGS,
  isExtendedQuality,
  type HarmonyFunction,
} from "@/lib/music/explorerHarmony";

interface FunctionChordGridProps {
  keyRoot: string;
  onAdd: (numeral: string, chord: ChordSymbol) => void;
  onUndo: () => void;
  canUndo: boolean;
}

const GROUP_TINT: Record<HarmonyFunction, string> = {
  tonic: "oklch(0.9 0.07 145)",
  subdominant: "oklch(0.92 0.08 85)",
  dominant: "oklch(0.89 0.09 30)",
  color: "oklch(0.89 0.07 285)",
};

export default function FunctionChordGrid({
  keyRoot,
  onAdd,
  onUndo,
  canUndo,
}: FunctionChordGridProps) {
  const groups = explorerChordsByGroup(keyRoot);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ group, chords }) => (
        <div key={group}>
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
            {FUNCTION_LABEL[group]}
          </h3>
          <div className="flex flex-wrap gap-2">
            {chords.map(({ numeral, chord }) => (
              <Tooltip key={numeral}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onAdd(numeral, chord)}
                    className="group flex min-w-[78px] flex-col items-center gap-0.5 rounded-lg px-3 py-2 shadow-[var(--shadow-card)] transition-transform active:scale-95"
                    style={{ background: GROUP_TINT[group] }}
                  >
                    <span className="flex items-center gap-1">
                      <span className="font-mono-chord text-base font-bold text-ink">
                        {chord.display}
                      </span>
                      <Info className="h-3 w-3 text-ink-soft opacity-60" />
                    </span>
                    <span className="text-[11px] font-semibold text-ink-soft">
                      {numeral}
                      {isExtendedQuality(chord.quality) ? " ◆" : ""}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-semibold">{numeral}</span> — {MOOD_TAGS[numeral]}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="btn-sculpt-cream mt-1 inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg px-4 text-sm font-semibold disabled:opacity-40"
      >
        <Undo2 className="h-4 w-4" />
        Step Back
      </button>
    </div>
  );
}
