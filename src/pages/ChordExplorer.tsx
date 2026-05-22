import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  NOTES_SHARP,
  QUALITY_PRETTY,
  parseChord,
  transposeChord,
  transposeKey,
  type Quality,
} from "@/lib/music/chords";
import { playNotes, stopProgression } from "@/lib/music/audio";
import {
  nashvilleNumeral,
  voiceChord,
  type Candidate,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";
import { useSongStore } from "@/store/song";
import ProgressionTimeline from "@/components/explorer/ProgressionTimeline";
import VoiceLeadingChart from "@/components/explorer/VoiceLeadingChart";
import SuggestionPalette from "@/components/explorer/SuggestionPalette";

const BEATS_PER_CHORD = 4;

export default function ChordExplorer() {
  const navigate = useNavigate();
  const resetSong = useSongStore((s) => s.resetSong);
  const setKey = useSongStore((s) => s.setKey);
  const setBpm = useSongStore((s) => s.setBpm);
  const addChordToPattern = useSongStore((s) => s.addChordToPattern);

  const [keyRoot, setKeyRoot] = useState("C");
  const [mode, setMode] = useState<ExplorerMode>("maj");
  const [slots, setSlots] = useState(4);
  const [bpm, setLocalBpm] = useState(100);
  const [steps, setSteps] = useState<ExplorerStep[]>([]);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [playIndex, setPlayIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voicingEditIdx, setVoicingEditIdx] = useState(-1);
  const [sendOpen, setSendOpen] = useState(false);
  const [semis, setSemis] = useState(0);

  const playTimer = useRef<number | null>(null);

  const stopPlay = useCallback(() => {
    if (playTimer.current != null) {
      clearTimeout(playTimer.current);
      playTimer.current = null;
    }
    setIsPlaying(false);
    setPlayIndex(-1);
  }, []);

  useEffect(() => {
    return () => {
      if (playTimer.current != null) clearTimeout(playTimer.current);
      stopProgression();
    };
  }, []);

  const resolvedFocus =
    steps.length === 0
      ? -1
      : focusIdx >= 0 && focusIdx < steps.length
        ? focusIdx
        : steps.length - 1;

  const makeStep = (
    chord: ExplorerStep["chord"],
    category: ExplorerStep["category"],
    trait: string | null,
  ): ExplorerStep => ({
    id: crypto.randomUUID(),
    chord,
    category,
    trait,
    pitches: voiceChord(chord),
  });

  const addCandidate = (c: Candidate) => {
    stopPlay();
    const step = makeStep(c.chord, c.category, c.trait?.tag ?? null);
    setSteps((prev) => [...prev, step]);
    setFocusIdx(-1);
    setVoicingEditIdx(-1);
    void playNotes(step.pitches, 1);
  };

  const addStarter = (root: string, quality: "maj" | "min" | "dim") => {
    stopPlay();
    setKeyRoot(root);
    setMode(quality === "min" ? "min" : "maj");
    const suffix = quality === "min" ? "m" : quality === "dim" ? "dim" : "";
    const chord = parseChord(root + suffix)!;
    const step = makeStep(chord, "starter", null);
    setSteps([step]);
    setFocusIdx(-1);
    setVoicingEditIdx(-1);
    void playNotes(step.pitches, 1);
  };

  const addTyped = (input: string): boolean => {
    const chord = parseChord(input);
    if (!chord) return false;
    stopPlay();
    const step = makeStep(chord, "typed", null);
    setSteps((prev) => [...prev, step]);
    setFocusIdx(-1);
    setVoicingEditIdx(-1);
    void playNotes(step.pitches, 1);
    return true;
  };

  const removeStep = (idx: number) => {
    stopPlay();
    setSteps((prev) => prev.filter((_, i) => i !== idx));
    setFocusIdx(-1);
    setVoicingEditIdx(-1);
  };

  const setExtension = (idx: number, quality: Quality) => {
    stopPlay();
    setVoicingEditIdx(-1);
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const display =
          s.chord.root + QUALITY_PRETTY[quality] + (s.chord.bass ? `/${s.chord.bass}` : "");
        const chord = { ...s.chord, quality, display };
        const pitches = voiceChord(chord);
        void playNotes(pitches, 1);
        return { ...s, chord, pitches };
      }),
    );
  };

  const focusStep = (idx: number) => {
    setFocusIdx(idx);
    setVoicingEditIdx((cur) => (cur === idx ? cur : -1));
    if (steps[idx]) void playNotes(steps[idx].pitches, 1);
  };

  const toggleVoicingEdit = () => {
    setVoicingEditIdx((cur) => (cur >= 0 ? -1 : resolvedFocus));
  };

  const moveVoice = (stepIdx: number, voiceIdx: number, dir: 1 | -1) => {
    const step = steps[stepIdx];
    if (!step) return;
    const moved = step.pitches[voiceIdx] + dir * 12;
    if (moved < 24 || moved > 96) return;
    const pitches = [...step.pitches];
    pitches[voiceIdx] = moved;
    pitches.sort((a, b) => a - b);
    stopPlay();
    setSteps((prev) => prev.map((s, i) => (i === stepIdx ? { ...s, pitches } : s)));
    void playNotes(pitches, 1);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlay();
      return;
    }
    if (steps.length === 0) return;
    const snapshot = steps;
    const stepMs = (60 / bpm) * 1000 * 2;
    setIsPlaying(true);
    let i = 0;
    const advance = () => {
      if (i >= snapshot.length) i = 0;
      setPlayIndex(i);
      void playNotes(snapshot[i].pitches, (stepMs / 1000) * 0.95);
      i++;
      playTimer.current = window.setTimeout(advance, stepMs);
    };
    advance();
  };

  const handleDone = () => {
    if (steps.length === 0) return;
    const payload = {
      app: "chord-explorer",
      v: 1,
      key: keyRoot,
      mode,
      bpm,
      progression: steps.map((s) => ({
        numeral: nashvilleNumeral(s.chord, keyRoot, mode),
        chord: s.chord.display,
      })),
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    void navigator.clipboard?.writeText(b64);
    toast("The hiker tips their hat — your progression is copied as a journal code.");
  };

  const openSend = () => {
    if (steps.length === 0) return;
    stopPlay();
    setSemis(0);
    setSendOpen(true);
  };

  const confirmSend = () => {
    resetSong();
    setKey(transposeKey(keyRoot, semis), mode);
    setBpm(bpm);
    const patternId = useSongStore.getState().progression[0]?.id;
    if (patternId) {
      steps.forEach((s, i) => {
        addChordToPattern(
          patternId,
          transposeChord(s.chord, semis),
          i * BEATS_PER_CHORD,
          BEATS_PER_CHORD,
        );
      });
    }
    navigate("/app");
  };

  const hasChords = steps.length > 0;
  const pattern = hasChords
    ? steps.map((s) => nashvilleNumeral(s.chord, keyRoot, mode)).join(" – ")
    : "—";

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex max-w-[880px] flex-col gap-3 px-4 pb-20 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              aria-label="Back to home"
              className="btn-sculpt-cream inline-flex h-8 w-8 items-center justify-center rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="font-display text-xl font-bold text-ink-soft">Chord Explorer</span>
          </div>
          {hasChords && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-soft">
                <span>Slots</span>
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={slots}
                  onChange={(e) => {
                    stopPlay();
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setSlots(Math.max(2, Math.min(16, v)));
                  }}
                  className="h-7 w-12 rounded-md border border-border bg-[var(--paper-card)] text-center font-mono-chord text-xs"
                />
              </div>
              <select
                value={keyRoot}
                onChange={(e) => {
                  stopPlay();
                  setKeyRoot(e.target.value);
                }}
                className="h-7 rounded-md border border-border bg-[var(--paper-card)] px-1.5 text-xs font-semibold"
              >
                {NOTES_SHARP.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <div className="flex">
                {(["maj", "min"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      stopPlay();
                      setMode(m);
                    }}
                    className={`h-7 px-2.5 text-xs font-semibold ${
                      m === "maj" ? "rounded-l-md" : "rounded-r-md"
                    } ${
                      mode === m
                        ? "btn-sculpt-amber"
                        : "btn-sculpt-cream"
                    }`}
                  >
                    {m === "maj" ? "Maj" : "Min"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasChords && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-[var(--paper-card)] p-3">
            <button
              type="button"
              onClick={togglePlay}
              className="btn-sculpt-amber inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
            >
              {isPlaying ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {isPlaying ? "Stop" : "Play"}
            </button>
            <span className="w-16 text-sm font-semibold text-ink-soft">{bpm} BPM</span>
            <Slider
              value={[bpm]}
              min={40}
              max={200}
              step={1}
              onValueChange={([v]) => {
                stopPlay();
                setLocalBpm(v);
              }}
            />
          </div>
        )}

        <ProgressionTimeline
          steps={steps}
          keyRoot={keyRoot}
          mode={mode}
          focusIdx={resolvedFocus}
          playIndex={playIndex}
          onFocus={focusStep}
          onRemove={removeStep}
          onSetExtension={setExtension}
          onAddTyped={addTyped}
        />

        <VoiceLeadingChart
          steps={steps}
          focusIdx={resolvedFocus}
          playIndex={playIndex}
          voicingEditIdx={voicingEditIdx}
          keyRoot={keyRoot}
          canEdit={hasChords}
          onToggleEdit={toggleVoicingEdit}
          onMoveVoice={moveVoice}
        />

        <SuggestionPalette
          steps={steps}
          keyRoot={keyRoot}
          mode={mode}
          focusIdx={resolvedFocus}
          slots={slots}
          onAddCandidate={addCandidate}
          onAddStarter={addStarter}
        />

        <div className="flex gap-5 px-1 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
          <div>
            Chords <span className="font-bold text-ink">{steps.length}</span>
          </div>
          <div className="min-w-0 truncate">
            Pattern <span className="font-mono-chord font-bold text-ink">{pattern}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDone}
            disabled={!hasChords}
            className="btn-sculpt-cream inline-flex h-10 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
          >
            Done · Copy Journal
          </button>
          <button
            type="button"
            onClick={openSend}
            disabled={!hasChords}
            className="btn-sculpt-amber inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            Send to Song
          </button>
        </div>
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send progression to a new song</DialogTitle>
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
              <div className="font-display text-2xl font-bold">{transposeKey(keyRoot, semis)}</div>
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
            {steps.map((s) => (
              <span
                key={s.id}
                className="font-mono-chord rounded-md bg-[var(--paper-shade)] px-1.5 py-0.5 text-sm font-bold"
              >
                {transposeChord(s.chord, semis).display}
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
