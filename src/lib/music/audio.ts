// Tone.js audio engine — soft piano polysynth + progression scheduler.
import * as Tone from "tone";
import { ChordSymbol, chordToMidi, midiToNoteName } from "./chords";

let synth: Tone.PolySynth | null = null;
let started = false;

function getSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.4, release: 1.4 },
      volume: -10,
    }).toDestination();
  }
  return synth;
}

export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start();
    started = true;
  }
}

export async function playChord(chord: ChordSymbol, durationSec = 1.2): Promise<void> {
  await ensureAudio();
  const notes = chordToMidi(chord, 4).map((m) => midiToNoteName(m));
  getSynth().triggerAttackRelease(notes, durationSec);
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
}

export async function playProgression(
  events: ScheduledChord[],
  bpm: number,
  options: PlayProgressionOptions = {},
): Promise<PlaybackHandle> {
  await ensureAudio();
  stopProgression();

  Tone.getTransport().bpm.value = bpm;
  const synthRef = getSynth();
  const { onChordStart, onEnd, loopBeats } = options;

  type Payload = ScheduledChord & { __index: number };
  const payloads: [number, Payload][] = events.map((e, i) => [
    e.startBeat * (60 / bpm),
    { ...e, __index: i },
  ]);

  const part = new Tone.Part((time, value: Payload) => {
    const notes = chordToMidi(value.chord, 4).map((m) => midiToNoteName(m));
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
