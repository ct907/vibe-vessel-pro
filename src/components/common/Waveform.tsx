interface Props {
  width: number;
  height: number;
  /** Deterministic seed so a given take always renders the same shape. */
  seed?: number;
  color?: string;
  opacity?: number;
  /** Playback progress 0..1 — bars up to this point render fully opaque, with a playhead line. */
  progress?: number;
  /** Stretch to 100% of the container width instead of a literal pixel width. */
  stretch?: boolean;
}

/** Lightweight placeholder waveform — deterministic bars from a seed. */
export function Waveform({ width, height, seed = 42, color = "var(--primary)", opacity = 0.7, progress, stretch }: Props) {
  const n = Math.max(1, Math.floor(width / 4));
  const bars = Array.from({ length: n }, (_, i) => {
    const bh = 3 + Math.abs(Math.sin(i * 0.7 + seed) * (height - 4));
    const x = i * 4;
    const played = progress != null && x / width <= progress;
    return (
      <rect
        key={i}
        x={x}
        y={height / 2 - bh / 2}
        width={2.4}
        height={bh}
        rx={1.2}
        fill={color}
        opacity={played ? 1 : opacity}
      />
    );
  });
  return (
    <svg
      width={stretch ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      style={{ display: "block" }}
    >
      {bars}
      {progress != null && progress > 0 && (
        <line x1={progress * width} y1={0} x2={progress * width} y2={height} stroke={color} strokeWidth={1} />
      )}
    </svg>
  );
}
