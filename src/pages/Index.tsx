import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransportHeader } from "@/components/header/TransportHeader";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ChordsTab } from "@/components/chords/ChordsTab";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import { BasketBar } from "@/components/basket/BasketBar";
import { hydrateFromStorage, startAutosave, useSongStore } from "@/store/song";
import { Button } from "@/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown, ArrowUpDown, Check } from "lucide-react";

const Index = () => {
  const [tab, setTab] = useState<string>("lyrics");
  const [isPlaying, setIsPlaying] = useState(false);
  const sections = useSongStore((s) => s.sections);
  const setAllSectionsCollapsed = useSongStore((s) => s.setAllSectionsCollapsed);
  const updateSection = useSongStore((s) => s.updateSection);
  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);

  // Sort mode is independent per tab. When entering, snapshot the current
  // collapsed-state of every section and force-collapse all. When exiting,
  // restore each section's prior collapsed state.
  const [sortModeLyrics, setSortModeLyrics] = useState(false);
  const [sortModeProg, setSortModeProg] = useState(false);
  const [collapsedSnapshot, setCollapsedSnapshot] = useState<Record<string, boolean> | null>(null);

  const enterSortMode = (which: "lyrics" | "progressions") => {
    const snap: Record<string, boolean> = {};
    sections.forEach((s) => { snap[s.id] = s.collapsed; });
    setCollapsedSnapshot(snap);
    sections.forEach((s) => { if (!s.collapsed) updateSection(s.id, { collapsed: true }); });
    if (which === "lyrics") setSortModeLyrics(true); else setSortModeProg(true);
  };

  const exitSortMode = (which: "lyrics" | "progressions") => {
    if (collapsedSnapshot) {
      sections.forEach((s) => {
        const prev = collapsedSnapshot[s.id];
        if (prev !== undefined && prev !== s.collapsed) updateSection(s.id, { collapsed: prev });
      });
    }
    setCollapsedSnapshot(null);
    if (which === "lyrics") setSortModeLyrics(false); else setSortModeProg(false);
  };

  const sortMode = tab === "lyrics" ? sortModeLyrics : tab === "progressions" ? sortModeProg : false;
  const toggleSort = () => {
    const which = tab === "lyrics" ? "lyrics" : "progressions";
    if (sortMode) exitSortMode(which); else enterSortMode(which);
  };

  useEffect(() => {
    hydrateFromStorage();
    const unsub = startAutosave();
    return () => unsub();
  }, []);

  const showSortControls = tab === "lyrics" || tab === "progressions";

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col">
      <TransportHeader isPlaying={isPlaying} setIsPlaying={setIsPlaying} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-[48rem]">
        <h1 className="sr-only">Songwriter's Notebook — lyrics, chords, and progressions</h1>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="relative flex justify-center items-center">
            {tab === "lyrics" && !sortMode && (
              <Button
                size="sm"
                variant="outline"
                className="absolute left-0"
                onClick={() => setAllSectionsCollapsed(!allCollapsed)}
                aria-label={allCollapsed ? "Expand all sections" : "Collapse all sections"}
                title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
              >
                {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                <span className="hidden sm:inline">{allCollapsed ? "Expand all" : "Collapse all"}</span>
              </Button>
            )}
            <TabsList className="bg-paper-shade/70">
              <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
              <TabsTrigger value="chords">Chords</TabsTrigger>
              <TabsTrigger value="progressions">Progressions</TabsTrigger>
            </TabsList>
            {showSortControls && (
              <Button
                size="sm"
                variant={sortMode ? "default" : "outline"}
                className="absolute right-0"
                onClick={toggleSort}
                aria-pressed={sortMode}
                aria-label={sortMode ? "Done sorting sections" : "Sort sections"}
                title={sortMode ? "Done sorting sections" : "Sort sections"}
              >
                {sortMode ? <Check className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />}
                <span className="hidden sm:inline">{sortMode ? "Done" : "Sort"}</span>
              </Button>
            )}
          </div>

          <TabsContent value="lyrics" className="mt-4">
            <LyricsTab sortMode={sortModeLyrics} />
          </TabsContent>
          <TabsContent value="chords" className="mt-4">
            <ChordsTab />
          </TabsContent>
          <TabsContent value="progressions" className="mt-4">
            <ProgressionsTab sortMode={sortModeProg} />
          </TabsContent>
        </Tabs>
      </main>

      <BasketBar
        onSendToLyrics={() => setTab("lyrics")}
        onSendToProgressions={() => setTab("progressions")}
      />
    </div>
  );
};

export default Index;
