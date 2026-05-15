import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSongStore } from "@/store/song";
import { listRecent, removeRecent, type RecentProject } from "@/lib/recent-projects";
import { ALL_CHIP_STYLES } from "@/lib/music/chordColor";

const TAGLINE_TEXT: CSSProperties = { color: "oklch(0.25 0.02 260)" };
const LYRICS_STYLE: CSSProperties = { background: "oklch(0.8460 0.0483 311.68)" };
const CHORDS_STYLE: CSSProperties = {
  background:
    "linear-gradient(to right in oklch, oklch(0.9272 0.0651 83.56), oklch(0.8689 0.0539 11.07))",
};
const PROGRESSIONS_STYLE: CSSProperties = { background: "oklch(0.9265 0.0286 238.25)" };

function TaglineChip({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <span
      className="noise-texture-chip inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold"
      style={{ ...style, ...TAGLINE_TEXT }}
    >
      {label}
    </span>
  );
}

const SCATTER_ROWS = 8;
const SCATTER_COLS = 15;
const POSITION_JITTER = 0.8;
const BASE_CHIP_FONT_PX = 14;
const SIZE_JITTER = 0.2;

function ChipScatterBackground() {
  const particles = useMemo(() => {
    const cellW = 100 / SCATTER_COLS;
    const cellH = 100 / SCATTER_ROWS;
    const out: Array<{
      id: number;
      top: number;
      left: number;
      size: number;
      style: CSSProperties;
    }> = [];
    for (let r = 0; r < SCATTER_ROWS; r++) {
      for (let c = 0; c < SCATTER_COLS; c++) {
        const centerX = c * cellW + cellW / 2;
        const centerY = r * cellH + cellH / 2;
        const jitterX = (Math.random() - 0.5) * cellW * POSITION_JITTER;
        const jitterY = (Math.random() - 0.5) * cellH * POSITION_JITTER;
        const sizeFactor = 1 + (Math.random() - 0.5) * 2 * SIZE_JITTER;
        out.push({
          id: r * SCATTER_COLS + c,
          top: centerY + jitterY,
          left: centerX + jitterX,
          size: BASE_CHIP_FONT_PX * sizeFactor,
          style: ALL_CHIP_STYLES[Math.floor(Math.random() * ALL_CHIP_STYLES.length)],
        });
      }
    }
    return out;
  }, []);

  const maskStyle: CSSProperties = {
    WebkitMaskImage:
      "radial-gradient(35% 35% at 50% 50%, transparent 0%, transparent 70%, black 100%)",
    maskImage:
      "radial-gradient(35% 35% at 50% 50%, transparent 0%, transparent 70%, black 100%)",
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 w-screen h-screen overflow-hidden"
      style={{ zIndex: 0, ...maskStyle }}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="noise-texture-chip inline-flex items-center rounded-md font-mono-chord font-semibold"
          style={{
            position: "absolute",
            top: `${p.top}%`,
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            padding: "0.2em 0.5em",
            transform: "translate(-50%, -50%)",
            opacity: 0.4,
            ...p.style,
          }}
        >
          <span style={{ visibility: "hidden" }}>Am7</span>
        </span>
      ))}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const loadFromJSON = useSongStore((s) => s.loadFromJSON);
  const resetSong = useSongStore((s) => s.resetSong);
  const [recents, setRecents] = useState<RecentProject[]>([]);

  useEffect(() => {
    setRecents(listRecent());
  }, []);

  const openRecent = (r: RecentProject) => {
    loadFromJSON(r.snapshot);
    navigate("/app");
  };
  const removeOne = (id: string) => {
    removeRecent(id);
    setRecents(listRecent());
  };
  const startWriting = () => {
    if (recents.length === 0) {
      resetSong();
      navigate("/app");
    } else {
      openRecent(recents[0]);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-foreground relative overflow-hidden">
      <ChipScatterBackground />
      <main className="relative mx-auto max-w-[1600px] px-4 pt-10 pb-24 flex flex-col items-center text-center">
        <Link
          to="/app"
          aria-label="Open editor"
          className="btn-sculpt-amber inline-flex items-center justify-center rounded-full h-6 w-6"
        >
          <Play className="h-2.5 w-2.5 fill-current" />
        </Link>

        <div className="mt-24 flex w-full max-w-[1600px] items-center justify-center mx-auto">
          <span
            style={{
              color: "rgb(47, 39, 30)",
              fontFamily: '"Noto Music"',
              fontSize: 144,
              lineHeight: "120px",
              marginTop: 12,
            }}
          >
            𝆑
          </span>
          <span
            style={{
              color: "#2F271E",
              fontFamily: '"Noto Music"',
              fontSize: 96,
              fontStyle: "italic",
              lineHeight: "120px",
              marginLeft: -24,
            }}
          >
            elt.
          </span>
        </div>

        <p className="mt-6 text-xl font-bold text-foreground/80">
          The songwriter's notebook. Free to use. Use offline.
        </p>

        <p className="mt-3 text-lg text-foreground/70 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
          <span>Write</span>
          <TaglineChip label="Lyrics." style={LYRICS_STYLE} />
          <span>Find</span>
          <TaglineChip label="Chords." style={CHORDS_STYLE} />
          <span>Play</span>
          <TaglineChip label="Progressions." style={PROGRESSIONS_STYLE} />
        </p>

        <button
          type="button"
          onClick={startWriting}
          className="btn-sculpt-amber mt-12 inline-flex items-center justify-center rounded-lg h-10 px-6 text-sm font-semibold"
        >
          Start Writing
        </button>

        <section className="mt-32 w-full max-w-md" aria-label="Recent projects">
          <h2 className="text-center font-semibold mb-3">Recent Projects</h2>
          <div className="rounded-xl bg-[var(--paper-card)] shadow-[var(--shadow-card)] divide-y divide-border/50">
            {recents.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">
                No recent projects yet.
              </p>
            ) : (
              recents.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => openRecent(r)}
                  >
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.savedAt).toLocaleString()}
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`More actions for ${r.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => removeOne(r.id)}>
                        Remove from recents
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
