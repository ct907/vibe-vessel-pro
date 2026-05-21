import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Play, Plus, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { transposeChord, transposeKey } from "@/lib/music/chords";
import { playChord, playProgression, stopProgression, type ScheduledChord } from "@/lib/music/audio";
import { explorerChordMap } from "@/lib/music/explorerHarmony";
import { useSongStore } from "@/store/song";
import HikeCanvas, { type HikeNode } from "@/components/explorer/HikeCanvas";
import FunctionChordGrid from "@/components/explorer/FunctionChordGrid";

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const BEATS_PER_CHORD = 4;

interface TrailStep {
  id: string;
  numeral: string;
}

export default function ChordExplorer() {
  const navigate = useNavigate();
  const resetSong = useSongStore((s) => s.resetSong);
  const setKey = useSongStore((s) => s.setKey);
  const setBpm = useSongStore((s) => s.setBpm);
  const addChordToPattern = useSongStore((s) => s.addChordToPattern);

  const [keyRoot, setKeyRoot] = useState("C");
  const [bpm, setLocalBpm] = useState(92);
  const [steps, setSteps] = useState<TrailStep[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [sendOpen, setSendOpen] = useState(false);
  const [semis, setSemis] = useState(0);

  const chordMap = useMemo(() => explorerChordMap(keyRoot), [keyRoot]);

  const nodes: HikeNode[] = useMemo(
    () => steps.map((s) => ({ id: s.id, numeral: s.numeral, chord: chordMap[s.numeral] })),
    [steps, chordMap],
  );

  useEffect(() => () => stopProgression(), []);

  const stopPlayback = () => {
    stopProgression();
    setIsPlaying(false);
    setActiveIndex(-1);
  };

  const addChord = (numeral: string) => {
    stopPlayback();
    setSteps((prev) => [...prev, { id: crypto.randomUUID(), numeral }]);
    void playChord(chordMap[numeral], 1, 4);
  };

  const undo = () => {
    stopPlayback();
    setSteps((prev) => prev.slice(0, -1));
  };

  const togglePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (nodes.length === 0) return;
    const events: ScheduledChord[] = nodes.map((n, i) => ({
      chord: n.chord,
      startBeat: i * BEATS_PER_CHORD,
      lengthBeats: BEATS_PER_CHORD,
    }));
    setIsPlaying(true);
    await playProgression(events, bpm, {
      loopBeats: nodes.length * BEATS_PER_CHORD,
      octave: 4,
      onChordStart: (idx) => setActiveIndex(idx),
    });
  };

  const handleDone = () => {
    if (nodes.length === 0) return;
    const payload = {
      app: "chord-explorer",
      v: 1,
      key: keyRoot,
      bpm,
      progression: nodes.map((n) => ({ numeral: n.numeral, chord: n.chord.display })),
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    void navigator.clipboard?.writeText(b64);
    toast("The hiker tips their hat — your trail is copied to the clipboard as a journal code.");
  };

  const openSend = () => {
    if (nodes.length === 0) return;
    stopPlayback();
    setSemis(0);
    setSendOpen(true);
  };

  const confirmSend = () => {
    resetSong();
    setKey(transposeKey(keyRoot, semis), "maj");
    setBpm(bpm);
    const patternId = useSongStore.getState().progression[0]?.id;
    if (patternId) {
      nodes.forEach((n, i) => {
        addChordToPattern(patternId, transposeChord(n.chord, semis), i * BEATS_PER_CHORD, BEATS_PER_CHORD);
      });
    }
    navigate("/app");
  };

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink md:flex-row">
      <div className="relative min-h-0 flex-[2] overflow-hidden border-b border-border md:flex-[3] md:border-b-0 md:border-r">
        <Link
          to="/"
          aria-label="Back to home"
          className="btn-sculpt-cream absolute left-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="absolute right-3 top-3 z-10 font-display text-lg font-bold text-ink-soft">
          Chord Explorer
        </span>
        <HikeCanvas nodes={nodes} activeIndex={activeIndex} keyRoot={keyRoot} />
      </div>

      <div className="flex min-h-0 flex-[3] flex-col md:flex-[2]">
        <div className="border-b border-border bg-[var(--paper-card)] p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  stopPlayback();
                  setKeyRoot(k);
                }}
                className={
                  k === keyRoot
                    ? "btn-sculpt-amber h-8 min-w-9 rounded-md px-2 text-sm font-bold"
                    : "btn-sculpt-cream h-8 min-w-9 rounded-md px-2 text-sm font-semibold"
                }
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={nodes.length === 0}
              className="btn-sculpt-amber inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold disabled:opacity-40"
            >
              {isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              {isPlaying ? "Stop" : "Play"}
            </button>
            <div className="flex flex-1 items-center gap-2">
              <span className="w-16 text-sm font-semibold text-ink-soft">{bpm} BPM</span>
              <Slider
                value={[bpm]}
                min={40}
                max={200}
                step={1}
                onValueChange={([v]) => {
                  stopPlayback();
                  setLocalBpm(v);
                }}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <FunctionChordGrid
            keyRoot={keyRoot}
            onAdd={addChord}
            onUndo={undo}
            canUndo={steps.length > 0}
          />
        </div>

        <div className="border-t border-border bg-[var(--paper-card)] p-3">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
            Hiker's Journal
          </h3>
          <div className="mb-3 min-h-7 flex flex-wrap items-center gap-1.5">
            {nodes.length === 0 ? (
              <span className="text-sm italic text-ink-soft">No steps on the trail yet.</span>
            ) : (
              nodes.map((n) => (
                <span
                  key={n.id}
                  className="font-mono-chord rounded-md bg-[var(--paper-shade)] px-1.5 py-0.5 text-sm font-bold"
                >
                  {n.chord.display}
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDone}
              disabled={nodes.length === 0}
              className="btn-sculpt-cream inline-flex h-9 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
            >
              Done · Copy Journal
            </button>
            <button
              type="button"
              onClick={openSend}
              disabled={nodes.length === 0}
              className="btn-sculpt-amber inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              Send to Song
            </button>
          </div>
        </div>
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send trail to a new song</DialogTitle>
            <DialogDescription>
              Transpose the progression up or down to fit your range, then open it in the editor.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-4 py-2">
            <button
              type="button"
              onClick={() => setSemis((s) => Math.max(-12, s - 1))}
              className="btn-sculpt-cream inline-flex h-9 w-9 items-center justify-center rounded-full"
              aria-label="Transpose down"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="text-center">
              <div className="font-display text-2xl font-bold">
                {transposeKey(keyRoot, semis)}
              </div>
              <div className="text-xs text-ink-soft">
                {semis === 0 ? "Original key" : `${semis > 0 ? "+" : ""}${semis} semitones`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSemis((s) => Math.min(12, s + 1))}
              className="btn-sculpt-cream inline-flex h-9 w-9 items-center justify-center rounded-full"
              aria-label="Transpose up"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {nodes.map((n) => (
              <span
                key={n.id}
                className="font-mono-chord rounded-md bg-[var(--paper-shade)] px-1.5 py-0.5 text-sm font-bold"
              >
                {transposeChord(n.chord, semis).display}
              </span>
            ))}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={confirmSend}
              className="btn-sculpt-amber inline-flex h-10 items-center justify-center rounded-lg px-5 text-sm font-semibold"
            >
              Open in editor
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
