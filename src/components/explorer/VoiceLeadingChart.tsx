import { useEffect, useMemo, useRef } from "react";
import { GripHorizontal, Pencil, X } from "lucide-react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { pcToName, rootToPc, type Quality } from "@/lib/music/chords";
import {
  CATEGORY_META,
  VOICE_COLORS,
  VOICE_SHAPES,
  extensionOptions,
  findVoiceLinks,
  keyChangeLabel,
  keyUsesFlat,
  nashvilleNumeral,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";
import ChordInput from "./ChordInput";
import ChordDescription from "./ChordDescription";

interface VoiceLeadingChartProps {
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  focusIdx: number;
  playIndex: number;
  canEdit: boolean;
  onToggleEdit: () => void;
  onFocus: (idx: number) => void;
  onScrollFocus: (idx: number) => void;
  onRemove: (idx: number) => void;
  onSetExtension: (idx: number, quality: Quality) => void;
  onAddTyped: (input: string) => boolean;
}

const H = 210;
const PAD_L = 24;
const PAD_R = 24;
const PAD_T = 56;
const PAD_B = 14;
const PLOT_H = H - PAD_T - PAD_B;
const COL = 100;

function shapePoints(shape: string, cx: number, cy: number, sz: number): string {
  switch (shape) {
    case "triangle":
      return `${cx},${cy - sz} ${cx - sz * 0.866},${cy + sz * 0.5} ${cx + sz * 0.866},${cy + sz * 0.5}`;
    case "square": {
      const s = sz * 0.82;
      return `${cx - s},${cy - s} ${cx + s},${cy - s} ${cx + s},${cy + s} ${cx - s},${cy + s}`;
    }
    case "pentagon": {
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        pts.push(`${cx + sz * Math.cos(a)},${cy + sz * Math.sin(a)}`);
      }
      return pts.join(" ");
    }
    case "diamond":
      return `${cx},${cy - sz} ${cx + sz * 0.82},${cy} ${cx},${cy + sz} ${cx - sz * 0.82},${cy}`;
    default:
      return "";
  }
}

function hikerColors(keyRoot: string) {
  const hue = (rootToPc(keyRoot) * 30) % 360;
  return {
    coat: `oklch(0.6 0.16 ${hue})`,
    coatDark: `oklch(0.42 0.13 ${hue})`,
    pack: `oklch(0.5 0.14 ${(hue + 45) % 360})`,
  };
}

