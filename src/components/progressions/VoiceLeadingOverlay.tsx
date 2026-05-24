import { useEffect, useMemo, useRef, useState } from "react";
import { chordToMidi, NOTES_SHARP, type ChordSymbol } from "@/lib/music/chords";

interface Props {
  originalChords: ChordSymbol[];
  spicedChords: ChordSymbol[];
  isVisible: boolean;
}

const VOICE_COLORS = ["#E8C547", "#9CC27A", "#7FB0D6", "#D77A6B"];
const PX_PER_SEMITONE = 4;
const PAD_TOP = 28;
const PAD_BOTTOM = 12;
const MIN_H = 120;
const MAX_H = 280;
const MARKER_R = 11;
const ANCHOR_Y = [16, 40, 64, 88];

function voicesTopDown(chord: ChordSymbol): number[] {
  const notes = chordToMidi(chord, chord.octave ?? 4);
  const uniq = Array.from(new Set(notes)).sort((a, b) => b - a);
  return uniq.slice(0, 4);
}

function noteName(midi: number): string {
  return NOTES_SHARP[((midi % 12) + 12) % 12];
}

function Marker({
  x, y, voiceIdx, label, faded,
}: { x: number; y: number; voiceIdx: number; label: string; faded?: boolean }) {
  const fill = VOICE_COLORS[voiceIdx];
  const stroke = "rgba(0,0,0,0.35)";
  const r = MARKER_R;
  let shape: JSX.Element;
  if (voiceIdx === 0) {
    shape = <rect x={-r * 0.78} y={-r * 0.78} width={r * 1.56} height={r * 1.56} transform="rotate(45)" fill={fill} stroke={stroke} strokeWidth={1} />;
  } else if (voiceIdx === 1) {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return `${Math.cos(a) * r},${Math.sin(a) * r}`;
    }).join(" ");
    shape = <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1} />;
  } else if (voiceIdx === 2) {
    shape = <rect x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} rx={3} fill={fill} stroke={stroke} strokeWidth={1} />;
  } else {
    shape = <circle r={r} fill={fill} stroke={stroke} strokeWidth={1} />;
  }
  return (
    <g transform={`translate(${x}, ${y})`} opacity={faded ? 0.35 : 1}>
      {shape}
      <text
        x={0}
        y={0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight={700}
        fill="#1a1a1a"
      >
        {label}
      </text>
    </g>
  );
}

