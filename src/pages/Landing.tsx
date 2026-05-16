import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSongStore } from "@/store/song";
import { useDefaultsStore } from "@/store/defaults";
import { listRecent, removeRecent, type RecentProject } from "@/lib/recent-projects";
import { useTheme } from "@/hooks/use-theme";
import { BookOpen, Music, ListMusic, FileText, Trash2 } from "lucide-react";

type TabKey = "lyrics" | "chords" | "progressions";

const TAB_INFO: Array<{ key: TabKey; title: string; description: string; Icon: typeof BookOpen }> = [
  {
    key: "lyrics",
    title: "Lyrics",
    description:
      "Write lyrics line by line. Drop chords directly above the words and organize the song into sections.",
    Icon: FileText,
  },
  {
    key: "chords",
    title: "Chords",
    description:
      "Build a palette of chords for the song. Audition voicings and add favourites to the basket for quick reuse.",
    Icon: Music,
  },
  {
    key: "progressions",
    title: "Progressions",
    description:
      "Arrange chord pattern blocks per section. Press play to hear the full progression in your chosen sound.",
    Icon: ListMusic,
  },
];

const DECO_CHORDS = [
  { label: "Cmaj7", x: "7%",  y: "10%", r: -12 },
  { label: "Am",    x: "81%", y: "7%",  r: 8   },
  { label: "F",     x: "14%", y: "54%", r: -6  },
  { label: "G7",    x: "87%", y: "44%", r: 14  },
  { label: "Dm7",   x: "71%", y: "77%", r: -9  },
];

export default function Landing() {
  const navigate = useNavigate();
  const defaultLandingTab = useDefaultsStore((s) => s.defaultLandingTab);
  const setDefaultLandingTab = useDefaultsStore((s) => s.setDefaultLandingTab);
  const loadFromJSON = useSongStore((s) => s.loadFromJSON);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const { theme } = useTheme();

  useEffect(() => {
    setRecents(listRecent());
  }, []);

  const goTo = (tab: TabKey) => navigate(`/app?tab=${tab}`);

  const openRecent = (r: RecentProject) => {
    loadFromJSON(r.snapshot);
    navigate("/app");
  };

  const headingId = useMemo(() => "landing-heading", []);

  return (
    <div className="min-h-screen bg-paper text-foreground relative overflow-hidden">
      {/* Decorative ambient glow centred 60 px above vertical midpoint */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 70% 50% at 50% calc(50% - 60px), color-mix(in oklch, var(--primary-halo) 60%, transparent), transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      {/* Scattered decorative chord labels */}
      {DECO_CHORDS.map(({ label, x, y, r }) => (
        <span
          key={label}
          aria-hidden
          style={{
            position: "absolute",
            left: x,
            top: y,
            transform: `rotate(${r}deg)`,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--chord-ink)",
            opacity: theme === "dark" ? 0.15 : 0.25,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 0,
          }}
        >
          {label}
        </span>
      ))}

      <div className="relative z-10">
        <header className="mx-auto max-w-5xl px-4 pt-8 pb-4 flex items-center gap-3">
          <BookOpen className="h-7 w-7 ink-chord dark:text-[var(--cocoa)]" />
          <div>
            <h1 id={headingId} className="font-display text-3xl leading-none">SongNote</h1>
            <p className="text-sm text-muted-foreground mt-1">
              A songwriter's notebook for lyrics, chords, and progressions.
            </p>
          </div>
          <div className="ml-auto">
            <Link
              to="/app"
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 px-4 text-sm font-semibold"
            >
              Open editor
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-24" aria-labelledby={headingId}>
          <section aria-label="Tabs">
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Start where you want</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {TAB_INFO.map(({ key, title, description, Icon }) => {
                const isDefault = defaultLandingTab === key;
                return (
                  <article
                    key={key}
                    className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 ink-chord" />
                      <h3 className="font-display text-lg">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">{description}</p>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={isDefault}
                          onCheckedChange={(b) => setDefaultLandingTab(b ? key : null)}
                          aria-label={`Set ${title} as default tab`}
                        />
                        Default
                      </label>
                      <button
                        onClick={() => goTo(key)}
                        className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-8 px-3 text-sm font-semibold"
                      >
                        Open {title}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-10" aria-label="Recent projects">
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Recent projects</h2>
            {recents.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No recent projects yet. Open the editor and your saved songs will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {recents.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <button
                      type="button"
                      className="flex-1 text-left hover:underline"
                      onClick={() => openRecent(r)}
                    >
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(r.savedAt).toLocaleString()}
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        removeRecent(r.id);
                        setRecents(listRecent());
                      }}
                      aria-label={`Remove ${r.name} from recents`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
