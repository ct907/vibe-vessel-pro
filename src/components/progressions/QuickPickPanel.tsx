import { useEffect, useMemo, useState } from "react";
import { Play, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ChordSymbol } from "@/lib/music/chords";
import { FEELS, bestFeelFor, suggestFor, type Feel } from "@/lib/music/voicingFeel";

interface Props {
  isOpen: boolean;
  chord: ChordSymbol;
  prev: ChordSymbol | null;
  next: ChordSymbol | null;
  onPreviewChord: (chord: ChordSymbol | null) => void;
  onAudition: (chord: ChordSymbol) => void;
  onApply: (chord: ChordSymbol) => void;
  onClose: () => void;
}

export function QuickPickPanel({
  isOpen,
  chord,
  prev,
  next,
  onPreviewChord,
  onAudition,
  onApply,
  onClose,
}: Props) {
  const chordKey = chord.display;
  const [feel, setFeel] = useState<Feel>(() => bestFeelFor(chord, prev, next));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const options = useMemo(() => suggestFor(chord, prev, next, feel), [chord, prev, next, feel]);

  // Reset feel + selection whenever a different chord is tapped.
  useEffect(() => {
    setFeel(bestFeelFor(chord, prev, next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordKey]);

  // When the option list changes, prefer the option matching the current
  // voicing, otherwise the top suggestion; preview it live in the diagram.
  useEffect(() => {
    if (options.length === 0) return;
    const match = options.find((o) => o.chord.display === chord.display);
    const chosen = match ?? options[0];
    setSelectedId(chosen.id);
    onPreviewChord(chosen.chord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Clear the live preview when the panel closes.
  useEffect(() => {
    if (!isOpen) onPreviewChord(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selected = options.find((o) => o.id === selectedId) ?? options[0] ?? null;
  const selectedFeel = FEELS.find((f) => f.id === feel)!;

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-out"
      style={{ maxHeight: isOpen ? 420 : 0, opacity: isOpen ? 1 : 0, marginTop: isOpen ? 8 : 0 }}
      aria-hidden={!isOpen}
    >
      <div
        className="rounded-lg p-3"
        style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-recess)" }}
      >
        <div
          className="text-center text-[10px] uppercase tracking-[0.18em] font-semibold font-display mb-2"
          style={{ color: "var(--ink-soft)" }}
        >
          Voice Leading Feel
        </div>

        {/* Emotion pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FEELS.map((f) => {
            const active = f.id === feel;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFeel(f.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
                  active ? "btn-sculpt-amber" : "btn-sculpt-cream",
                )}
              >
                <span aria-hidden>{f.emoji}</span>
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-center text-[11px] italic" style={{ color: "var(--ink-soft)" }}>
          {selectedFeel.blurb}
        </p>

        {/* Suggested voicings */}
        <RadioGroup
          className="mt-2"
          value={selectedId ?? undefined}
          onValueChange={(v) => {
            setSelectedId(v);
            const opt = options.find((o) => o.id === v);
            if (opt) onPreviewChord(opt.chord);
          }}
        >
          {options.map((o) => (
            <label
              key={o.id}
              htmlFor={`vp-${o.id}`}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 cursor-pointer transition-colors",
                o.id === selectedId ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <RadioGroupItem id={`vp-${o.id}`} value={o.id} />
              <span className="font-mono-chord text-sm" style={{ color: "var(--ink)" }}>
                {o.chord.display}
              </span>
              <span className="ml-auto text-[11px]" style={{ color: "var(--ink-soft)" }}>
                {o.label}
              </span>
            </label>
          ))}
        </RadioGroup>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onAudition(selected.chord)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold btn-sculpt-cream disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) onApply(selected.chord);
              onClose();
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold btn-sculpt-amber disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