export function VoiceLeadingOverlay({ originalChords, spicedChords, isVisible }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState<"original" | "spiced">("spiced");
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  const layout = useMemo(() => {
    if (originalChords.length === 0 && spicedChords.length === 0) return null;
    const origV = originalChords.map(voicesTopDown);
    const spiceV = spicedChords.map(voicesTopDown);
    const anchor = origV[0] ?? spiceV[0] ?? [];

    const buildCols = (voicings: number[][]) =>
      voicings.map((v) =>
        v.map((midi, i) => {
          const anchorMidi = anchor[i] ?? anchor[anchor.length - 1] ?? midi;
          const anchorY = ANCHOR_Y[i] ?? ANCHOR_Y[ANCHOR_Y.length - 1];
          return { midi, y: anchorY - (midi - anchorMidi) * PX_PER_SEMITONE, label: noteName(midi) };
        }),
      );

    const origCols = buildCols(origV);
    const spiceCols = buildCols(spiceV);

    let minY = Infinity, maxY = -Infinity;
    [...origCols, ...spiceCols].forEach((col) => col.forEach((n) => {
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }));
    if (!Number.isFinite(minY)) { minY = 0; maxY = 0; }

    const rawH = (maxY - minY) + MARKER_R * 2 + PAD_TOP + PAD_BOTTOM;
    const height = Math.max(MIN_H, Math.min(MAX_H, rawH));
    const contentSpan = (maxY - minY) + MARKER_R * 2;
    const availSpan = height - PAD_TOP - PAD_BOTTOM;
    const scale = contentSpan > availSpan ? availSpan / contentSpan : 1;
    const shift = (col: typeof origCols[number]) =>
      col.map((n) => ({ ...n, y: PAD_TOP + MARKER_R + (n.y - minY) * scale }));
    return {
      origCols: origCols.map(shift),
      spiceCols: spiceCols.map(shift),
      height,
    };
  }, [originalChords, spicedChords]);

  if (!layout) return null;
  const { origCols, spiceCols, height } = layout;
  const n = Math.max(origCols.length, spiceCols.length);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-out"
      style={{
        maxHeight: isVisible ? height + 24 : 0,
        opacity: isVisible ? 1 : 0,
        marginTop: isVisible ? 8 : 0,
      }}
      aria-hidden={!isVisible}
    >
      <div
        ref={containerRef}
        className="relative rounded-lg"
        style={{
          background: "var(--paper-shade-soft, var(--paper-shade))",
          boxShadow: "var(--shadow-recess)",
          height,
        }}
      >
        <div
          className="absolute top-1.5 left-0 right-0 text-center text-[10px] uppercase tracking-[0.18em] font-semibold pointer-events-none"
          style={{ color: "var(--ink-soft)" }}
        >
          Original → Spiced
        </div>
        <div
          className="absolute top-1.5 right-2 flex items-center gap-2 text-[9px] font-semibold pointer-events-none"
          style={{ color: "var(--ink-soft)" }}
        >
          <span className="flex items-center gap-1">
            <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
            ORIG
          </span>
          <span className="flex items-center gap-1">
            <svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="2" /></svg>
            SPICE
          </span>
        </div>
        {width > 0 && n > 0 && (() => {
          const colX = Array.from({ length: n }, (_, i) => (i + 0.5) * (width / n));
          return (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
              {/* Original lines (dashed, faded) */}
              {[0, 1, 2, 3].map((vi) => {
                const segs: JSX.Element[] = [];
                for (let i = 0; i < origCols.length - 1; i++) {
                  const a = origCols[i][vi], b = origCols[i + 1][vi];
                  if (!a || !b) continue;
                  segs.push(
                    <line
                      key={`o-${vi}-${i}`}
                      x1={colX[i]} y1={a.y} x2={colX[i + 1]} y2={b.y}
                      stroke={VOICE_COLORS[vi]} strokeWidth={1.2}
                      strokeDasharray="4 4" strokeLinecap="round" opacity={0.5}
                    />,
                  );
                }
                return <g key={`og-${vi}`}>{segs}</g>;
              })}
              {/* Spiced lines (solid, smoothness-based thickness) */}
              {[0, 1, 2, 3].map((vi) => {
                const segs: JSX.Element[] = [];
                for (let i = 0; i < spiceCols.length - 1; i++) {
                  const a = spiceCols[i][vi], b = spiceCols[i + 1][vi];
                  if (!a || !b) continue;
                  const smooth = Math.abs(b.midi - a.midi) <= 2;
                  segs.push(
                    <line
                      key={`s-${vi}-${i}`}
                      x1={colX[i]} y1={a.y} x2={colX[i + 1]} y2={b.y}
                      stroke={VOICE_COLORS[vi]} strokeWidth={smooth ? 3 : 1.2}
                      strokeLinecap="round"
                    />,
                  );
                }
                return <g key={`sg-${vi}`}>{segs}</g>;
              })}
              {/* Original markers (faded) */}
              {origCols.map((col, i) => col.map((nn, vi) => (
                <Marker key={`om-${i}-${vi}`} x={colX[i]} y={nn.y} voiceIdx={vi} label={nn.label} faded />
              )))}
              {/* Spiced markers */}
              {spiceCols.map((col, i) => col.map((nn, vi) => (
                <Marker key={`sm-${i}-${vi}`} x={colX[i]} y={nn.y} voiceIdx={vi} label={nn.label} />
              )))}
            </svg>
          );
        })()}
      </div>
    </div>
  );
}
