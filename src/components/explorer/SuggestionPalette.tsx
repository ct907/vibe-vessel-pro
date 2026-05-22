import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { playNotes } from "@/lib/music/audio";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  VOICE_COLORS,
  VOICE_NAMES,
  VOICE_SYMBOLS,
  activeKeyContext,
  diatonicChords,
  getCandidates,
  nashvilleNumeral,
  voiceChord,
  type Candidate,
  type ExplorerCategory,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";


interface SuggestionPaletteProps {
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  focusIdx: number;
  afterGate?: boolean;
  guitarMode?: boolean;
  onAddCandidate: (c: Candidate) => void;
  onAddStarter: (root: string, quality: "maj" | "min" | "dim") => void;
}

function voiceLinkBadges(c: Candidate) {
  const seen = new Set<string>();
  const out: { symbol: string; color: string; title: string }[] = [];
  for (const lk of c.voiceLinks) {
    const key = `${lk.fromVoice}-${lk.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      symbol: VOICE_SYMBOLS[Math.min(lk.fromVoice, 3)],
      color: VOICE_COLORS[Math.min(lk.fromVoice, 3)],
      title:
        `${VOICE_NAMES[Math.min(lk.fromVoice, 3)]} (${lk.fromNote}) → ` +
        `${VOICE_NAMES[Math.min(lk.toVoice, 3)]} (${lk.toNote})` +
        (lk.type === "octave" ? " · octave" : lk.dist === 0 ? " · held" : ` · ${lk.dist}st`),
    });
  }
  return out;
}

export default function SuggestionPalette({
  steps,
  keyRoot,
  mode,
  focusIdx,
  afterGate = false,
  guitarMode = false,
  onAddCandidate,
  onAddStarter,
}: SuggestionPaletteProps) {
  const [primedId, setPrimedId] = useState<string | null>(null);
  useEffect(() => {
    setPrimedId(null);
  }, [focusIdx, steps.length]);

  if (steps.length === 0) {
    const dias = diatonicChords(keyRoot, mode);
    return (
      <div className="rounded-xl border border-border bg-[var(--paper-card)] p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          Choose Your First Chord · {keyRoot} {mode === "maj" ? "Major" : "Minor"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {dias.map((d, i) => {
            const q = d.chord.quality;
            const starterQ: "maj" | "min" | "dim" =
              q === "min" ? "min" : q === "dim" ? "dim" : "maj";
            return (
              <button
                key={i}
                type="button"
                onClick={() => onAddStarter(d.chord.root, starterQ)}
                className="btn-sculpt-cream flex min-w-[64px] flex-col items-center rounded-lg px-2 py-2"
              >
                <span className="font-mono-chord text-base font-bold">{d.chord.display}</span>
                <span className="font-mono-chord text-[9px] text-ink-soft">{d.numeral}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }




  const focus = steps[focusIdx] ?? steps[steps.length - 1];
  const cands = getCandidates(focus.chord, focus.pitches, keyRoot, mode, {
    firstChord: { chord: steps[0].chord, pitches: steps[0].pitches },
    suggestLoop: steps.length >= 3,
    guitarMode,
  });
  const order: ExplorerCategory[] = afterGate
    ? ["push", "glide", "linger", "drift"]
    : CATEGORY_ORDER;
  const ctx = activeKeyContext(focus.chord, keyRoot, mode);
  const ctxChanged = ctx.keyRoot !== keyRoot || ctx.mode !== mode;

  return (
    <div className="rounded-xl border border-border bg-[var(--paper-card)] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          Choose Your Path
        </h2>
        <span className="font-mono-chord text-[10px] text-ink-soft">
          from {focus.chord.display}
          {ctxChanged && (
            <span style={{ color: "oklch(0.45 0.1 300)" }}>
              {" · key: "}
              {ctx.keyRoot} {ctx.mode === "maj" ? "Maj" : "Min"}
            </span>
          )}
        </span>
      </div>

      {afterGate && (
        <div className="mb-2 rounded-md bg-[var(--primary-halo)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
          Basecamp reached — open a fresh climb.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {order.map((cat) => {
          const meta = CATEGORY_META[cat];
          const items = cands[cat];
          const opening = afterGate && (cat === "push" || cat === "glide");
          return (
            <div
              key={cat}
              className={`flex flex-col gap-2 rounded-lg border bg-[var(--paper)] p-2.5 sm:flex-row sm:items-start ${
                opening ? "border-[var(--primary)]" : "border-border"
              }`}
            >
              <div className="w-full flex-shrink-0 sm:w-[116px]">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: meta.ink }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: meta.tint }}
                  />
                  {meta.name}
                </div>
                <div className="mt-0.5 text-[10px] italic text-ink-soft">{meta.hint}</div>
              </div>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {items.length === 0 ? (
                  <span className="py-1 text-[11px] italic text-ink-soft/70">—</span>
                ) : (
                  items.map((c, ci) => {
                    const numeral = c.numeral.startsWith("V/")
                      ? c.numeral
                      : nashvilleNumeral(c.chord, keyRoot, mode);
                    const badges = voiceLinkBadges(c);
                    const id = `${cat}-${ci}`;
                    const isPrimed = primedId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (isPrimed) {
                            setPrimedId(null);
                            onAddCandidate(c);
                          } else {
                            setPrimedId(id);
                            void playNotes(voiceChord(c.chord), 1);
                          }
                        }}
                        title={isPrimed ? "Tap again to add" : "Tap to audition"}
                        className={`relative flex min-w-[58px] flex-col items-center rounded-md border bg-[var(--paper-card)] px-2 py-1.5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
                          c.isDiatonic ? "border-border" : "border-dashed border-border"
                        } ${isPrimed ? "ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--paper)]" : ""} ${
                          c.loopSmooth && !isPrimed ? "shadow-[0_0_0_2px_var(--primary-halo)]" : ""
                        }`}
                        style={{ borderLeft: c.inKey ? `2px solid ${meta.tint}` : undefined }}
                      >
                        {c.loopSmooth && (
                          <span
                            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[var(--paper)]"
                            style={{ background: "var(--primary)" }}
                            title="Loops smoothly back to the first chord"
                          >
                            <Repeat className="h-2.5 w-2.5" />
                          </span>
                        )}
                        <span className="font-mono-chord text-sm font-bold text-ink">
                          {c.chord.display}
                        </span>
                        <span className="font-mono-chord text-[9px] text-ink-soft">{numeral}</span>
                        {c.trait && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="mt-0.5 max-w-[88px] truncate rounded px-1 text-[8px] font-semibold uppercase tracking-wide"
                                style={{ background: meta.tint, color: meta.ink }}
                              >
                                {c.trait.tag}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[200px] text-xs italic">
                              {c.trait.note}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {badges.length > 0 && (
                          <span className="mt-0.5 flex gap-0.5">
                            {badges.map((b, bi) => (
                              <span
                                key={bi}
                                className="text-[8px] leading-none"
                                style={{ color: b.color }}
                                title={b.title}
                              >
                                {b.symbol}
                              </span>
                            ))}
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
    </div>
  );
}
