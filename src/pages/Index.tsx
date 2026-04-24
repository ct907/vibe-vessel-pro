import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransportHeader } from "@/components/header/TransportHeader";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ChordsTab } from "@/components/chords/ChordsTab";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import { BasketBar } from "@/components/basket/BasketBar";
import { hydrateFromStorage, startAutosave, useSongStore } from "@/store/song";
import { Button } from "@/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown, ArrowUpDown, Brush } from "lucide-react";

const Index = () => {
  const [tab, setTab] = useState<string>("lyrics");
  const [isPlaying, setIsPlaying] = useState(false);
  const sections = useSongStore((s) => s.sections);
  const setAllSectionsCollapsed = useSongStore((s) => s.setAllSectionsCollapsed);
  const updateSection = useSongStore((s) => s.updateSection);
  const formatChordsInSong = useSongStore((s) => s.formatChordsInSong);
  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);
  // Format Chords is enabled iff the song has both at least one word and at least one chord anchor.
  const canFormat = sections.some(
    (s) => s.lines.some((l) => /\S/.test(l.text)) && s.lines.some((l) => l.chords.length > 0),
  );

  // Sort mode is per-tab (lyrics & progressions). Tracks prior collapsed
  // states so we can restore them when exiting sort mode.
  const [sortMode, setSortMode] = useState<null | "lyrics" | "progressions">(null);
  const [priorCollapsed, setPriorCollapsed] = useState<Record<string, boolean>>({});

  const enterSortMode = (which: "lyrics" | "progressions") => {
    const snap: Record<string, boolean> = {};
    sections.forEach((s) => {
      snap[s.id] = !!s.collapsed;
    });
    setPriorCollapsed(snap);
    setSortMode(which);
    setAllSectionsCollapsed(true);
  };
  const exitSortMode = () => {
    sections.forEach((s) => {
      const prev = priorCollapsed[s.id];
      if (prev === undefined) return;
      if (!!s.collapsed !== prev) updateSection(s.id, { collapsed: prev });
    });
    setSortMode(null);
    setPriorCollapsed({});
  };
  const toggleSortMode = (which: "lyrics" | "progressions") => {
    if (sortMode === which) exitSortMode();
    else enterSortMode(which);
  };

  // Auto-exit sort mode if the user switches tabs.
  useEffect(() => {
    if (sortMode && sortMode !== tab) exitSortMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    hydrateFromStorage();
    const unsub = startAutosave();
    return () => unsub();
  }, []);

  const showSortButton = tab === "lyrics" || tab === "progressions";

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col">
      <TransportHeader isPlaying={isPlaying} setIsPlaying={setIsPlaying} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-[48rem]">
        <h1 className="sr-only">Songwriter's Notebook — lyrics, chords, and progressions</h1>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="relative flex justify-center items-center">
            {tab === "lyrics" && (
              <div className="absolute left-0 flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAllSectionsCollapsed(!allCollapsed)}
                  aria-label={allCollapsed ? "Expand all sections" : "Collapse all sections"}
                  title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
                  disabled={!!sortMode}
                >
                  {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                  <span className="hidden sm:inline">{allCollapsed ? "Expand all" : "Collapse all"}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => formatChordsInSong()}
                  disabled={!!sortMode || !canFormat}
                  aria-label="Format chords — snap to lyric words"
                  title={canFormat ? "Snap chords to lyric words" : "Type lyrics first"}
                >
                  <Brush className="h-4 w-4" />
                  <span className="hidden sm:inline">Format</span>
                </Button>
              </div>
            )}
            <TabsList className="bg-paper-shade/70">
              <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
              <TabsTrigger value="chords">Chords</TabsTrigger>
              <TabsTrigger value="progressions">Progressions</TabsTrigger>
            </TabsList>
            {showSortButton && (
              <Button
                size="sm"
                variant={sortMode === tab ? "default" : "outline"}
                className="absolute right-0"
                onClick={() => toggleSortMode(tab as "lyrics" | "progressions")}
                aria-label={sortMode === tab ? "Exit sort mode" : "Enter sort mode"}
                title={sortMode === tab ? "Exit sort mode" : "Reorder sections"}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden sm:inline">{sortMode === tab ? "Done" : "Sort"}</span>
              </Button>
            )}
          </div>

          <TabsContent value="lyrics" className="mt-4">
            <LyricsTab sortMode={sortMode === "lyrics"} />
          </TabsContent>
          <TabsContent value="chords" className="mt-4">
            <ChordsTab />
          </TabsContent>
          <TabsContent value="progressions" className="mt-4">
            <ProgressionsTab sortMode={sortMode === "progressions"} />
          </TabsContent>
        </Tabs>
      </main>

      <BasketBar onSendToLyrics={() => setTab("lyrics")} onSendToProgressions={() => setTab("progressions")} />
    </div>
  );
};

export default Index;
