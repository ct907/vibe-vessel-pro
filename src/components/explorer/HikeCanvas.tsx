import { useMemo } from "react";
import { rootToPc, type ChordSymbol } from "@/lib/music/chords";
import { elevationOf, isExtendedQuality, FUNCTION_GROUP } from "@/lib/music/explorerHarmony";

export interface HikeNode {
  id: string;
  numeral: string;
  chord: ChordSymbol;
}

interface HikeCanvasProps {
  nodes: HikeNode[];
  activeIndex: number;
  keyRoot: string;
}

const PAD_X = 74;
const STEP_X = 102;
const VBH = 360;
const HORIZON_Y = 210;
const ELEV_PX = 48;
const NODE_R = 17;

const FUNCTION_FILL: Record<string, string> = {
  tonic: "oklch(0.74 0.13 145)",
  subdominant: "oklch(0.79 0.14 80)",
  dominant: "oklch(0.66 0.18 28)",
  color: "oklch(0.62 0.15 285)",
};

function hikerColors(keyRoot: string) {
  const hue = (rootToPc(keyRoot) * 30) % 360;
  return {
    coat: `oklch(0.6 0.16 ${hue})`,
    coatDark: `oklch(0.42 0.13 ${hue})`,
    pack: `oklch(0.5 0.14 ${(hue + 45) % 360})`,
  };
}

const nodeX = (i: number) => PAD_X + i * STEP_X;
const nodeY = (numeral: string) => HORIZON_Y - elevationOf(numeral) * ELEV_PX;

export default function HikeCanvas({ nodes, activeIndex, keyRoot }: HikeCanvasProps) {
  const vbw = useMemo(
    () => PAD_X * 2 + Math.max(2, nodes.length - 1) * STEP_X,
    [nodes.length],
  );

  const points = useMemo(
    () => nodes.map((n, i) => ({ x: nodeX(i), y: nodeY(n.numeral) })),
    [nodes],
  );

  const trailPath = points.map((p) => `${p.x},${p.y}`).join(" ");
  const terrainPath =
    points.length > 0
      ? `0,${VBH} 0,${points[0].y} ${trailPath} ${vbw},${points[points.length - 1].y} ${vbw},${VBH}`
      : "";

  const hiker = hikerColors(keyRoot);
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${vbw} ${VBH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label="Chord progression rendered as a mountain hiking trail"
    >
      <defs>
        <linearGradient id="hike-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.95 0.04 95)" />
          <stop offset="55%" stopColor="oklch(0.91 0.07 72)" />
          <stop offset="100%" stopColor="oklch(0.85 0.08 52)" />
        </linearGradient>
        <linearGradient id="hike-terrain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.06 120 / 0.55)" />
          <stop offset="100%" stopColor="oklch(0.62 0.05 130 / 0.15)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={vbw} height={VBH} fill="url(#hike-sky)" />

      {[2, 1, 0, -1, -2].map((elev) => {
        const y = HORIZON_Y - elev * ELEV_PX;
        const horizon = elev === 0;
        return (
          <line
            key={elev}
            x1="0"
            x2={vbw}
            y1={y}
            y2={y}
            stroke={horizon ? "oklch(0.5 0.09 55)" : "oklch(0.55 0.03 70 / 0.35)"}
            strokeWidth={horizon ? 2.5 : 1}
            strokeDasharray={horizon ? undefined : "3 7"}
          />
        );
      })}

      {points.length > 0 && (
        <>
          <polygon points={terrainPath} fill="url(#hike-terrain)" />
          <polyline
            points={trailPath}
            fill="none"
            stroke="oklch(0.42 0.05 60)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1 9"
          />
        </>
      )}

      {nodes.map((n, i) => {
        const p = points[i];
        const fill = FUNCTION_FILL[FUNCTION_GROUP[n.numeral]] ?? FUNCTION_FILL.tonic;
        const extended = isExtendedQuality(n.chord.quality);
        const active = i === activeIndex;
        return (
          <g key={n.id}>
            {active && (
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE_R + 11}
                fill="oklch(0.662 0.1545 54.2 / 0.45)"
              >
                <animate
                  attributeName="r"
                  values={`${NODE_R + 4};${NODE_R + 14};${NODE_R + 4}`}
                  dur="0.9s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {extended ? (
              <rect
                x={p.x - NODE_R}
                y={p.y - NODE_R}
                width={NODE_R * 2}
                height={NODE_R * 2}
                rx="4"
                fill={fill}
                stroke="oklch(0.98 0.01 90)"
                strokeWidth="2.5"
                transform={`rotate(45 ${p.x} ${p.y})`}
              />
            ) : (
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE_R}
                fill={fill}
                stroke="oklch(0.98 0.01 90)"
                strokeWidth="2.5"
              />
            )}
            <text
              x={p.x}
              y={p.y + 4.5}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="oklch(0.99 0.01 90)"
            >
              {n.numeral}
            </text>
            <text
              x={p.x}
              y={p.y - NODE_R - 12}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fontFamily="'JetBrains Mono', monospace"
              fill="oklch(0.27 0.03 60)"
            >
              {n.chord.display}
            </text>
          </g>
        );
      })}

      {last && (
        <g transform={`translate(${last.x}, ${last.y - NODE_R})`}>
          <ellipse cx="0" cy="2" rx="15" ry="4.5" fill="oklch(0.3 0.02 60 / 0.2)" />
          <line
            x1="12"
            y1="-1"
            x2="19"
            y2="-44"
            stroke="oklch(0.42 0.05 60)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line x1="-5" y1="-2" x2="-5" y2="-21" stroke={hiker.coatDark} strokeWidth="5" strokeLinecap="round" />
          <line x1="5" y1="-2" x2="5" y2="-21" stroke={hiker.coatDark} strokeWidth="5" strokeLinecap="round" />
          <rect x="-13" y="-44" width="13" height="20" rx="4" fill={hiker.pack} />
          <path d="M -9 -21 Q -10 -43 0 -43 Q 10 -43 9 -21 Z" fill={hiker.coat} />
          <circle cx="0" cy="-49" r="6.5" fill="oklch(0.82 0.05 60)" />
          <path d="M -9 -53 Q 0 -62 9 -53 Z" fill={hiker.coatDark} />
          <ellipse cx="0" cy="-53" rx="11" ry="2.6" fill={hiker.coatDark} />
        </g>
      )}

      {activeIndex >= 0 && activeIndex < points.length && (
        <g
          style={{
            transform: `translateX(${points[activeIndex].x}px)`,
            transition: "transform 0.18s linear",
          }}
        >
          <line
            x1="0"
            x2="0"
            y1="14"
            y2={VBH - 14}
            stroke="oklch(0.662 0.1545 54.2)"
            strokeWidth="2.5"
            strokeDasharray="5 5"
          />
          <circle cx="0" cy={HORIZON_Y} r="5" fill="oklch(0.662 0.1545 54.2)" />
        </g>
      )}

      {nodes.length === 0 && (
        <text
          x={vbw / 2}
          y={HORIZON_Y - 40}
          textAnchor="middle"
          fontSize="17"
          fontStyle="italic"
          fill="oklch(0.46 0.024 70)"
        >
          Pick a chord below to set out on the hike.
        </text>
      )}
    </svg>
  );
}
