import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransportHeader } from "@/components/header/TransportHeader";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ChordsTab } from "@/components/chords/ChordsTab";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import { BasketBar } from "@/components/basket/BasketBar";
import { hydrateFromStorage, startAutosave } from "@/store/song";

const Index = () => {
  const [tab, setTab] = useState<string>("lyrics");
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    hydrateFromStorage();
    const unsub = startAutosave();
    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col">
      <TransportHeader isPlaying={isPlaying} setIsPlaying={setIsPlaying} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-32">
        <h1 className="sr-only">Songwriter's Notebook — lyrics, chords, and progressions</h1>

        <Tabs value={tab} onValueChange={setTab} className="w-full relative">
          <TabsList
            className="bg-paper-shade/70 left-1/2 -translate-x-1/2"
            style={{ position: "absolute", transform: "translate(-50%, -61px)" }}
          >
            <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
            <TabsTrigger value="chords">Chords</TabsTrigger>
            <TabsTrigger value="progressions">Progressions</TabsTrigger>
          </TabsList>

          <TabsContent value="lyrics" className="mt-4">
            <LyricsTab />
          </TabsContent>
          <TabsContent value="chords" className="mt-4">
            <ChordsTab />
          </TabsContent>
          <TabsContent value="progressions" className="mt-4">
            <ProgressionsTab />
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
