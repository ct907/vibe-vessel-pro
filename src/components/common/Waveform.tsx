interface Props {
  width: number;
  height: number;
  /** Deterministic seed so a given take always renders the same shape. */
  seed?: number;
  color?: string;
  opacity?: number;
}

/** Lightweight placeholder waveform — deterministic bars from a seed. */
export function Waveform({ width, height, seed = 42, color = "var(--primary)", opacity = 0.7 }: Props) {
  const n = Math.max(1, Math.floor(width / 4));
  const bars = Array.from({ length: n }, (_, i) => {
    const bh = 3 + Math.abs(Math.sin(i * 0.7 + seed) * (height - 4));
    return (
      <rect
        key={i}
        x={i * 4}
        y={height / 2 - bh / 2}
        width={2.4}
        height={bh}
        rx={1.2}
        fill={color}
        opacity={opacity}
      />
    );
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {bars}
    </svg>
  );
}
