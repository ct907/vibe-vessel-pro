import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Mic, Play, RotateCcw, Square, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { pcToName, midiToNoteName } from "@/lib/music/chords";
import { playNotes } from "@/lib/music/audio";
import { useSongStore } from "@/store/song";
import { startPitchDetection, type PitchHandle, type PitchResult } from "@/lib/audio/pitch-detector";

// ─── Music theory helpers ────────────────────────────────────────────────────

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12] as const;

function keyFromMidi(midi: number, offset = 0): { pc: number; root: string; useFlat: boolean } {
  const pc = ((midi + offset) % 12 + 12) % 12;
  const useFlat = [1, 3, 6, 8, 10].includes(pc); // Db Eb Gb Ab Bb
  return { pc, root: pcToName(pc, useFlat), useFlat };
}

function scaleMidisForKey(rootPc: number, octave = 4): number[] {
  const base = 12 * (octave + 1) + rootPc;
  return MAJOR_INTERVALS.map((iv) => base + iv);
}

// ─── Voice type data ─────────────────────────────────────────────────────────

interface VoiceTypeData {
  name: string;
  rangeDisplay: string;
  color: string; // Tailwind class or CSS colour for the badge
  subcategories: string[];
  famousSingers: string[];
  description: string;
}

const VOICE_TYPES: Record<string, VoiceTypeData> = {
  soprano: {
    name: "Soprano",
    rangeDisplay: "C4 – C6",
    color: "oklch(0.88 0.07 350)",
    subcategories: ["Coloratura Soprano", "Lyric Soprano", "Spinto Soprano", "Dramatic Soprano"],
    famousSingers: ["Mariah Carey", "Whitney Houston", "Ariana Grande", "Celine Dion", "Christina Aguilera"],
    description: "The highest female voice. Bright, pure tone with the ability to soar into the upper register.",
  },
  mezzo: {
    name: "Mezzo-Soprano",
    rangeDisplay: "A3 – A5",
    color: "oklch(0.88 0.08 60)",
    subcategories: ["Lyric Mezzo-Soprano", "Dramatic Mezzo-Soprano", "Coloratura Mezzo-Soprano"],
    famousSingers: ["Amy Winehouse", "Adele", "Alicia Keys", "Sade", "Norah Jones"],
    description: "Warmer and deeper than a soprano, with a rich, characterful middle register.",
  },
  contralto: {
    name: "Contralto",
    rangeDisplay: "E3 – E5",
    color: "oklch(0.88 0.07 170)",
    subcategories: ["Lyric Contralto", "Dramatic Contralto"],
    famousSingers: ["Tracy Chapman", "Nina Simone", "Toni Braxton", "Cher", "Alanis Morissette"],
    description: "The lowest and rarest female voice. Deep, rich, and resonant in its lower register.",
  },
  tenor: {
    name: "Tenor",
    rangeDisplay: "C3 – C5",
    color: "oklch(0.88 0.07 230)",
    subcategories: ["Lyric Tenor", "Dramatic Tenor", "Heldentenor", "Countertenor"],
    famousSingers: ["Freddie Mercury", "Bruno Mars", "Michael Jackson", "Ed Sheeran", "Justin Timberlake"],
    description: "The highest common male voice. Associated with passionate, brilliant high notes.",
  },
  baritone: {
    name: "Baritone",
    rangeDisplay: "G2 – G4",
    color: "oklch(0.88 0.07 280)",
    subcategories: ["Lyric Baritone", "Kavalierbariton", "Dramatic Baritone", "Bass-Baritone"],
    famousSingers: ["Frank Sinatra", "Elvis Presley", "David Bowie", "Jim Morrison", "Tom Waits"],
    description: "The most common male voice. Combines warm low register with power above.",
  },
  bass: {
    name: "Bass",
    rangeDisplay: "E2 – E4",
    color: "oklch(0.85 0.05 40)",
    subcategories: ["Lyric Bass (Basso Cantante)", "Basso Profondo", "Basso Buffo", "Bass-Baritone"],
    famousSingers: ["Barry White", "Johnny Cash", "Nick Cave", "Leonard Cohen", "Peter Steele"],
    description: "The lowest and most powerful male voice. Rich, resonant depth in the low register.",
  },
};

