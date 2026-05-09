import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TransportHeader } from "@/components/header/TransportHeader";
import { SongTitleHeader } from "@/components/song/SongTitleHeader";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ChordsTab } from "@/components/chords/ChordsTab";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import { BasketBar } from "@/components/basket/BasketBar";
import { hydrateFromStorage, startAutosave, useSongStore, beginInteraction, endInteraction } from "@/store/song";
import { useDndStore } from "@/store/dnd";
import { useBasketSelectionStore } from "@/store/basket-selection";
import { useDefaultsStore } from "@/store/defaults";
import { pushRecent } from "@/lib/recent-projects";

const Index = () => {
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

  useEffect(() => {
    hydrateFromStorage();
    const unsub = startAutosave();
    // Throttled recents push: every 30s while song changes, snapshot title + json.
    let lastPush = 0;
    const unsubRecents = useSongStore.subscribe((state) => {
      const now = Date.now();
      if (now - lastPush < 30_000) return;
      lastPush = now;
      try {
        pushRecent({ name: state.meta.title || "Untitled Song", snapshot: state.toJSON() });
      } catch { /* ignore */ }
    });
    return () => { unsub(); unsubRecents(); };
  }, []);

  // Single global DragDropContext routes drops to whichever tab owns the
  // destination droppable. Basket-source drags work cross-tab because the
  // BasketBar is a sibling of <main> inside this same context.
  const onDragStart = (start: { draggableId: string }) => {
    const { lyricsOnDragStart } = useDndStore.getState();
    lyricsOnDragStart?.(start);
  };
  const onDragEnd = (result: DropResult) => {
    const { lyricsOnDragEnd, progressionsOnDragEnd } = useDndStore.getState();
    const dstPrefix = result.destination?.droppableId.split(":")[0];
    // eslint-disable-next-line no-console
    console.log("[DnD] onDragEnd", {
      result,
      destination: result.destination?.droppableId,
      source: result.source?.droppableId,
      dstPrefix,
    });
    if (dstPrefix === "slot") {
      console.log("[DnD] -> lyrics handler");
      return lyricsOnDragEnd?.(result);
    }
    if (dstPrefix === "pattern" || dstPrefix === "patternblock") {
      console.log("[DnD] -> progressions handler");
      return progressionsOnDragEnd?.(result);
    }
    // No destination (drop cancelled) — still notify lyrics so its draggingIds
    // state clears (its handler returns early when destination is null).
    lyricsOnDragEnd?.(result);
    progressionsOnDragEnd?.(result);
  };

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 pt-3">
        <h1 className="font-display leading-none" style={{ fontSize: "28px" }}>
          SongNote
        </h1>
      </div>
      <TransportHeader isPlaying={isPlaying} setIsPlaying={setIsPlaying} tab={tab} setTab={setTab} />

      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 pb-[48rem]">
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
