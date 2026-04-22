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

export async function playProgression(
  events: ScheduledChord[],
  bpm: number,
  onTick?: (beat: number) => void,
  loopBeats?: number,
): Promise<PlaybackHandle> {
  await ensureAudio();
  stopProgression();

  Tone.getTransport().bpm.value = bpm;
  const synthRef = getSynth();

  const part = new Tone.Part((time, value: ScheduledChord) => {
    const notes = chordToMidi(value.chord, 4).map((m) => midiToNoteName(m));
    const dur = `${value.lengthBeats * (60 / bpm)}` ;
    synthRef.triggerAttackRelease(notes, dur, time);
  }, events.map((e) => [`0:0:${e.startBeat * 4}`, e]));

  // Use seconds-based scheduling instead — simpler:
  part.dispose();

  const part2 = new Tone.Part((time, value: ScheduledChord) => {
    const notes = chordToMidi(value.chord, 4).map((m) => midiToNoteName(m));
    const durSec = value.lengthBeats * (60 / bpm);
    synthRef.triggerAttackRelease(notes, durSec, time);
  }, events.map((e) => [e.startBeat * (60 / bpm), e]));

  part2.start(0);
  if (loopBeats && loopBeats > 0) {
    part2.loop = true;
    part2.loopEnd = loopBeats * (60 / bpm);
  }
  activePart = part2;

  let raf = 0;
  const tick = () => {
    if (!activePart) return;
    const beat = (Tone.getTransport().seconds / (60 / bpm));
    onTick?.(beat);
    raf = requestAnimationFrame(tick);
  };
  Tone.getTransport().start();
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      cancelAnimationFrame(raf);
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