export default function VoiceLeadingChart({
  steps,
  keyRoot,
  mode,
  focusIdx,
  playIndex,
  canEdit,
  onToggleEdit,
  onFocus,
  onScrollFocus,
  onRemove,
  onSetExtension,
  onAddTyped,
}: VoiceLeadingChartProps) {
  const useFlat = keyUsesFlat(keyRoot);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef<(HTMLElement | null)[]>([]);

  const layout = useMemo(() => {
    const xs: number[] = [];
    let acc = PAD_L;
    for (let i = 0; i < steps.length; i++) {
      xs.push(acc + COL / 2);
      acc += COL;
    }
    const contentW = acc + PAD_R;
    const footerW = contentW + COL;
    let minP = Infinity;
    let maxP = -Infinity;
    for (const s of steps) {
      for (const p of s.pitches) {
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
    }
    minP -= 3;
    maxP += 3;
    const range = maxP - minP || 1;
    const yFor = (p: number) => PAD_T + PLOT_H - ((p - minP) / range) * PLOT_H;
    return { xs, contentW, footerW, yFor };
  }, [steps]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const idx = colRefs.current.indexOf(e.target as HTMLElement);
          if (idx >= 0) onScrollFocus(idx);
        }
      },
      { root, rootMargin: "0px -45% 0px -45%", threshold: 0 },
    );
    colRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [steps, onScrollFocus]);

  if (steps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-[var(--paper-card)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            Voice Leading
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] italic text-ink-soft">
          <span>Type a chord or pick one below to begin.</span>
        </div>
        <div className="mt-2 max-w-[160px]">
          <ChordInput onAdd={onAddTyped} />
        </div>
      </div>
    );
  }


  const { xs, contentW, footerW, yFor } = layout;
  const hiker = hikerColors(keyRoot);
  const hikerIdx = playIndex >= 0 ? playIndex : focusIdx;

  return (
    <div className="rounded-xl border border-border bg-[var(--paper-card)] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          Voice Leading
        </h2>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-3 text-[9px] uppercase tracking-wide text-ink-soft sm:flex">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0 w-4 border-t-2 border-ink-soft" /> direct
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-ink-soft" /> octave
            </span>
          </span>
          <button
            type="button"
            onClick={onToggleEdit}
            disabled={!canEdit}
            className="btn-sculpt-cream inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold disabled:opacity-40"
          >
            <Pencil className="h-3 w-3" />
            Edit Voicing
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="snap-x snap-proximity overflow-x-auto scroll-px-6">
        <div className="mx-auto" style={{ width: footerW }}>
          <svg
            width={contentW}
            height={H}
            viewBox={`0 0 ${contentW} ${H}`}
            className="block"
            role="img"
            aria-label="Voice-leading chart of the progression"
          >
            {steps.map((_, i) => (
              <rect
                key={`band-${i}`}
                x={xs[i] - COL / 2 + 4}
                y={PAD_T - 6}
                width={COL - 8}
                height={PLOT_H + 12}
                rx="6"
                fill="oklch(0 0 0 / 0.025)"
              />
            ))}

            {steps.length > 1 && (
              <polyline
                points={steps.map((s, i) => `${xs[i]},${yFor(Math.max(...s.pitches))}`).join(" ")}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.55"
              />
            )}

            {steps.slice(1).map((cur, k) => {
              const i = k + 1;
              const prev = steps[i - 1];
              const links = findVoiceLinks(prev.pitches, cur.pitches);
              return links.map((lk, li) => (
                <line
                  key={`lk-${i}-${li}`}
                  x1={xs[i - 1]}
                  y1={yFor(prev.pitches[lk.fromVoice])}
                  x2={xs[i]}
                  y2={yFor(cur.pitches[lk.toVoice])}
                  stroke={VOICE_COLORS[Math.min(lk.fromVoice, 3)]}
                  strokeWidth={lk.type === "direct" ? (lk.dist === 0 ? 3 : 2.2) : 1.6}
                  strokeOpacity={lk.type === "direct" ? 0.7 : 0.4}
                  strokeDasharray={lk.type === "octave" ? "4 3" : undefined}
                />
              ));
            })}

            {steps.map((step, i) =>
              step.pitches.map((pitch, v) => {
                const shapeIdx = Math.min(v, 3);
                const cx = xs[i];
                const cy = yFor(pitch);
                return (
                  <g key={`sh-${i}-${v}`}>
                    <polygon
                      points={shapePoints(VOICE_SHAPES[shapeIdx], cx, cy, 8)}
                      fill={VOICE_COLORS[shapeIdx]}
                      stroke="oklch(1 0 0 / 0.75)"
                      strokeWidth="0.75"
                    />
                    <text
                      x={cx}
                      y={cy + (VOICE_SHAPES[shapeIdx] === "triangle" ? 8 * 0.22 : 0)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={9}
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight="700"
                      fill="oklch(1 0 0)"
                      stroke="oklch(0.2 0.02 60 / 0.45)"
                      strokeWidth="0.5"
                      paintOrder="stroke"
                    >
                      {pcToName(((pitch % 12) + 12) % 12, useFlat)}
                    </text>
                  </g>
                );
              }),
            )}

            {hikerIdx >= 0 && hikerIdx < steps.length && (
              <g
                transform={`translate(${xs[hikerIdx]} ${
                  yFor(Math.max(...steps[hikerIdx].pitches)) - 8
                }) scale(0.62)`}
              >
                <ellipse cx="0" cy="2" rx="15" ry="4.5" fill="oklch(0.3 0.02 60 / 0.2)" />
                <line x1="12" y1="-1" x2="19" y2="-44" stroke="oklch(0.42 0.05 60)" strokeWidth="3" strokeLinecap="round" />
                <line x1="-5" y1="-2" x2="-5" y2="-21" stroke={hiker.coatDark} strokeWidth="5" strokeLinecap="round" />
                <line x1="5" y1="-2" x2="5" y2="-21" stroke={hiker.coatDark} strokeWidth="5" strokeLinecap="round" />
                <rect x="-13" y="-44" width="13" height="20" rx="4" fill={hiker.pack} />
                <path d="M -9 -21 Q -10 -43 0 -43 Q 10 -43 9 -21 Z" fill={hiker.coat} />
                <circle cx="0" cy="-49" r="6.5" fill="oklch(0.82 0.05 60)" />
                <path d="M -9 -53 Q 0 -62 9 -53 Z" fill={hiker.coatDark} />
                <ellipse cx="0" cy="-53" rx="11" ry="2.6" fill={hiker.coatDark} />
              </g>
            )}
          </svg>

          <Droppable droppableId="explorer-footer" direction="horizontal">
            {(dropProvided) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className="flex"
                style={{ paddingLeft: PAD_L, paddingRight: PAD_R }}
              >
                {steps.map((step, i) => {
                  const cat = step.category;
                  const meta = cat === "starter" || cat === "typed" ? null : CATEGORY_META[cat];
                  const numeral = nashvilleNumeral(step.chord, keyRoot, mode);
                  const keyTag = keyChangeLabel(step.chord, keyRoot, mode);
                  const exts = extensionOptions(step.chord.quality);
                  const focused = i === focusIdx;
                  const playing = i === playIndex;
                  return (
                    <Draggable key={step.id} draggableId={step.id} index={i}>
                      {(dragProvided) => (
                        <div
                          ref={(el) => {
                            dragProvided.innerRef(el);
                            colRefs.current[i] = el;
                          }}
                          {...dragProvided.draggableProps}
                          style={{ width: COL, ...dragProvided.draggableProps.style }}
                          className="shrink-0 snap-center px-0.5"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onFocus(i)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onFocus(i);
                              }
                            }}
                            className={`group relative w-full cursor-pointer rounded-lg border bg-[var(--paper)] px-1.5 pb-2 pt-1 text-center transition-colors ${
                              focused
                                ? "border-[var(--primary)] shadow-[var(--shadow-card)]"
                                : "border-border"
                            } ${playing ? "ring-2 ring-[var(--primary-halo)]" : ""}`}
                            style={{ borderBottom: meta ? `3px solid ${meta.tint}` : undefined }}
                          >
                            <div
                              {...dragProvided.dragHandleProps}
                              aria-label="Reorder chord"
                              className="mx-auto flex h-3.5 w-full cursor-grab items-center justify-center text-ink-soft/40 active:cursor-grabbing"
                            >
                              <GripHorizontal className="h-3 w-3" />
                            </div>
                            <button
                              type="button"
                              aria-label="Remove chord"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemove(i);
                              }}
                              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-ink text-[var(--paper)] group-hover:flex group-focus-within:flex"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                            <div className="font-mono-chord text-base font-bold leading-tight text-ink">
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
                                onChange={(e) => onSetExtension(i, e.target.value as Quality)}
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
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {dropProvided.placeholder}
                <div style={{ width: COL }} className="shrink-0 px-0.5">
                  <ChordInput onAdd={onAddTyped} />
                </div>
              </div>
            )}
          </Droppable>
        </div>
      </div>

      <div className="mt-2">
        <ChordDescription step={steps[focusIdx] ?? null} keyRoot={keyRoot} mode={mode} />
      </div>
    </div>
  );
}