function classifyVoice(lowMidi: number, highMidi: number): VoiceTypeData {
  // Female range: high note typically >= 65 (F4)
  const isFemaleRange = highMidi >= 65;
  if (isFemaleRange) {
    if (highMidi >= 77) return VOICE_TYPES.soprano;
    if (highMidi >= 70) return VOICE_TYPES.mezzo;
    return VOICE_TYPES.contralto;
  }
  if (highMidi >= 60) return VOICE_TYPES.tenor;
  if (highMidi >= 53) return VOICE_TYPES.baritone;
  return VOICE_TYPES.bass;
}

// ─── Tuner needle display ─────────────────────────────────────────────────────

function TunerDisplay({ pitch, stabilityProgress }: { pitch: PitchResult | null; stabilityProgress: number }) {
  const cents = pitch?.cents ?? 0;
  // Map cents -50..+50 to 0..100%
  const needleLeft = `${50 + Math.max(-48, Math.min(48, cents))}%`;
  const inTune = pitch !== null && Math.abs(cents) <= 20;

  return (
    <div className="flex flex-col items-center gap-3 py-4 select-none">
      {pitch ? (
        <>
          <div
            className="text-6xl font-mono-chord font-bold transition-all duration-75"
            style={{ color: inTune ? "var(--primary)" : "var(--ink)" }}
          >
            {pitch.noteName}
          </div>
          <div className="text-sm text-[var(--ink-soft)] tabular-nums">{pitch.freq.toFixed(1)} Hz</div>

          {/* Cents needle */}
          <div className="w-full max-w-xs">
            <div className="relative h-3 rounded-full bg-[var(--paper-shade)] overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-0.5 rounded-full transition-all duration-75"
                style={{
                  left: needleLeft,
                  background: inTune ? "var(--primary)" : "var(--ink-soft)",
                  transform: "translateX(-50%)",
                }}
              />
              {/* centre line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2 opacity-50" />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--ink-soft)] mt-0.5 px-0.5">
              <span>♭ flat</span>
              <span>in tune</span>
              <span>sharp ♯</span>
            </div>
          </div>

          {/* Stability progress bar */}
          {stabilityProgress > 0 && (
            <div className="w-full max-w-xs">
              <div className="h-1.5 rounded-full bg-[var(--paper-shade)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-100"
                  style={{ width: `${stabilityProgress * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-center text-[var(--ink-soft)] mt-1">
                {stabilityProgress < 1 ? "Hold it steady…" : "Key locked!"}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="text-4xl font-mono-chord text-[var(--ink-soft)]">—</div>
          <p className="text-sm text-[var(--ink-soft)]">Listening for a note…</p>
        </div>
      )}
    </div>
  );
}

// ─── Range result bar ─────────────────────────────────────────────────────────

function RangeBar({ lowMidi, highMidi }: { lowMidi: number; highMidi: number }) {
  const span = highMidi - lowMidi;
  const octaves = (span / 12).toFixed(1);
  const semitones = span;
  const low = midiToNoteName(lowMidi);
  const high = midiToNoteName(highMidi);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2">
        <span className="font-mono-chord text-sm font-semibold w-10 text-right">{low}</span>
        <div className="flex-1 h-3 rounded-full bg-[var(--paper-shade)] relative overflow-hidden">
          <div className="absolute inset-0 rounded-full" style={{ background: "var(--primary)", opacity: 0.7 }} />
        </div>
        <span className="font-mono-chord text-sm font-semibold w-10">{high}</span>
      </div>
      <p className="text-center text-xs text-[var(--ink-soft)]">
        {octaves} octaves · {semitones} semitones
      </p>
    </div>
  );
}

// ─── Note chip ────────────────────────────────────────────────────────────────

function NoteChip({ label, midi, isRoot }: { label: string; midi: number; isRoot: boolean }) {
  const [active, setActive] = useState(false);
  const play = () => {
    setActive(true);
    playNotes([midi], 0.7).then(() => setActive(false));
    setTimeout(() => setActive(false), 700);
  };

  return (
    <button
      type="button"
      onClick={play}
      className={cn(
        "font-mono-chord text-sm font-semibold rounded-lg px-3 py-1.5 transition-all",
        isRoot
          ? "btn-sculpt-amber"
          : "btn-sculpt-cream",
        active && "scale-95",
      )}
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const STABILITY_FRAMES = 80; // ~1.3 s at ~60 fps
const NOTE_GAP_MS = 480;
const NOTE_DUR_SEC = 0.42;

export function VoiceKeyTab() {
  const navigate = useNavigate();
  const setSongKey = useSongStore((s) => s.setKey);

  // ── Key finder state ──────────────────────────────────────────────────────
  type KeyState = "idle" | "listening" | "locked";
  const [keyState, setKeyState] = useState<KeyState>("idle");
  const [currentPitch, setCurrentPitch] = useState<PitchResult | null>(null);
  const [lockedMidi, setLockedMidi] = useState<number | null>(null);
  const [transposeOffset, setTransposeOffset] = useState(0);
  const [isPlayingScale, setIsPlayingScale] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState(0);

  const pitchHandleRef = useRef<PitchHandle | null>(null);
  const stabilityBufRef = useRef<number[]>([]);
  const keyStateRef = useRef<KeyState>("idle");
  const scaleTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setKeyStateBoth = (s: KeyState) => {
    keyStateRef.current = s;
    setKeyState(s);
  };

  // ── Derived key values ─────────────────────────────────────────────────────
  const { pc: keyPc, root: keyRoot, useFlat } = useMemo(
    () => (lockedMidi !== null ? keyFromMidi(lockedMidi, transposeOffset) : { pc: 0, root: "C", useFlat: false }),
    [lockedMidi, transposeOffset],
  );

  const scaleMidis = useMemo(
    () => (lockedMidi !== null ? scaleMidisForKey(keyPc) : []),
    [lockedMidi, keyPc],
  );

  const scaleNoteNames = useMemo(
    () =>
      MAJOR_INTERVALS.map((iv) => {
        const pc = (keyPc + iv) % 12;
        return pcToName(pc, useFlat);
      }),
    [keyPc, useFlat],
  );

  // ── Pitch callback (runs at ~60 fps from RAF, so use refs for stable access) ──
  const onPitch = useCallback((result: PitchResult | null) => {
    setCurrentPitch(result);
    if (keyStateRef.current !== "listening") return;

    if (result === null) {
      stabilityBufRef.current = [];
      setStabilityProgress(0);
      return;
    }

    const buf = stabilityBufRef.current;
    buf.push(result.midi);
    if (buf.length > STABILITY_FRAMES) buf.shift();

    // Check stability: all readings within 2-semitone window
    if (buf.length >= 20) {
      let mn = buf[0];
      let mx = buf[0];
      for (let i = 1; i < buf.length; i++) {
        if (buf[i] < mn) mn = buf[i];
        if (buf[i] > mx) mx = buf[i];
      }
      const stable = mx - mn <= 2;
      if (stable) {
        setStabilityProgress(buf.length / STABILITY_FRAMES);
        if (buf.length >= STABILITY_FRAMES) {
          // Find mode (most common MIDI value)
          const counts = new Map<number, number>();
          for (const m of buf) counts.set(m, (counts.get(m) ?? 0) + 1);
          let mode = buf[0];
          let best = 0;
          for (const [m, c] of counts) {
            if (c > best) { best = c; mode = m; }
          }
          // Lock!
          setKeyStateBoth("locked");
          setLockedMidi(mode);
          setTransposeOffset(0);
          pitchHandleRef.current?.stop();
          pitchHandleRef.current = null;
          stabilityBufRef.current = [];
          setStabilityProgress(0);
          setCurrentPitch(null);
        }
      } else {
        setStabilityProgress(0);
      }
    }
  }, []);

  const startListening = async () => {
    setMicError(null);
    setKeyStateBoth("listening");
    stabilityBufRef.current = [];
    setStabilityProgress(0);
    setCurrentPitch(null);
    try {
      const handle = await startPitchDetection(onPitch);
      pitchHandleRef.current = handle;
    } catch {
      setMicError("Microphone access denied. Please allow microphone access and try again.");
      setKeyStateBoth("idle");
    }
  };

  const stopListening = () => {
    pitchHandleRef.current?.stop();
    pitchHandleRef.current = null;
    setKeyStateBoth("idle");
    setCurrentPitch(null);
    setStabilityProgress(0);
    stabilityBufRef.current = [];
  };

  const resetKey = () => {
    stopListening();
    setLockedMidi(null);
    setTransposeOffset(0);
    setIsPlayingScale(false);
    scaleTimeoutsRef.current.forEach(clearTimeout);
  };

  const playScale = () => {
    if (isPlayingScale || scaleMidis.length === 0) return;
    setIsPlayingScale(true);
    scaleTimeoutsRef.current.forEach(clearTimeout);
    const notes = [...scaleMidis];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < notes.length; i++) {
      const t = setTimeout(
        () => {
          void playNotes([notes[i]], NOTE_DUR_SEC);
          if (i === notes.length - 1) {
            setTimeout(() => setIsPlayingScale(false), NOTE_DUR_SEC * 1000 + 100);
          }
        },
        i * NOTE_GAP_MS,
      );
      timeouts.push(t);
    }
    scaleTimeoutsRef.current = timeouts;
  };

  const applyKeyToSong = () => {
    setSongKey(keyRoot, "maj");
    navigate("/app");
  };

  // ── Vocal range state ─────────────────────────────────────────────────────
  type RangeStep = "idle" | "measuring-high" | "done-high" | "measuring-low" | "complete";
  const [rangeStep, setRangeStep] = useState<RangeStep>("idle");
  const [highMidi, setHighMidi] = useState<number | null>(null);
  const [lowMidi, setLowMidi] = useState<number | null>(null);
  const [rangeCountdown, setRangeCountdown] = useState(3);
  const [rangePitch, setRangePitch] = useState<PitchResult | null>(null);
  const rangePitchHandleRef = useRef<PitchHandle | null>(null);
  const rangePitchesRef = useRef<number[]>([]);

  const startRangeMeasurement = async (which: "high" | "low") => {
    setRangeStep(which === "high" ? "measuring-high" : "measuring-low");
    setRangeCountdown(3);
    rangePitchesRef.current = [];
    setRangePitch(null);

    const countdownRef: { id: ReturnType<typeof setInterval> | null } = { id: null };
    countdownRef.id = setInterval(() => {
      setRangeCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    try {
      const handle = await startPitchDetection((result) => {
        setRangePitch(result);
        if (result) rangePitchesRef.current.push(result.midi);
      });
      rangePitchHandleRef.current = handle;

      setTimeout(() => {
        clearInterval(countdownRef.id);
        handle.stop();
        rangePitchHandleRef.current = null;
        setRangePitch(null);

        const pitches = rangePitchesRef.current;
        if (pitches.length > 5) {
          const sorted = [...pitches].sort((a, b) => a - b);
          if (which === "high") {
            const idx = Math.floor(sorted.length * 0.85);
            setHighMidi(sorted[idx]);
            setRangeStep("done-high");
          } else {
            const idx = Math.floor(sorted.length * 0.15);
            setLowMidi(sorted[idx]);
            setRangeStep("complete");
          }
        } else {
          setRangeStep(which === "high" ? "idle" : "done-high");
        }
      }, 3100);
    } catch {
      clearInterval(countdownRef.id);
      setRangeStep(which === "high" ? "idle" : "done-high");
      setMicError("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const resetRange = () => {
    rangePitchHandleRef.current?.stop();
    rangePitchHandleRef.current = null;
    setRangeStep("idle");
    setHighMidi(null);
    setLowMidi(null);
    setRangePitch(null);
    setRangeCountdown(3);
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pitchHandleRef.current?.stop();
      rangePitchHandleRef.current?.stop();
      scaleTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // ── Voice type result ─────────────────────────────────────────────────────
  const voiceType =
    rangeStep === "complete" && highMidi !== null && lowMidi !== null
      ? classifyVoice(lowMidi, highMidi)
      : null;

  const isMeasuringRange =
    rangeStep === "measuring-high" || rangeStep === "measuring-low";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper text-foreground">
      {/* Header */}
      <div className="relative mt-6 mb-4 px-4 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to home"
          className="btn-sculpt-cream absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-display font-bold text-center px-12">
          Find Your Key & Vocal Range
        </h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-24 space-y-6">

        {/* ─── Key Finder Card ───────────────────────────────────────────── */}
        <section className="rounded-xl bg-[var(--paper-card)] shadow-[var(--shadow-card)] p-6">
          <h2 className="text-lg font-semibold mb-1">Find Your Song Key</h2>
          <p className="text-sm text-[var(--ink-soft)] mb-4">
            {keyState === "idle" && "Hum or sing a comfortable note — hold it steady for about 3 seconds and we'll lock in your key."}
            {keyState === "listening" && "Hold the note steady. The bar fills as we detect stability…"}
            {keyState === "locked" && `Key of ${keyRoot} Major detected. Play the scale below or transpose if needed.`}
          </p>

          {micError && (
            <p className="text-sm text-destructive mb-3">{micError}</p>
          )}

          {keyState === "idle" && (
            <button
              type="button"
              className="btn-sculpt-amber inline-flex items-center gap-2 rounded-lg h-10 px-5 text-sm font-semibold"
              onClick={startListening}
            >
              <Mic className="h-4 w-4" /> Start Listening
            </button>
          )}

          {keyState === "listening" && (
            <div className="space-y-2">
              <TunerDisplay pitch={currentPitch} stabilityProgress={stabilityProgress} />
              <button
                type="button"
                className="btn-sculpt-cream inline-flex items-center gap-2 rounded-lg h-9 px-4 text-sm font-semibold"
                onClick={stopListening}
              >
                Cancel
              </button>
            </div>
          )}

          {keyState === "locked" && lockedMidi !== null && (
            <div className="space-y-5">
              {/* Key display */}
              <div className="flex items-center gap-3">
                <div
                  className="rounded-lg px-4 py-2 font-mono-chord text-2xl font-bold"
                  style={{ background: "var(--primary-halo)", color: "var(--primary-strong)" }}
                >
                  {keyRoot}
                </div>
                <div className="text-[var(--ink-soft)] text-sm">
                  Major<br />
                  <span className="text-xs">{scaleNoteNames.slice(0, 7).join("  ")}</span>
                </div>
              </div>

              {/* Scale note chips */}
              <div>
                <p className="text-xs text-[var(--ink-soft)] mb-2 uppercase tracking-wide font-semibold">
                  Tap a note to hear it
                </p>
                <div className="flex flex-wrap gap-2">
                  {scaleNoteNames.map((name, i) => (
                    <NoteChip
                      key={i}
                      label={name}
                      midi={scaleMidis[i]}
                      isRoot={i === 0 || i === 7}
                    />
                  ))}
                </div>
              </div>

              {/* Play scale + transpose */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-sculpt-amber inline-flex items-center gap-2 rounded-lg h-9 px-4 text-sm font-semibold"
                  onClick={isPlayingScale ? () => { scaleTimeoutsRef.current.forEach(clearTimeout); setIsPlayingScale(false); } : playScale}
                >
                  {isPlayingScale ? <><Square className="h-3.5 w-3.5" /> Stop</> : <><Play className="h-3.5 w-3.5" /> Play Scale</>}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Transpose down"
                    className="btn-sculpt-cream inline-flex items-center justify-center rounded-full h-8 w-8 font-bold text-base"
                    onClick={() => setTransposeOffset((n) => n - 1)}
                  >
                    −
                  </button>
                  <span className="font-mono-chord text-sm w-8 text-center tabular-nums">
                    {transposeOffset > 0 ? `+${transposeOffset}` : String(transposeOffset)}
                  </span>
                  <button
                    type="button"
                    aria-label="Transpose up"
                    className="btn-sculpt-cream inline-flex items-center justify-center rounded-full h-8 w-8 font-bold text-base"
                    onClick={() => setTransposeOffset((n) => n + 1)}
                  >
                    +
                  </button>
                  <span className="text-xs text-[var(--ink-soft)] ml-1">semitones</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                <button
                  type="button"
                  className="btn-sculpt-cream inline-flex items-center gap-2 rounded-lg h-9 px-4 text-sm font-semibold"
                  onClick={resetKey}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Try Again
                </button>
                <button
                  type="button"
                  className="btn-sculpt-amber inline-flex items-center gap-2 rounded-lg h-9 px-4 text-sm font-semibold"
                  onClick={applyKeyToSong}
                >
                  Use {keyRoot} Major in My Song <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ─── Vocal Range Card ──────────────────────────────────────────── */}
        <section className="rounded-xl bg-[var(--paper-card)] shadow-[var(--shadow-card)] p-6">
          <h2 className="text-lg font-semibold mb-1">Your Vocal Range</h2>
          <p className="text-sm text-[var(--ink-soft)] mb-5">
            Sing your highest and lowest comfortable notes. Hold each for about 3 seconds.
          </p>

          {/* Step 1: Highest note */}
          <div className="space-y-2 mb-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              1. Sing your highest note
            </h3>
            <p className="text-sm text-[var(--ink-soft)]">
              Hum the highest note you can comfortably sustain.
            </p>

            {rangeStep === "measuring-high" ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-semibold">Listening… {rangeCountdown}s</span>
                </div>
                <TunerDisplay pitch={rangePitch} stabilityProgress={0} />
              </div>
            ) : highMidi !== null ? (
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-semibold text-sm">✓</span>
                <span className="font-mono-chord font-bold text-lg">{midiToNoteName(highMidi)}</span>
                {rangeStep !== "complete" && (
                  <button
                    type="button"
                    className="btn-sculpt-cream inline-flex items-center gap-1 rounded-md h-7 px-3 text-xs font-semibold ml-2"
                    onClick={() => { setHighMidi(null); setRangeStep("idle"); }}
                  >
                    <RotateCcw className="h-3 w-3" /> Redo
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="btn-sculpt-cream inline-flex items-center gap-2 rounded-lg h-10 px-5 text-sm font-semibold"
                onClick={() => startRangeMeasurement("high")}
                disabled={isMeasuringRange}
              >
                <Mic className="h-4 w-4" /> Record Highest Note
              </button>
            )}
          </div>

          {/* Step 2: Lowest note — show only after high is done */}
          {(rangeStep === "done-high" || rangeStep === "measuring-low" || rangeStep === "complete") && (
            <div className="space-y-2 mb-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
                2. Sing your lowest note
              </h3>
              <p className="text-sm text-[var(--ink-soft)]">
                Now hum the lowest note you can comfortably sustain.
              </p>

              {rangeStep === "measuring-low" ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-semibold">Listening… {rangeCountdown}s</span>
                  </div>
                  <TunerDisplay pitch={rangePitch} stabilityProgress={0} />
                </div>
              ) : lowMidi !== null ? (
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold text-sm">✓</span>
                  <span className="font-mono-chord font-bold text-lg">{midiToNoteName(lowMidi)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-sculpt-cream inline-flex items-center gap-2 rounded-lg h-10 px-5 text-sm font-semibold"
                  onClick={() => startRangeMeasurement("low")}
                  disabled={isMeasuringRange}
                >
                  <Mic className="h-4 w-4" /> Record Lowest Note
                </button>
              )}
            </div>
          )}

          {/* Results */}
          {rangeStep === "complete" && highMidi !== null && lowMidi !== null && voiceType && (
            <div className="space-y-5 pt-4 border-t border-border">
              <RangeBar
                lowMidi={Math.min(lowMidi, highMidi)}
                highMidi={Math.max(lowMidi, highMidi)}
              />

              {/* Voice type badge + description */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: voiceType.color }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Voice Type</p>
                    <p className="text-2xl font-display font-bold">{voiceType.name}</p>
                    <p className="text-xs text-[var(--ink-soft)]">Typical range: {voiceType.rangeDisplay}</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--ink)]">{voiceType.description}</p>
              </div>

              {/* Subcategories */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] mb-2">
                  Subcategories
                </p>
                <div className="flex flex-wrap gap-2">
                  {voiceType.subcategories.map((sub) => (
                    <span
                      key={sub}
                      className="text-xs font-semibold rounded-md px-2.5 py-1 bg-[var(--paper-shade)]"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>

              {/* Famous singers */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] mb-2">
                  Famous {voiceType.name}s
                </p>
                <div className="flex flex-wrap gap-2">
                  {voiceType.famousSingers.map((name) => (
                    <span
                      key={name}
                      className="text-xs font-medium rounded-md px-2.5 py-1"
                      style={{ background: voiceType.color }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-sculpt-cream inline-flex items-center gap-2 rounded-lg h-9 px-4 text-sm font-semibold"
                onClick={resetRange}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Test Again
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
