import { useMemo } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { pcToName, rootToPc } from "@/lib/music/chords";
import {
  VOICE_COLORS,
  VOICE_SHAPES,
  findVoiceLinks,
  keyUsesFlat,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";

interface VoiceLeadingChartProps {
  steps: ExplorerStep[];
  focusIdx: number;
  playIndex: number;
  voicingEditIdx: number;
  keyRoot: string;
  canEdit: boolean;
  onToggleEdit: () => void;
  onMoveVoice: (stepIdx: number, voiceIdx: number, dir: 1 | -1) => void;
}

const H = 250;
const PAD_L = 28;
const PAD_R = 28;
const PAD_T = 62;
const PAD_B = 40;
const PLOT_H = H - PAD_T - PAD_B;
const COL_NORMAL = 96;
const COL_EDIT = 168;

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
  focusIdx,
  playIndex,
  voicingEditIdx,
  keyRoot,
  canEdit,
  onToggleEdit,
  onMoveVoice,
}: VoiceLeadingChartProps) {
  const useFlat = keyUsesFlat(keyRoot);
  const editing = voicingEditIdx >= 0;

  const layout = useMemo(() => {
    const colW = steps.map((_, i) => (i === voicingEditIdx ? COL_EDIT : COL_NORMAL));
    const xs: number[] = [];
    let acc = PAD_L;
    for (let i = 0; i < steps.length; i++) {
      xs.push(acc + colW[i] / 2);
      acc += colW[i];
    }
    const contentW = acc + PAD_R;
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
    return { xs, colW, contentW, yFor };
  }, [steps, voicingEditIdx]);

  if (steps.length === 0) return null;

  const { xs, colW, contentW, yFor } = layout;
  const hiker = hikerColors(keyRoot);
  const hikerIdx = playIndex >= 0 ? playIndex : focusIdx;

  return (
    <div className="rounded-xl border border-border bg-[var(--paper-card)] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          Voice Leading
        </h2>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-3 text-[9px] uppercase tracking-wide text-ink-soft">
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
            disabled={!canEdit && !editing}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold disabled:opacity-40 ${
              editing ? "btn-sculpt-amber" : "btn-sculpt-cream"
            }`}
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Done" : "Edit Voicing"}
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${contentW} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-[250px] w-full"
        role="img"
        aria-label="Voice-leading chart of the progression"
      >
        {steps.map((_, i) => (
          <rect
            key={`band-${i}`}
            x={xs[i] - colW[i] / 2 + 4}
            y={PAD_T - 6}
            width={colW[i] - 8}
            height={PLOT_H + 12}
            rx="6"
            fill={i === voicingEditIdx ? "var(--primary-halo)" : "oklch(0 0 0 / 0.025)"}
          />
        ))}

        {/* ridge through each chord's top note */}
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

        {/* voice-leading links */}
        {steps.slice(1).map((cur, k) => {
          const i = k + 1;
          const prev = steps[i - 1];
          const links = findVoiceLinks(prev.pitches, cur.pitches);
          return links.map((lk, li) => {
            const color = VOICE_COLORS[Math.min(lk.fromVoice, 3)];
            return (
              <line
                key={`lk-${i}-${li}`}
                x1={xs[i - 1]}
                y1={yFor(prev.pitches[lk.fromVoice])}
                x2={xs[i]}
                y2={yFor(cur.pitches[lk.toVoice])}
                stroke={color}
                strokeWidth={lk.type === "direct" ? (lk.dist === 0 ? 3 : 2.2) : 1.6}
                strokeOpacity={lk.type === "direct" ? 0.7 : 0.4}
                strokeDasharray={lk.type === "octave" ? "4 3" : undefined}
              />
            );
          });
        })}

        {/* voice shapes */}
        {steps.map((step, i) => {
          const isEdit = i === voicingEditIdx;
          const sz = isEdit ? 13 : 8;
          return step.pitches.map((pitch, v) => {
            const shapeIdx = Math.min(v, 3);
            const cx = xs[i];
            const cy = yFor(pitch);
            const color = VOICE_COLORS[shapeIdx];
            const bx = cx + sz + 13;
            return (
              <g key={`sh-${i}-${v}`}>
                <polygon
                  points={shapePoints(VOICE_SHAPES[shapeIdx], cx, cy, sz)}
                  fill={color}
                  stroke="oklch(1 0 0 / 0.75)"
                  strokeWidth="0.75"
                />
                <text
                  x={cx}
                  y={cy + (VOICE_SHAPES[shapeIdx] === "triangle" ? sz * 0.22 : 0)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isEdit ? 12 : 9}
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="700"
                  fill="oklch(1 0 0)"
                  stroke="oklch(0.2 0.02 60 / 0.45)"
                  strokeWidth="0.5"
                  paintOrder="stroke"
                >
                  {pcToName(((pitch % 12) + 12) % 12, useFlat)}
                </text>
                {isEdit && (
                  <>
                    <g
                      role="button"
                      style={{ cursor: "pointer" }}
                      onClick={() => onMoveVoice(i, v, 1)}
                    >
                      <rect x={bx - 9} y={cy - 16} width="18" height="14" rx="3"
                        fill="var(--paper)" stroke="var(--border)" strokeWidth="1" />
                      <polygon points={`${bx},${cy - 12} ${bx - 4},${cy - 6} ${bx + 4},${cy - 6}`}
                        fill="var(--ink)" />
                    </g>
                    <g
                      role="button"
                      style={{ cursor: "pointer" }}
                      onClick={() => onMoveVoice(i, v, -1)}
                    >
                      <rect x={bx - 9} y={cy + 2} width="18" height="14" rx="3"
                        fill="var(--paper)" stroke="var(--border)" strokeWidth="1" />
                      <polygon points={`${bx},${cy + 12} ${bx - 4},${cy + 6} ${bx + 4},${cy + 6}`}
                        fill="var(--ink)" />
                    </g>
                  </>
                )}
              </g>
            );
          });
        })}

        {/* chord name labels */}
        {steps.map((step, i) => (
          <text
            key={`nm-${i}`}
            x={xs[i]}
            y={H - 14}
            textAnchor="middle"
            fontSize="13"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="700"
            fill={i === focusIdx ? "var(--primary-strong)" : "var(--ink-soft)"}
          >
            {step.chord.display}
          </text>
        ))}

        {/* hiker on the focused/playing chord's top note */}
        {hikerIdx >= 0 && hikerIdx < steps.length && (
          <g
            transform={`translate(${xs[hikerIdx]} ${
              yFor(Math.max(...steps[hikerIdx].pitches)) - (hikerIdx === voicingEditIdx ? 13 : 8)
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

      {editing && (
        <p className="mt-1 text-center text-[10px] italic text-ink-soft">
          Nudge each voice up or down an octave — the leading lines redraw as you go.
        </p>
      )}
    </div>
  );
}
