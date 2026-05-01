// Phase 1.6 — Web Audio synth engine + Tone.Transport scheduler.
//
// Synthesis is 100% raw Web Audio (no Tone.js voices). Tone.js is retained
// only for the Transport / Part scheduling used by playProgression(), since
// it provides accurate look-ahead scheduling and a draw scheduler.
//
// Polyphony is hard-capped at MAX_VOICES; the oldest voices are stolen first.

import * as Tone from "tone";
import { ChordSymbol, chordToMidi, midiToFreq } from "./chords";
import {
  useSoundStore,
  type ADSR,
  type EQ3,
  type FX,
  type SoundSettings,
} from "@/store/sound";
import { getAudioContext, getMasterChain } from "@/lib/audio/context";
import { makeVoice, type Voice } from "@/lib/audio/voices";

// ---- Lifecycle ----
let started = false;

export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start(); // resumes the underlying AudioContext on user gesture
    // Build the chain after the gesture so the AC is in a "running" state.
    getMasterChain();
    started = true;
    applySettings(useSoundStore.getState());
  }
  // Make sure the WebAudio context is also running (Tone shares it).
  const ac = getAudioContext();
  if (ac.state === "suspended") {
    try { await ac.resume(); } catch { /* noop */ }
  }
}

// ---- Settings application ----

function dbToGain(db: number): number { return Math.pow(10, db / 20); }

function applyEQ(eq: EQ3) {
  const c = getMasterChain();
  c.eqLow.gain.setTargetAtTime(eq.low, c.ctx.currentTime, 0.02);
  c.eqMid.gain.setTargetAtTime(eq.mid, c.ctx.currentTime, 0.02);
  c.eqHigh.gain.setTargetAtTime(eq.high, c.ctx.currentTime, 0.02);
}

function divisionToSeconds(div: FX["delayDivision"], bpm: number): number {
  const beat = 60 / bpm;
  switch (div) {
    case "1/4":  return beat;
    case "1/8":  return beat / 2;
    case "1/8.": return (beat / 2) * 1.5;
    case "1/8t": return (beat / 2) * (2 / 3);
    case "1/16": return beat / 4;
  }
}

function applyFX(fx: FX, bpm: number) {
  const c = getMasterChain();
  const now = c.ctx.currentTime;
  // Sends
  c.delaySend.gain.setTargetAtTime(fx.delayWet, now, 0.02);
  c.reverbSend.gain.setTargetAtTime(fx.reverbWet, now, 0.02);
  c.chorusSend.gain.setTargetAtTime(fx.chorusWet, now, 0.02);
  // Delay
  const delaySec = fx.delaySync ? divisionToSeconds(fx.delayDivision, bpm) : fx.delayTime;
  c.delay.delayTime.setTargetAtTime(delaySec, now, 0.05);
  c.delayFb.gain.setTargetAtTime(fx.delayFeedback, now, 0.02);
  // Chorus
  c.chorus.setRate(fx.chorusRate);
  c.chorus.setDepth(fx.chorusDepth);
  // Reverb decay (rebuild IR only when changed)
  if ((c as any)._lastDecay !== fx.reverbDecay) {
    (c as any)._lastDecay = fx.reverbDecay;
    c.setReverbDecay(fx.reverbDecay);
  }
}

function applySettings(s: SoundSettings) {
  if (!started) return;
  const c = getMasterChain();
  c.master.gain.setTargetAtTime(dbToGain(s.volume), c.ctx.currentTime, 0.02);
  applyEQ(s.eq);
  applyFX(s.fx, Tone.getTransport().bpm.value);
}

// Live-update on store changes.
let lastBpm: number | null = null;
useSoundStore.subscribe((state) => {
  if (!started) return;
  applySettings(state);
});

// ---- Voice manager (polyphony cap + auto-cleanup) ----
const MAX_VOICES = 16;
const liveVoices: Voice[] = [];

function reapVoices() {
  const now = getAudioContext().currentTime;
  for (let i = liveVoices.length - 1; i >= 0; i--) {
    if (liveVoices[i].endsAt <= now) {
      try { liveVoices[i].dispose(); } catch { /* noop */ }
      liveVoices.splice(i, 1);
    }
  }
}

