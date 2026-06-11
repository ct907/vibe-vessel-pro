import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
  DragDropContext,
  useKeyboardSensor,
  type DropResult,
} from "@hello-pangea/dnd";
import { useInstantTouchSensor } from "@/lib/dnd/instant-touch-sensor";
import { useInstantMouseSensor } from "@/lib/dnd/instant-mouse-sensor";
import { TransportHeader } from "@/components/header/TransportHeader";
import { SongTitleHeader } from "@/components/song/SongTitleHeader";
import { ChordsTab } from "@/components/chords/ChordsTab";
import { VoiceKeyTab } from "@/components/voicekey/VoiceKeyTab";
import { WriteMode } from "@/components/write/WriteMode";
import { ArrangeMode } from "@/components/arrange/ArrangeMode";
import { useSongStore, beginInteraction, endInteraction } from "@/store/song";
import { useDndStore } from "@/store/dnd";
import { useTakesStore } from "@/store/takes";
import { useRecordingsStore, type RecClip } from "@/store/recordings";
import { useAppBackgroundStore, getPatternStyle, getMaskStyle } from "@/store/appBackground";
import { useTheme } from "@/hooks/use-theme";
import { useUIStore, type TabName, type AppMode } from "@/store/ui";
import { useOnboardingStore } from "@/store/onboarding";

const isTabName = (v: string | null): v is TabName =>
  v === "lyrics" || v === "chords" || v === "progressions" || v === "recordings" || v === "voicekey";

const Index = () => {
  const bg = useAppBackgroundStore();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  // `tab` now only drives the Explore-Chords / Voice-Key overlays. Primary
  // navigation is the Write ↔ Arrange mode toggle.
  const [tab, setTab] = useState<TabName>(isTabName(queryTab) ? queryTab : "lyrics");
  useEffect(() => {
    if (isTabName(queryTab)) setTab(queryTab);
  }, [queryTab]);

  const [isPlaying, setIsPlaying] = useState(false);
  const sections = useSongStore((s) => s.sections);
  const setAllSectionsCollapsed = useSongStore((s) => s.setAllSectionsCollapsed);
  const updateSection = useSongStore((s) => s.updateSection);

  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);

  const isOverlay = tab === "chords" || tab === "voicekey";

  // Map the active surface onto the legacy tab vocabulary the song menu and
  // sort logic still speak. Arrange is now a single stacked page; its sort and
  // menu actions target the progressions editor.
  const activeTab: TabName = isOverlay
    ? tab
    : mode === "write"
      ? "lyrics"
      : "progressions";

  useEffect(() => {
    setActiveTab(activeTab);
  }, [activeTab, setActiveTab]);

  const handleSelectMode = (m: AppMode) => {
    if (isOverlay) setTab("lyrics");
    setMode(m);
    const ob = useOnboardingStore.getState();
    if (ob.enabled && ob.globalPhase === 0) ob.setGlobalPhase(1);
  };

  // Sort mode applies to the chord-over-lyric sheet (Write) and the pattern
  // blocks (Arrange/Chords). Tracks prior collapsed states for restore.
  const sortContext: "lyrics" | "progressions" | null =
    mode === "write" ? "lyrics" : "progressions";
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
    if (!sortContext) return;
    if (sortMode === sortContext) exitSortMode();
    else enterSortMode(sortContext);
  };

  // Auto-exit sort mode if the user switches surface.
  useEffect(() => {
    if (sortMode && sortMode !== sortContext) exitSortMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      } else if (dstPrefix === "track" && result.destination) {
        const trackId = result.destination.droppableId.slice("track:".length);
        const takeId = result.draggableId.slice("take:".length);
        const take = useTakesStore.getState().takes.find((t) => t.id === takeId);
        if (take?.blobId) {
          const { addClip, playheadSec } = useRecordingsStore.getState();
          // Land the take where the playhead is — the same place a new recording
          // would start — rather than always appending at the track end.
          const startSec = playheadSec;
          const clip: RecClip = {
            blobId: take.blobId,
            mime: take.mime ?? "audio/webm",
            durationSec: take.durationSec,
            startSec,
            trimStartSec: 0,
            trimEndSec: take.durationSec,
          };
          addClip(trackId, clip);
        }
      }
    } finally {
      useDndStore.getState().clear();
      endInteraction();
    }
  };

  const showTitleHeader = true;
  const showTabContent = true;
  const inEditor = location.pathname !== "/";

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col isolate">
      {bg.pattern !== "none" && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: -1, opacity: theme === "dark" ? 0.2 : (bg.pattern === "dot" ? 0.8 : 0.3), ...getPatternStyle(bg.pattern), ...getMaskStyle(bg.mask) }}
        />
      )}
      {!isOverlay && (
        <TransportHeader
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          tab={tab}
          setTab={setTab}
          mode={mode}
          onSelectMode={handleSelectMode}
        />
      )}

      <DragDropContext
        onBeforeDragStart={onBeforeDragStart}
        onDragEnd={onDragEnd}
        enableDefaultSensors={false}
        sensors={[useInstantMouseSensor, useKeyboardSensor, useInstantTouchSensor]}
      >
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 pb-32">
          <h2 className="sr-only">Songwriter's Notebook — write and arrange</h2>

          {isOverlay ? (
            tab === "chords" ? (
              <>
                <div className="relative mt-6 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (searchParams.get("tab") === "chords") navigate("/");
                      else setTab("lyrics");
                    }}
                    aria-label="Back"
                    className="btn-sculpt-cream absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full h-9 w-9"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h1 className="text-3xl font-display font-bold text-center">Explore Chords</h1>
                </div>
                <ChordsTab onSwitchTab={setTab} />
              </>
            ) : (
              <VoiceKeyTab />
            )
          ) : (
            <>
              {showTitleHeader && (
                <SongTitleHeader
                  activeTab={activeTab}
                  sortMode={sortMode}
                  onToggleSort={toggleSortMode}
                />
              )}

              {showTabContent && (
                mode === "write" ? (
                  <div className="mt-4">
                    <WriteMode sortMode={sortMode === "lyrics"} onSwitchTab={setTab} showOnboarding={inEditor} />
                  </div>
                ) : (
                  <div className="mt-4">
                    <ArrangeMode
                      sortMode={sortMode === "progressions"}
                      onSwitchTab={setTab}
                      showOnboarding={inEditor}
                    />
                  </div>
                )
              )}
            </>
          )}
        </main>
      </DragDropContext>
    </div>
  );
};

export default Index;
