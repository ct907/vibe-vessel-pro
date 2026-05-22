import { Repeat, Volume2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseChord } from "@/lib/music/chords";
import { playNotes } from "@/lib/music/audio";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  VOICE_COLORS,
  VOICE_NAMES,
  VOICE_SYMBOLS,
  activeKeyContext,
  getCandidates,
  nashvilleNumeral,
  voiceChord,
  type Candidate,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";

interface SuggestionPaletteProps {
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  focusIdx: number;
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
  onAddCandidate,
  onAddStarter,
}: SuggestionPaletteProps) {
  if (steps.length === 0) {
    const previewQuality = (suffix: string) => {
      const chord = parseChord(keyRoot + suffix);
      if (!chord) return;
      void playNotes(voiceChord(chord), 1);
    };
    return (
      <div className="rounded-xl border border-border bg-[var(--paper-card)] p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          Pick a quality for {keyRoot}
        </h2>
        <div className="flex flex-wrap gap-2">
          {([
            { q: "maj", label: "Major", suffix: "" },
            { q: "min", label: "Minor", suffix: "m" },
            { q: "dim", label: "Dim", suffix: "dim", display: "°" },
          ] as const).map((x) => (
            <div
              key={x.q}
              className="btn-sculpt-cream flex min-w-[110px] items-center gap-1.5 rounded-lg px-2 py-2"
            >
              <button
                type="button"
                aria-label={`Preview ${keyRoot}${x.suffix}`}
                onClick={() => previewQuality(x.suffix)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-[var(--paper-shade)] hover:text-ink"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onAddStarter(keyRoot, x.q)}
                className="flex flex-1 flex-col items-center"
              >
                <span className="font-mono-chord text-lg font-bold">
                  {keyRoot}
                  {"display" in x ? x.display : x.suffix}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-ink-soft">{x.label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const focus = steps[focusIdx] ?? steps[steps.length - 1];
  const cands = getCandidates(focus.chord, focus.pitches, keyRoot, mode, {
    firstChord: { chord: steps[0].chord, pitches: steps[0].pitches },
  });
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

      <div className="flex flex-col gap-2">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const items = cands[cat];
          return (
            <div
              key={cat}
              className="flex flex-col gap-2 rounded-lg border border-border bg-[var(--paper)] p-2.5 sm:flex-row sm:items-start"
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
                    return (
                      <button
                        key={`${cat}-${ci}`}
                        type="button"
                        onClick={() => onAddCandidate(c)}
                        className={`relative flex min-w-[58px] flex-col items-center rounded-md border bg-[var(--paper-card)] px-2 py-1.5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
                          c.isDiatonic ? "border-border" : "border-dashed border-border"
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
