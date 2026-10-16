import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Pencil, Save } from "lucide-react";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { RecentProjectsList } from "@/components/common/RecentProjectsList";
import { useIsDesktop } from "@/hooks/use-mobile";
import { useSongStore } from "@/store/song";
import { useTakesStore } from "@/store/takes";
import { useRecordingsStore } from "@/store/recordings";
import { useOnboardingStore } from "@/store/onboarding";
import { useUIStore } from "@/store/ui";
import {
  commitCurrentSongToRecents,
  currentSongHasContent,
  listRecent,
  openRecentSong,
  removeRecent,
  restoreRecent,
  songDisplayName,
  type RecentProject,
} from "@/lib/recent-projects";
import { toast as sonnerToast } from "sonner";
import { ALL_CHIP_STYLES } from "@/lib/music/chordColor";
import { useTheme } from "@/hooks/use-theme";

const TAGLINE_TEXT: CSSProperties = { color: "var(--ink)" };
const LYRICS_STYLE: CSSProperties = { background: "var(--section-tint-purple)" };
const CHORDS_STYLE: CSSProperties = {
  background:
    "linear-gradient(to right in oklch, var(--section-tint-amber), var(--section-tint-rose))",
};
const PROGRESSIONS_STYLE: CSSProperties = { background: "var(--section-tint-sky)" };

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

const BASE_CHIP_FONT_PX = 14;
const SIZE_JITTER = 0.2;

function chipCount() {
  if (typeof window === "undefined") return 160;
  const w = window.innerWidth;
  return w >= 1024 ? 160 : w >= 768 ? 80 : 40;
}

