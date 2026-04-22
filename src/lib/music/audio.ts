// Tone.js audio engine — preset polysynth + ADSR + 3-band EQ + delay/reverb.
import * as Tone from "tone";
import { ChordSymbol, chordToMidi, midiToNoteName } from "./chords";
import { useSoundStore, type ADSR, type EQ3, type FX, type SoundPreset } from "@/store/sound";

let synth: Tone.PolySynth | null = null;
let currentPreset: SoundPreset | null = null;
let eqNode: Tone.EQ3 | null = null;
let delayNode: Tone.FeedbackDelay | null = null;
let reverbNode: Tone.Reverb | null = null;
let masterGain: Tone.Gain | null = null;
let started = false;

type AnySynthOpts = ConstructorParameters<typeof Tone.PolySynth>[1];

function presetVoice(preset: SoundPreset): { voice: any; opts: AnySynthOpts } {
  switch (preset) {
    case "organ":
      return {
        voice: Tone.Synth,
        opts: { oscillator: { type: "fatsine", count: 3, spread: 12 } } as any,
      };
    case "strings":
      return {
        voice: Tone.AMSynth,
        opts: {
          harmonicity: 1.5,
          oscillator: { type: "sawtooth" },
          modulation: { type: "sine" },
        } as any,
      };
    case "pizz":
      return {
        voice: Tone.PluckSynth,
        opts: { attackNoise: 0.5, dampening: 4000, resonance: 0.7 } as any,
      };
    case "kalimba":
      return {
        voice: Tone.FMSynth,
        opts: {
          harmonicity: 8,
          modulationIndex: 2,
          oscillator: { type: "sine" },
          modulation: { type: "sine" },
        } as any,
      };
    case "wurli":
      return {
        voice: Tone.FMSynth,
        opts: {
          harmonicity: 3,
          modulationIndex: 8,
          oscillator: { type: "sine" },
          modulation: { type: "triangle" },
        } as any,
      };
    case "piano":
    default:
      return {
        voice: Tone.Synth,
        opts: { oscillator: { type: "triangle" } } as any,
      };
  }
}

function ensureChain(): {
  synth: Tone.PolySynth;
  eq: Tone.EQ3;
  delay: Tone.FeedbackDelay;
  reverb: Tone.Reverb;
  master: Tone.Gain;
} {
  if (!masterGain) masterGain = new Tone.Gain(1).toDestination();
  if (!reverbNode) {
    reverbNode = new Tone.Reverb({ decay: 2, wet: 0.15 });
    reverbNode.connect(masterGain);
  }
  if (!delayNode) {
    delayNode = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.25, wet: 0 });
    delayNode.connect(reverbNode);
  }
  if (!eqNode) {
    eqNode = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    eqNode.connect(delayNode);
  }
  const settings = useSoundStore.getState();
  if (!synth || currentPreset !== settings.preset) {
    if (synth) {
      try { synth.disconnect(); synth.dispose(); } catch { /* noop */ }
    }
    const { voice, opts } = presetVoice(settings.preset);
    synth = new Tone.PolySynth(voice, opts);
    synth.connect(eqNode);
    currentPreset = settings.preset;
  }
  applySettings(settings);
  return { synth: synth!, eq: eqNode!, delay: delayNode!, reverb: reverbNode!, master: masterGain! };
}

function applyADSR(s: Tone.PolySynth, adsr: ADSR) {
  try {
    s.set({ envelope: { ...adsr } } as any);
  } catch { /* some voices share envelope under different paths */ }
}
function applyEQ(eq: Tone.EQ3, v: EQ3) {
  eq.low.value = v.low;
  eq.mid.value = v.mid;
  eq.high.value = v.high;
}
function applyFX(delay: Tone.FeedbackDelay, reverb: Tone.Reverb, v: FX) {
  delay.wet.value = v.delayWet;
  delay.delayTime.value = v.delayTime;
  delay.feedback.value = v.delayFeedback;
  reverb.wet.value = v.reverbWet;
  // decay can't be set per-frame cheaply; only update when changed.
  if ((reverb as any)._lastDecay !== v.reverbDecay) {
    (reverb as any)._lastDecay = v.reverbDecay;
    reverb.decay = v.reverbDecay;
  }
}
function applySettings(s: { volume: number; adsr: ADSR; eq: EQ3; fx: FX }) {
  if (synth) {
    synth.volume.value = s.volume;
    applyADSR(synth, s.adsr);
  }
  if (eqNode) applyEQ(eqNode, s.eq);
  if (delayNode && reverbNode) applyFX(delayNode, reverbNode, s.fx);
}

