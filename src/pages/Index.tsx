import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DragDropContext,
  useKeyboardSensor,
  type DropResult,
} from "@hello-pangea/dnd";
import { useInstantTouchSensor } from "@/lib/dnd/instant-touch-sensor";
import { useInstantMouseSensor } from "@/lib/dnd/instant-mouse-sensor";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TransportHeader } from "@/components/header/TransportHeader";
import { SongTitleHeader } from "@/components/song/SongTitleHeader";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ChordsTab } from "@/components/chords/ChordsTab";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import { BasketBar } from "@/components/basket/BasketBar";
import { useSongStore, beginInteraction, endInteraction } from "@/store/song";
import { useDndStore } from "@/store/dnd";
import { useDefaultsStore } from "@/store/defaults";
import { useAppBackgroundStore, getPatternStyle, getMaskStyle } from "@/store/appBackground";
import { useTheme } from "@/hooks/use-theme";

const Index = () => {
  const bg = useAppBackgroundStore();
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const defaultLandingTab = useDefaultsStore((s) => s.defaultLandingTab);
  const initialTab = ((): "lyrics" | "chords" | "progressions" => {
    const q = searchParams.get("tab");
    if (q === "lyrics" || q === "chords" || q === "progressions") return q;
    if (defaultLandingTab) return defaultLandingTab;
    return "lyrics";
  })();
  const [tab, setTab] = useState<"lyrics" | "chords" | "progressions">(initialTab);
  const [isPlaying, setIsPlaying] = useState(false);
  const sections = useSongStore((s) => s.sections);
  const setAllSectionsCollapsed = useSongStore((s) => s.setAllSectionsCollapsed);
  const updateSection = useSongStore((s) => s.updateSection);

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
  const toggleSortMode = () => {
    if (tab !== "lyrics" && tab !== "progressions") return;
    if (sortMode === tab) exitSortMode();
    else enterSortMode(tab);
  };

  // Auto-exit sort mode if the user switches tabs.
  useEffect(() => {
    if (sortMode && sortMode !== tab) exitSortMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);


  // Single global DragDropContext. Only basket chips are draggable; chord
  // chips in Lyrics and Progressions are no longer draggable.
  const onBeforeDragStart = () => {
    beginInteraction();
  };
  const onDragEnd = (result: DropResult) => {
    try {
      const { lyricsOnDragEnd, progressionsOnDragEnd } = useDndStore.getState();
      const dstPrefix = result.destination?.droppableId.split(":")[0];
      if (dstPrefix === "slot") {
        lyricsOnDragEnd?.(result);
      } else if (dstPrefix === "pattern") {
        progressionsOnDragEnd?.(result);
      }
    } finally {
      useDndStore.getState().clear();
      endInteraction();
    }
  };

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col isolate">
      {bg.pattern !== "none" && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: -1, opacity: theme === "dark" ? 0.2 : (bg.pattern === "dot" ? 0.8 : 0.3), ...getPatternStyle(bg.pattern), ...getMaskStyle(bg.mask) }}
        />
      )}
      <TransportHeader isPlaying={isPlaying} setIsPlaying={setIsPlaying} tab={tab} setTab={setTab} />

      <DragDropContext
        onBeforeDragStart={onBeforeDragStart}
        onDragEnd={onDragEnd}
        enableDefaultSensors={false}
        sensors={[useInstantMouseSensor, useKeyboardSensor, useInstantTouchSensor]}
      >
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 pb-[368px]">
          <h2 className="sr-only">Songwriter's Notebook — lyrics, chords, and progressions</h2>

          <SongTitleHeader activeTab={tab} sortMode={sortMode} onToggleSort={toggleSortMode} />

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full mt-4">
            <TabsContent value="lyrics" forceMount className="mt-0 data-[state=inactive]:hidden">
              <LyricsTab sortMode={sortMode === "lyrics"} onSwitchTab={setTab} />
            </TabsContent>
            <TabsContent value="chords" forceMount className="mt-0 data-[state=inactive]:hidden">
              <ChordsTab onSwitchTab={setTab} />
            </TabsContent>
            <TabsContent value="progressions" forceMount className="mt-0 data-[state=inactive]:hidden">
              <ProgressionsTab sortMode={sortMode === "progressions"} onSwitchTab={setTab} />
            </TabsContent>
          </Tabs>
        </main>

        {/* Basket lives at the layout level — single instance shared across
            tabs, sibling of <main> inside the same DragDropContext so drops
            from the basket land in either lyrics or progression destinations. */}
        <BasketBar
          draggable
          onSendToLyrics={tab !== "lyrics" ? () => setTab("lyrics") : undefined}
          onSendToProgressions={tab !== "progressions" ? () => setTab("progressions") : undefined}
        />
      </DragDropContext>
    </div>
  );
};

export default Index;