function ChipScatterBackground() {
  const { theme } = useTheme();
  const [count, setCount] = useState(chipCount);

  useEffect(() => {
    const onResize = () => setCount(chipCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: BASE_CHIP_FONT_PX * (1 + (Math.random() - 0.5) * 2 * SIZE_JITTER),
      style: ALL_CHIP_STYLES[Math.floor(Math.random() * ALL_CHIP_STYLES.length)],
    }));
  }, [count]);

  const maskStyle: CSSProperties = {
    WebkitMaskImage:
      "radial-gradient(35% 35% at 50% calc(50% - 120px), transparent 0%, transparent 70%, black 100%)",
    maskImage:
      "radial-gradient(35% 35% at 50% calc(50% - 120px), transparent 0%, transparent 70%, black 100%)",
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 w-screen h-screen overflow-hidden"
      style={{ zIndex: 0, mixBlendMode: theme === "dark" ? "soft-light" : "multiply", ...maskStyle }}
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

const DECO_CHORDS = [
  { label: "Cmaj7", x: "7%",  y: "10%", r: -12 },
  { label: "Am",    x: "81%", y: "7%",  r: 8   },
  { label: "F",     x: "14%", y: "54%", r: -6  },
  { label: "G7",    x: "87%", y: "44%", r: 14  },
  { label: "Dm7",   x: "71%", y: "77%", r: -9  },
];

export default function Landing() {
  const navigate = useNavigate();
  const resetSong = useSongStore((s) => s.resetSong);
  const isDesktop = useIsDesktop();
  const tapVerb = isDesktop ? "Click" : "Tap";
  const [recents, setRecents] = useState<RecentProject[]>([]);
  // The autosaved live song is always the freshest copy of what the writer was
  // last doing, so "Continue" opens it rather than its (possibly older) library entry.
  const [liveName] = useState(() =>
    currentSongHasContent() ? songDisplayName(useSongStore.getState().toJSON()) : null,
  );

  useEffect(() => {
    // Save the live song first so the list shows its latest name and position.
    void commitCurrentSongToRecents().then(listRecent).then(setRecents);
  }, []);

  const openRecent = (r: RecentProject) => {
    openRecentSong(r);
    navigate("/app");
  };
  const removeOne = (r: RecentProject) => {
    void removeRecent(r.id).then(listRecent).then(setRecents);
    sonnerToast(`Removed "${r.name}" from recents`, {
      action: { label: "Undo", onClick: () => { void restoreRecent(r).then(listRecent).then(setRecents); } },
    });
  };
  const startCapture = (capture: "record" | "lyrics") => {
    // The current song (with its recordings) stays in the library.
    void commitCurrentSongToRecents();
    resetSong();
    useTakesStore.getState().clear();
    useRecordingsStore.getState().clear();
    useOnboardingStore.getState().resetForNewSong();
    // Both capture intents live on the Write surface — make sure we land there
    // even if a prior session left the app in Arrange mode (WriteMode only
    // mounts in write mode, and it's what consumes the capture param).
    useUIStore.getState().setMode("write");
    navigate(`/app?capture=${capture}`);
  };
  const continueName = liveName ?? recents[0]?.name;

  return (
    <div className="fixed inset-0 z-50 bg-paper text-foreground overflow-y-auto">
      <ChipScatterBackground />
      <main className="relative mx-auto max-w-[1600px] px-4 pt-10 pb-24 flex flex-col items-center text-center">
        <h1
          role="img"
          aria-label="felt."
          className="mt-10 flex w-full max-w-[1600px] items-center justify-center mx-auto ml-5 sm:ml-2 font-normal"
        >
          <span aria-hidden className="logomark-ink" style={{ fontFamily: '"Noto Music"', fontSize: 144, lineHeight: "120px", marginTop: 12 }}>
            𝆑
          </span>
          <span aria-hidden className="logomark-ink" style={{ fontFamily: '"Noto Music"', fontSize: 96, fontStyle: "italic", lineHeight: "120px", marginLeft: -24 }}>
            elt.
          </span>
        </h1>

        <p className="mt-6 text-lg font-bold text-foreground/80">
          The Songwriter's Notebook. Use Offline. Save Locally.
        </p>

        <p className="mt-3 text-base text-foreground/70 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 whitespace-pre-wrap">
          <span>{"\n"}</span>
          <TaglineChip label="Write" style={LYRICS_STYLE} />
          <span>and Record.</span>
          <TaglineChip label="Arrange" style={CHORDS_STYLE} />
          <span>and Experiment.</span>
          
        </p>

        {continueName && (
          <button
            type="button"
            onClick={() => (liveName ? navigate("/app") : openRecent(recents[0]))}
            className="mt-8 w-full max-w-md rounded-xl bg-[var(--paper-card)] shadow-[var(--shadow-card)] px-4 py-3 flex items-center gap-3 text-left hover:brightness-95 transition-[filter]"
          >
            <Save className="h-5 w-5 shrink-0" style={{ color: "var(--ink-soft)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Continue where you left off</p>
              <h3 className="font-display text-lg truncate">{continueName}</h3>
            </div>
          </button>
        )}

        <div className="mt-12 flex w-full max-w-md flex-col items-stretch gap-4">
          <EmptyTapCard
            icon={<Mic className="h-6 w-6" strokeWidth={1.75} />}
            label={`${tapVerb} to Start Recording`}
            onClick={() => startCapture("record")}
          />
          <EmptyTapCard
            icon={<Pencil className="h-6 w-6" strokeWidth={1.75} />}
            label={`${tapVerb} to Write Lyrics`}
            onClick={() => startCapture("lyrics")}
          />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/app?tab=chords")}
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-10 px-6 text-sm font-semibold"
            >
              Explore Chords
            </button>
            <button
              type="button"
              onClick={() => navigate("/app?tab=voicekey")}
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-10 px-6 text-sm font-semibold"
            >
              Find Your Key & Range
            </button>
          </div>
        </div>

        <section className="mt-20 w-full max-w-md" aria-label="Recent projects">
          <button
            type="button"
            className="w-full text-center font-semibold mb-3 cursor-pointer"
            onClick={() => {
              const start = window.scrollY;
              const distance = 120;
              const duration = 400;
              const startTime = performance.now();
              const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
              const step = (now: number) => {
                const progress = Math.min((now - startTime) / duration, 1);
                window.scrollTo(0, start + distance * easeOut(progress));
                if (progress < 1) requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            }}
          >
            Recent Projects
          </button>
          <RecentProjectsList songs={recents} onOpen={openRecent} onRemove={removeOne} />
        </section>
      </main>
    </div>
  );
}
