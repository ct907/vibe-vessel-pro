import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { pcToName, type ChordSymbol } from "@/lib/music/chords";
import { playNotes } from "@/lib/music/audio";
import {
  bassInversions,
  lineTrajectories,
  voiceChord,
  type ExplorerStep,
  type VoicingAlternative,
} from "@/lib/music/explorerEngine";

interface VoiceTrajectorySheetProps {
  step: ExplorerStep | null;
  voiceIdx: number;
  guitarMode: boolean;
  useFlat: boolean;
  onClose: () => void;
  onCommitVoicing: (pitches: number[]) => void;
  onCommitChord: (chord: ChordSymbol) => void;
}

const INVERSION_LABELS = ["Root", "Third", "Fifth"];
const TIER_META: { key: "hold" | "stable" | "dramatic"; name: string; hint: string }[] = [
  { key: "hold", name: "Hold", hint: "this voice drones — others move" },
  { key: "stable", name: "Stable", hint: "slides a half or whole step" },
  { key: "dramatic", name: "Dramatic", hint: "breaks away in a leap" },
];

function noteChips(pitches: number[], useFlat: boolean) {
  return pitches.map((p) => pcToName(((p % 12) + 12) % 12, useFlat)).join(" ");
}

export default function VoiceTrajectorySheet({
  step,
  voiceIdx,
  guitarMode,
  useFlat,
  onClose,
  onCommitVoicing,
  onCommitChord,
}: VoiceTrajectorySheetProps) {
  const [primedKey, setPrimedKey] = useState<string | null>(null);

  useEffect(() => {
    setPrimedKey(null);
  }, [step, voiceIdx]);

  if (!step) {
    return (
      <Sheet open={false} onOpenChange={() => onClose()}>
        <SheetContent side="bottom" />
      </Sheet>
    );
  }

  const lastIdx = step.pitches.length - 1;
  const isBass = voiceIdx === 0;
  const header =
    voiceIdx === 0
      ? "Edit Bass Line"
      : voiceIdx === lastIdx
        ? "Edit Melody Line"
        : "Edit Inner Voices";

  const guard = (key: string, pitches: number[], commit: () => void) => {
    if (primedKey === key) {
      commit();
    } else {
      setPrimedKey(key);
      void playNotes(pitches, 1);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{header}</SheetTitle>
          <SheetDescription>
            {step.chord.display} · tap to audition, tap again to commit
          </SheetDescription>
        </SheetHeader>

        {isBass ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {bassInversions(step.chord).map((chord, i) => {
              const pitches = voiceChord(chord);
              const key = `inv-${i}`;
              const primed = primedKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => guard(key, pitches, () => onCommitChord(chord))}
                  className={`flex min-w-[96px] flex-col items-center rounded-lg border bg-[var(--paper-card)] px-3 py-2 transition-all ${
                    primed
                      ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
                      : "border-border"
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">
                    {INVERSION_LABELS[i]} in bass
                  </span>
                  <span className="font-mono-chord text-lg font-bold text-ink">
                    {chord.display}
                  </span>
                  <span className="font-mono-chord text-[10px] text-ink-soft">
                    {noteChips(pitches, useFlat)}
                  </span>
                  {primed && (
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--primary-strong)]">
                      Tap again
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          (() => {
            const tiers = lineTrajectories(step, voiceIdx, guitarMode);
            return (
              <div className="mt-3 flex flex-col gap-2.5">
                {TIER_META.map((tier) => {
                  const items: VoicingAlternative[] = tiers[tier.key];
                  return (
                    <div key={tier.key}>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-ink">
                        {tier.name}
                        <span className="ml-1.5 font-normal italic text-ink-soft">
                          {tier.hint}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {items.length === 0 ? (
                          <span className="text-[11px] italic text-ink-soft/70">
                            no option here
                          </span>
                        ) : (
                          items.map((alt, i) => {
                            const key = `${tier.key}-${i}`;
                            const primed = primedKey === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  guard(key, alt.pitches, () => onCommitVoicing(alt.pitches))
                                }
                                className={`flex flex-col items-start rounded-md border bg-[var(--paper-card)] px-2.5 py-1.5 transition-all ${
                                  primed
                                    ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
                                    : "border-border"
                                }`}
                              >
                                <span className="font-mono-chord text-xs font-bold text-ink">
                                  {alt.label}
                                </span>
                                <span className="font-mono-chord text-[10px] text-ink-soft">
                                  {noteChips(alt.pitches, useFlat)}
                                </span>
                                {primed && (
                                  <span className="text-[8px] font-bold uppercase tracking-wide text-[var(--primary-strong)]">
                                    Tap again
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </SheetContent>
    </Sheet>
  );
}