function steal(n: number) {
  // Steal the oldest voices (front of array).
  for (let i = 0; i < n && liveVoices.length > 0; i++) {
    const v = liveVoices.shift()!;
    try { v.release(getAudioContext().currentTime); } catch { /* noop */ }
    setTimeout(() => { try { v.dispose(); } catch { /* noop */ } }, 200);
  }
}

function spawnChord(
  chord: ChordSymbol,
  startAt: number,
  releaseAt: number | null,
  octave: number,
): Voice[] {
  const s = useSoundStore.getState();
  const chain = getMasterChain();
  const freqs = chordToMidi(chord, octave).map(midiToFreq);

  reapVoices();
  const need = freqs.length;
  const overflow = (liveVoices.length + need) - MAX_VOICES;
  if (overflow > 0) steal(overflow);

  // Per-voice attenuation when chord is dense (3-note triad ≈ 1.0; 6-note ≈ 0.55).
  const vel = Math.min(1, 1.4 / Math.sqrt(need));
  const made: Voice[] = [];
  for (const f of freqs) {
    const v = makeVoice({
      ctx: chain.ctx,
      destination: chain.voiceBus,
      preset: s.preset,
      timbre: s.timbre,
      adsr: s.adsr,
      freq: f,
      velocity: vel,
    });
    v.start(startAt);
    if (releaseAt !== null) v.release(releaseAt);
    liveVoices.push(v);
    made.push(v);
  }
  return made;
}

// ---- Public API ----

export async function playChord(chord: ChordSymbol, durationSec = 1.2, octave = 4): Promise<void> {
  await ensureAudio();
  const ac = getAudioContext();
  const start = ac.currentTime + 0.005;
  spawnChord(chord, start, start + durationSec, octave);
}

/**
 * Begin sustaining a chord; returns a release callback.
 * If the preset's release > 0 the natural decay still applies after release.
 */
export async function holdChord(chord: ChordSymbol, octave = 4): Promise<() => void> {
  await ensureAudio();
  const ac = getAudioContext();
  const start = ac.currentTime + 0.005;
  const voices = spawnChord(chord, start, null, octave);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const t = getAudioContext().currentTime;
    for (const v of voices) { try { v.release(t); } catch { /* noop */ } }
  };
}

// ---- Progression playback (Tone.Transport scheduled) ----

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
  onChordStart?: (index: number) => void;
  onEnd?: () => void;
  loopBeats?: number;
  octave?: number;
}

export async function playProgression(
  events: ScheduledChord[],
  bpm: number,
  options: PlayProgressionOptions = {},
): Promise<PlaybackHandle> {
  await ensureAudio();
  stopProgression();

  const transport = Tone.getTransport();
  // Optional smooth BPM ramp.
  const ramp = useSoundStore.getState().bpmRamp;
  if (ramp && lastBpm !== null && Math.abs(transport.bpm.value - bpm) > 0.5) {
    transport.bpm.rampTo(bpm, 0.4);
  } else {
    transport.bpm.value = bpm;
  }
  lastBpm = bpm;

  const { onChordStart, onEnd, loopBeats, octave = 4 } = options;
  const ac = getAudioContext();

  type Payload = ScheduledChord & { __index: number };
  const payloads: [number, Payload][] = events.map((e, i) => [
    e.startBeat * (60 / bpm),
    { ...e, __index: i },
  ]);

  const part = new Tone.Part((time, value: Payload) => {
    // Convert Tone "time" (its AudioContext time) to our shared AC time.
    // Since Tone uses the same underlying AudioContext (we never created a
    // separate one — getAudioContext() returns Tone's context after Tone.start),
    // they are equal. But to stay defensive, rebase via Tone.now().
    const offset = time - Tone.now();
    const startAt = ac.currentTime + Math.max(0, offset);
    const durSec = value.lengthBeats * (60 / Tone.getTransport().bpm.value);
    spawnChord(value.chord, startAt, startAt + durSec, octave);
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
    transport.scheduleOnce((time) => {
      Tone.getDraw().schedule(() => onEnd(), time);
    }, lastEnd * (60 / bpm));
  }
  activePart = part;

  transport.start();

  return { stop: () => stopProgression() };
}

export function stopProgression() {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  if (activePart) {
    activePart.stop();
    activePart.dispose();
    activePart = null;
  }
  // Release any sustained voices.
  const t = getAudioContext().currentTime;
  for (const v of liveVoices) { try { v.release(t); } catch { /* noop */ } }
}
