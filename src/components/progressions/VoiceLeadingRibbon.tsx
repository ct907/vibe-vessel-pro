import { useMemo, useState } from "react";
import { chordToMidi, type ChordSymbol } from "@/lib/music/chords";

interface Props {
  originalChords: ChordSymbol[];
  spicedChords: ChordSymbol[] | null;
  isVisible: boolean;
}

interface VoicePoint {
  top: number;
  bass: number;
}

function voicesFor(chords: ChordSymbol[]): VoicePoint[] {
  return chords.map((c) => {
    const notes = chordToMidi(c, 4);
    return { top: Math.max(...notes), bass: Math.min(...notes) };
  });
}

const HEIGHT = 80;
const PAD_Y = 10;

export function VoiceLeadingRibbon({ originalChords, spicedChords, isVisible }: Props) {
  const [mode, setMode] = useState<"original" | "spiced">("spiced");

  const original = useMemo(() => voicesFor(originalChords), [originalChords]);
  const spiced = useMemo(() => (spicedChords ? voicesFor(spicedChords) : null), [spicedChords]);

  const points = mode === "spiced" && spiced ? spiced : original;
  const cols = Math.max(points.length, 2);

  const { topY, bassY } = useMemo(() => {
    const allNotes = [
      ...original.flatMap((p) => [p.top, p.bass]),
      ...(spiced ? spiced.flatMap((p) => [p.top, p.bass]) : []),
    ];
    const minN = Math.min(...allNotes);
    const maxN = Math.max(...allNotes);
    const range = Math.max(maxN - minN, 1);
    const yFor = (note: number) => HEIGHT - PAD_Y - ((note - minN) / range) * (HEIGHT - PAD_Y * 2);
    return {
      topY: (p: VoicePoint) => yFor(p.top),
      bassY: (p: VoicePoint) => yFor(p.bass),
    };
  }, [original, spiced]);

  const xFor = (i: number, width: number) => {
    if (cols === 1) return width / 2;
    return (i / (cols - 1)) * width;
  };

  const showBadges = mode === "spiced" && spiced;

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-out"
      style={{
        maxHeight: isVisible ? HEIGHT + 20 : 0,
        opacity: isVisible ? 1 : 0,
        marginTop: isVisible ? 8 : 0,
      }}
      aria-hidden={!isVisible}
    >
      <div
        className="relative rounded-lg p-2"
        style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-recess)" }}
      >
        <div className="absolute top-1 right-1 inline-flex rounded-md overflow-hidden text-[10px] font-semibold uppercase tracking-wider z-10">
          <button
            type="button"
            onClick={() => setMode("original")}
            className="px-2 py-0.5 transition-colors"
            style={{
              background: mode === "original" ? "var(--paper-shade)" : "transparent",
              color: mode === "original" ? "var(--ink)" : "var(--ink-soft)",
            }}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => setMode("spiced")}
            disabled={!spiced}
            className="px-2 py-0.5 transition-colors disabled:opacity-40"
            style={{
              background: mode === "spiced" ? "var(--paper-shade)" : "transparent",
              color: mode === "spiced" ? "var(--ink)" : "var(--ink-soft)",
            }}
          >
            Spiced
          </button>
        </div>
        <svg width="100%" height={HEIGHT} viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="var(--ink-soft)"
            strokeOpacity={0.6}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
            points={points.map((p, i) => `${xFor(i, 100)},${bassY(p)}`).join(" ")}
          />
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            points={points.map((p, i) => `${xFor(i, 100)},${topY(p)}`).join(" ")}
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={xFor(i, 100)} cy={topY(p)} r={2.5} fill="var(--primary)" />
              <circle cx={xFor(i, 100)} cy={bassY(p)} r={2.5} fill="var(--ink-soft)" fillOpacity={0.6} />
            </g>
          ))}
          {showBadges && spiced && spiced.slice(1).map((p, i) => {
            const prev = spiced[i];
            const dTop = Math.abs(p.top - prev.top);
            const dBass = Math.abs(p.bass - prev.bass);
            const maxMove = Math.max(dTop, dBass);
            if (maxMove <= 2) return null;
            const xMid = (xFor(i, 100) + xFor(i + 1, 100)) / 2;
            return (
              <text
                key={`badge-${i}`}
                x={xMid}
                y={HEIGHT - 2}
                fontSize={7}
                textAnchor="middle"
                fill="var(--primary-strong)"
                fontWeight={700}
              >
                {maxMove}st
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
