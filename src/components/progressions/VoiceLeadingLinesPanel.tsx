import { useEffect, useMemo, useRef, useState } from "react";
import { chordToMidi, NOTES_SHARP, type ChordSymbol } from "@/lib/music/chords";

interface Props {
  chords: ChordSymbol[];
  isVisible: boolean;
}

const VOICE_COLORS = ["#E8C547", "#9CC27A", "#7FB0D6", "#D77A6B"];
const PX_PER_SEMITONE = 4;
const PAD_TOP = 28;
const PAD_BOTTOM = 12;
const MIN_H = 120;
const MAX_H = 280;
const MARKER_R = 12;
const ANCHOR_Y = [16, 40, 64, 88];

function voicesTopDown(chord: ChordSymbol): number[] {
  const notes = chordToMidi(chord, chord.octave ?? 4);
  const uniq = Array.from(new Set(notes)).sort((a, b) => b - a);
  return uniq.slice(0, 4);
}

function noteName(midi: number): string {
  return NOTES_SHARP[((midi % 12) + 12) % 12];
}

function Marker({ x, y, voiceIdx, label }: { x: number; y: number; voiceIdx: number; label: string }) {
  const fill = VOICE_COLORS[voiceIdx];
  const stroke = "rgba(0,0,0,0.35)";
  const r = MARKER_R;
  let shape: JSX.Element;
  if (voiceIdx === 0) {
    // diamond
    shape = (
      <rect
        x={-r * 0.78}
        y={-r * 0.78}
        width={r * 1.56}
        height={r * 1.56}
        transform="rotate(45)"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  } else if (voiceIdx === 1) {
    // pentagon
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return `${Math.cos(a) * r},${Math.sin(a) * r}`;
    }).join(" ");
    shape = <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1} />;
  } else if (voiceIdx === 2) {
    // rounded square
    shape = (
      <rect
        x={-r * 0.85}
        y={-r * 0.85}
        width={r * 1.7}
        height={r * 1.7}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  } else {
    // circle
    shape = <circle r={r} fill={fill} stroke={stroke} strokeWidth={1} />;
  }
  return (
    <g transform={`translate(${x}, ${y})`}>
      {shape}
      <text
        x={0}
        y={0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight={700}
        fill="#1a1a1a"
      >
        {label}
      </text>
    </g>
  );
}

export function VoiceLeadingLinesPanel({ chords, isVisible }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => {
    if (chords.length === 0) return null;
    const voicings = chords.map(voicesTopDown);
    const first = voicings[0];
    // Per-voice y for each chord. voices may have <4 entries.
    const cols = voicings.map((v) =>
      v.map((midi, i) => {
        const anchorMidi = first[i] ?? first[first.length - 1];
        const anchorY = ANCHOR_Y[i] ?? ANCHOR_Y[ANCHOR_Y.length - 1];
        return {
          midi,
          y: anchorY - (midi - anchorMidi) * PX_PER_SEMITONE,
          label: noteName(midi),
        };
      }),
    );
    let minY = Infinity;
    let maxY = -Infinity;
    cols.forEach((col) => col.forEach((n) => {
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }));
    if (!Number.isFinite(minY)) { minY = 0; maxY = 0; }
    const rawH = (maxY - minY) + MARKER_R * 2 + PAD_TOP + PAD_BOTTOM;
    const height = Math.max(MIN_H, Math.min(MAX_H, rawH));
    // Translate so smallest y sits at PAD_TOP + MARKER_R
    const offset = PAD_TOP + MARKER_R - minY;
    // If clamped at MAX_H and content overflows, compress proportionally
    const contentSpan = (maxY - minY) + MARKER_R * 2;
    const availSpan = height - PAD_TOP - PAD_BOTTOM;
    const scale = contentSpan > availSpan ? availSpan / contentSpan : 1;
    const shiftedCols = cols.map((col) =>
      col.map((n) => ({ ...n, y: PAD_TOP + MARKER_R + (n.y - minY) * scale })),
    );
    return { cols: shiftedCols, height };
  }, [chords]);

  if (!layout) return null;
  const { cols, height } = layout;
  const n = cols.length;

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
        className="relative rounded-lg"
        style={{
          background: "var(--paper-shade-soft, var(--paper-shade))",
          boxShadow: "var(--shadow-recess)",
          height,
        }}
      >
        <div
          className="absolute top-1.5 left-0 right-0 text-center text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "var(--ink-soft)" }}
        >
          Voice Leading Lines
        </div>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${Math.max(n, 1) * 100} ${height}`}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          {/* Lines per voice */}
          {[0, 1, 2, 3].map((vi) => {
            const segs: JSX.Element[] = [];
            for (let i = 0; i < n - 1; i++) {
              const a = cols[i][vi];
              const b = cols[i + 1][vi];
              if (!a || !b) continue;
              const smooth = Math.abs(b.midi - a.midi) <= 2;
              const x1 = i * 100 + 50;
              const x2 = (i + 1) * 100 + 50;
              segs.push(
                <line
                  key={`${vi}-${i}`}
                  x1={x1}
                  y1={a.y}
                  x2={x2}
                  y2={b.y}
                  stroke={VOICE_COLORS[vi]}
                  strokeWidth={smooth ? 3 : 1.2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />,
              );
            }
            return <g key={vi}>{segs}</g>;
          })}
          {/* Markers */}
          {cols.map((col, i) =>
            col.map((n2, vi) => (
              <Marker
                key={`m-${i}-${vi}`}
                x={i * 100 + 50}
                y={n2.y}
                voiceIdx={vi}
                label={n2.label}
              />
            )),
          )}
        </svg>
      </div>
    </div>
  );
}
