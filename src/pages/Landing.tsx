import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Pencil, Piano, Save } from "lucide-react";
import { JamCanvas } from "@/components/chord/JamCanvas";
import { chordSlotWidth } from "@/lib/music/chordLayout";
import type { ChordSymbol, Mode } from "@/lib/music/chords";
import { RecentProjectsList } from "@/components/common/RecentProjectsList";
import { useSongStore, CHORD_ROW_SLOTS } from "@/store/song";
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
const CHORDS_STYLE: CSSProperties = { background: "var(--section-tint-amber)" };
const RECORD_STYLE: CSSProperties = { background: "var(--section-tint-rose)" };
const ARRANGE_STYLE: CSSProperties = { background: "var(--section-tint-green)" };

function TaglineChip({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <span
      className="noise-texture-chip inline-flex items-center rounded-md px-1.5 py-0.5 type-label font-semibold"
      style={{ ...style, ...TAGLINE_TEXT }}
    >
      {label}
    </span>
  );
}

const BASE_CHIP_FONT_PX = 14;
const SIZE_JITTER = 0.2;
// The design's progressive background blur is 48 in Figma, whose blur values
// are about twice the CSS radius. Strongest at the top, sharp from BLUR_END down.
const MAX_BLUR_PX = 24;
const BLUR_END = 75;

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

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 w-screen h-screen overflow-hidden"
      style={{ zIndex: 0, mixBlendMode: theme === "dark" ? "soft-light" : "multiply" }}
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
            opacity: 0.7,
            filter: `blur(${(MAX_BLUR_PX * Math.max(0, 1 - p.top / BLUR_END)).toFixed(1)}px)`,
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
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [jamOpen, setJamOpen] = useState(false);
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
  // Jam from the homepage: the capture becomes a new song, in the key it started in.
  const jamToNewSong = (chords: ChordSymbol[], key: { root: string; mode: Mode }) => {
    void commitCurrentSongToRecents();
    resetSong();
    useTakesStore.getState().clear();
    useRecordingsStore.getState().clear();
    useOnboardingStore.getState().resetForNewSong();
    useUIStore.getState().setMode("write");
    const { setKey, placeChordInSlot, autoLayoutSection } = useSongStore.getState();
    setKey(key.root, key.mode);
    const { sections } = useSongStore.getState();
    const section = sections[0];
    const lineId = section.lines[0].id;
    let slot = 0;
    for (const chord of chords) {
      const placed = placeChordInSlot(section.id, lineId, slot, chord);
      slot = Math.min(CHORD_ROW_SLOTS - 1, (placed?.slotIndex ?? slot) + chordSlotWidth(chord.display) + 1);
    }
    if (chords.length > 1) autoLayoutSection(section.id, window.innerWidth, 28);
    navigate("/app");
  };
  const continueName = liveName ?? recents[0]?.name;

  const startButton = "btn-sculpt-cta flex h-[88px] flex-col items-center justify-center gap-2 rounded-xl type-body font-bold";
  const exploreButton = "btn-sculpt-cream flex-1 inline-flex items-center justify-center rounded-xl px-2 type-label font-semibold leading-tight";
  return (
    <div className="fixed inset-0 z-50 bg-paper text-foreground overflow-y-auto">
      <ChipScatterBackground />
      <main className="relative mx-auto flex h-full w-full max-w-md flex-col px-4 pt-10 pb-6 text-center">
        <h1
          role="img"
          aria-label="felt."
          className="flex shrink-0 items-center justify-center ml-5 sm:ml-2 font-normal"
        >
          <span aria-hidden className="logomark-ink" style={{ fontFamily: '"Noto Music"', fontSize: 110, lineHeight: "92px", marginTop: 9 }}>
            𝆑
          </span>
          <span aria-hidden className="logomark-ink" style={{ fontFamily: '"Noto Music"', fontSize: 68, fontStyle: "italic", lineHeight: "92px", marginLeft: -18 }}>
            elt.
          </span>
        </h1>

        <p className="mt-4 shrink-0 type-body font-bold leading-snug text-foreground/90">
          The Songwriter's Notebook.
        </p>

        <p className="mt-3 shrink-0 type-label text-foreground/80 flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
          <span>Write</span>
          <TaglineChip label="Lyrics" style={LYRICS_STYLE} />
          <span>and</span>
          <TaglineChip label="Chords" style={CHORDS_STYLE} />
          <span className="-ml-1">.</span>
          <TaglineChip label="Record" style={RECORD_STYLE} />
          <span>and</span>
          <TaglineChip label="Arrange" style={ARRANGE_STYLE} />
          <span className="-ml-1">.</span>
        </p>

        <div className="mx-auto mt-9 grid w-full max-w-[308px] shrink-0 grid-cols-2 gap-x-6 gap-y-3">
          <button type="button" className={startButton} onClick={() => startCapture("record")}>
            <Mic className="h-6 w-6" strokeWidth={1.75} />
            Record
          </button>
          <button type="button" className={startButton} onClick={() => startCapture("lyrics")}>
            <Pencil className="h-6 w-6" strokeWidth={1.75} />
            Write
          </button>
          <button type="button" className={startButton} onClick={() => setJamOpen(true)}>
            <Piano className="h-6 w-6" strokeWidth={1.75} />
            Jam
          </button>
          <div className="flex h-[88px] flex-col gap-2">
            <button
              type="button"
              onClick={() => navigate("/app?tab=chords")}
              className={exploreButton}
              style={{ backgroundColor: "var(--paper-shade)" }}
            >
              Explore Chords
            </button>
            <button
              type="button"
              onClick={() => navigate("/app?tab=voicekey")}
              className={exploreButton}
              style={{ backgroundColor: "var(--paper-shade)" }}
            >
              Find Your Range
            </button>
          </div>
        </div>

        <section className="mt-10 flex min-h-[120px] flex-1 flex-col" aria-label="Recent projects">
          <h2 className="mb-3 shrink-0 type-body font-bold">Recent Projects</h2>
          {continueName && (
            <button
              type="button"
              onClick={() => (liveName ? navigate("/app") : openRecent(recents[0]))}
              className="mb-2 w-full shrink-0 rounded-xl bg-[var(--paper-card)] shadow-[var(--shadow-card)] px-4 py-2 flex items-center gap-3 text-left hover:brightness-95 transition-[filter]"
            >
              <Save className="h-5 w-5 shrink-0" style={{ color: "var(--ink-soft)" }} />
              <div className="min-w-0 flex-1">
                <p className="type-caption uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Continue where you left off</p>
                <h3 className="font-display type-body font-semibold leading-tight truncate">{continueName}</h3>
              </div>
            </button>
          )}
          <div className="min-h-0 overflow-y-auto -mx-1 px-1 pb-1">
            <RecentProjectsList songs={recents} onOpen={openRecent} onRemove={removeOne} />
          </div>
        </section>

        {jamOpen && (
          <JamCanvas
            targetLabel="New song"
            onCommit={jamToNewSong}
            onClose={() => setJamOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
