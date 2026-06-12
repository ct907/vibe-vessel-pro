import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical, Mic, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyTapCard } from "@/components/common/EmptyTapCard";
import { useIsDesktop } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSongStore, commitCurrentSongToRecents, downloadProjectZip } from "@/store/song";
import { useTakesStore } from "@/store/takes";
import { useRecordingsStore } from "@/store/recordings";
import { useOnboardingStore } from "@/store/onboarding";
import { useUIStore } from "@/store/ui";
import { listRecent, removeRecent, type RecentProject } from "@/lib/recent-projects";
import { ALL_CHIP_STYLES } from "@/lib/music/chordColor";
import { useTheme } from "@/hooks/use-theme";

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
  const loadFromJSON = useSongStore((s) => s.loadFromJSON);
  const resetSong = useSongStore((s) => s.resetSong);
  const isDesktop = useIsDesktop();
  const tapVerb = isDesktop ? "Click" : "Tap";
  const [recents, setRecents] = useState<RecentProject[]>([]);
  // Holds the navigation to run after the user resolves the "you have unsaved
  // recordings" prompt. Recents/new songs start without audio, so leaving the
  // current session would otherwise discard its recordings silently.
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  useEffect(() => {
    setRecents(listRecent());
  }, []);

  const hasUnsavedRecordings = () => {
    const takes = useTakesStore.getState().takes.length;
    const clips = useRecordingsStore.getState().tracks.reduce((n, t) => n + t.clips.length, 0);
    return takes + clips > 0;
  };
  const guardRecordings = (proceed: () => void) => {
    if (hasUnsavedRecordings()) setPendingNav(() => proceed);
    else proceed();
  };

  const openRecent = (r: RecentProject) => {
    guardRecordings(() => {
      commitCurrentSongToRecents();
      loadFromJSON(r.snapshot);
      // Recents snapshots don't carry recordings — start the opened song clean
      // rather than inheriting the previous session's takes.
      useTakesStore.getState().clear();
      useRecordingsStore.getState().clear();
      navigate("/app");
    });
  };
  const removeOne = (id: string) => {
    removeRecent(id);
    setRecents(listRecent());
  };
  const startCapture = (capture: "record" | "lyrics") => {
    guardRecordings(() => {
      commitCurrentSongToRecents();
      resetSong();
      useTakesStore.getState().clear();
      useRecordingsStore.getState().clear();
      useOnboardingStore.getState().resetForNewSong();
      // Both capture intents live on the Write surface — make sure we land there
      // even if a prior session left the app in Arrange mode (WriteMode only
      // mounts in write mode, and it's what consumes the capture param).
      useUIStore.getState().setMode("write");
      navigate(`/app?capture=${capture}`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-paper text-foreground overflow-y-auto">
      <ChipScatterBackground />
      <main className="relative mx-auto max-w-[1600px] px-4 pt-10 pb-24 flex flex-col items-center text-center">
        <div className="mt-10 flex w-full max-w-[1600px] items-center justify-center mx-auto ml-5 sm:ml-2">
          <span
            className="logomark-ink"
            style={{
              fontFamily: '"Noto Music"',
              fontSize: 144,
              lineHeight: "120px",
              marginTop: 12,
            }}
          >
            𝆑
          </span>
          <span
            className="logomark-ink"
            style={{
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg">{r.name}</h3>
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

      <AlertDialog open={!!pendingNav} onOpenChange={(o) => { if (!o) setPendingNav(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this song?</AlertDialogTitle>
            <AlertDialogDescription>
              This song has recordings that aren't saved to a file. Recents and new songs
              start without audio, so these recordings will be removed. Save the project
              first to keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={async () => {
                const proceed = pendingNav;
                const title = useSongStore.getState().meta.title.replace(/\s+/g, "-").toLowerCase();
                await downloadProjectZip(`${title || "song"}.zip`);
                setPendingNav(null);
                proceed?.();
              }}
            >
              <Save className="h-4 w-4" /> Save first
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const proceed = pendingNav;
                setPendingNav(null);
                proceed?.();
              }}
            >
              Discard &amp; continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