export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start();
    started = true;
  }
  ensureChain();
}

// Keep the engine in sync as the user tweaks settings live.
useSoundStore.subscribe((state) => {
  if (!synth) return;
  // Preset change requires rebuilding the polysynth.
  if (currentPreset !== state.preset) {
    ensureChain();
    return;
  }
  applySettings(state);
});

export async function playChord(chord: ChordSymbol, durationSec = 1.2, octave = 4): Promise<void> {
  await ensureAudio();
  const notes = chordToMidi(chord, octave).map((m) => midiToNoteName(m));
  synth!.triggerAttackRelease(notes, durationSec);
}

/**
 * Begin sustaining a chord. Returns a release callback that stops the notes.
 * When the engine's release envelope > 0 the natural decay still applies after
 * release. If the preset has zero sustain (e.g. pizz), the note already decays
 * naturally and release is a no-op for those voices.
 */
export async function holdChord(chord: ChordSymbol, octave = 4): Promise<() => void> {
  await ensureAudio();
  const notes = chordToMidi(chord, octave).map((m) => midiToNoteName(m));
  synth!.triggerAttack(notes);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { synth!.triggerRelease(notes); } catch { /* noop */ }
  };
}

export interface ScheduledChord {
  chord: ChordSymbol;
  /** start time in beats from progression origin */
  startBeat: number;
  /** length in beats */
  lengthBeats: number;
}

export interface PlaybackHandle {
  stop: () => void;
}

let activePart: Tone.Part | null = null;

export interface PlayProgressionOptions {
  /** Fired on the draw loop when a chord begins. `index` matches the original events[] order. */
  onChordStart?: (index: number) => void;
  /** Fired when playback ends naturally (non-looping). */
  onEnd?: () => void;
  /** Loop length in beats. If > 0, the part loops forever (or until stopped). */
  loopBeats?: number;
  /** Octave (default 4). */
  octave?: number;
}

export async function playProgression(
  events: ScheduledChord[],
  bpm: number,
  options: PlayProgressionOptions = {},
): Promise<PlaybackHandle> {
  await ensureAudio();
  stopProgression();

  Tone.getTransport().bpm.value = bpm;
  const synthRef = synth!;
  const { onChordStart, onEnd, loopBeats, octave = 4 } = options;

  type Payload = ScheduledChord & { __index: number };
  const payloads: [number, Payload][] = events.map((e, i) => [
    e.startBeat * (60 / bpm),
    { ...e, __index: i },
  ]);

  const part = new Tone.Part((time, value: Payload) => {
    const notes = chordToMidi(value.chord, octave).map((m) => midiToNoteName(m));
    const durSec = value.lengthBeats * (60 / bpm);
    synthRef.triggerAttackRelease(notes, durSec, time);
    if (onChordStart) {
      Tone.getDraw().schedule(() => onChordStart(value.__index), time);
    }
  }, payloads);

  part.start(0);
  if (loopBeats && loopBeats > 0) {
    part.loop = true;
    part.loopEnd = loopBeats * (60 / bpm);
  } else if (onEnd) {
    const lastEnd = events.reduce((m, e) => Math.max(m, e.startBeat + e.lengthBeats), 0);
    Tone.getTransport().scheduleOnce((time) => {
      Tone.getDraw().schedule(() => onEnd(), time);
    }, lastEnd * (60 / bpm));
  }
  activePart = part;

  Tone.getTransport().start();

  return {
    stop: () => {
      stopProgression();
    },
  };
}

export function stopProgression() {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  if (activePart) {
    activePart.stop();
    activePart.dispose();
    activePart = null;
  }
}
