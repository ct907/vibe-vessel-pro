// Phase 1.6 — Web Audio synth engine + lookahead scheduler.
//
// Synthesis and scheduling are 100% raw Web Audio. Tone.js is retained only
// for ensureAudio() — it owns the autoplay-policy unlock (Tone.start()) and
// donates its rawContext so any future Tone-using code shares our AC.
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
import { useSongStore } from "@/store/song";
import { getAudioContext, getMasterChain } from "@/lib/audio/context";
import { makeVoice, type Voice } from "@/lib/audio/voices";

// ---- Lifecycle ----
let started = false;

export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start(); // resumes the underlying AudioContext on user gesture
    // Adopt Tone's raw AudioContext so scheduled times line up with Tone.now().
    const raw = Tone.getContext().rawContext as unknown as AudioContext;
    getAudioContext(raw);
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
  applyFX(s.fx, useSongStore.getState().meta.bpm);
}

// Live-update on store changes.
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

// ---- Progression playback (Web Audio lookahead scheduler) ----
//
// Tone.Transport / Tone.Part proved unreliable across stop/restart cycles in
// Tone 15.x: after the first stopProgression(), the Part callback would stop
// firing on subsequent plays even though the Transport reported as started.
// We schedule directly against the shared AudioContext clock instead, mirroring
// the pattern in src/lib/audio/metronome.ts. All state is module-local, so a
// fresh play() always starts from a clean slate.

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

export interface PlayProgressionOptions {
  onChordStart?: (index: number) => void;
  onEnd?: () => void;
  loopBeats?: number;
  octave?: number;
  /** Optional: AudioContext time at which playback should start. */
  startAt?: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

let schedulerTimerId: number | null = null;
let schedEvents: ScheduledChord[] = [];
let schedBpm = 120;
let schedOctave = 4;
let schedOriginAcTime = 0;
let schedLoopBeats: number | null = null;
let schedNextIdx = 0;
let schedOnChordStart: ((index: number) => void) | undefined;
let schedOnEnd: (() => void) | undefined;
let schedEndedScheduled = false;

function clearScheduler() {
  if (schedulerTimerId != null) {
    clearTimeout(schedulerTimerId);
    schedulerTimerId = null;
  }
  schedEvents = [];
  schedLoopBeats = null;
  schedNextIdx = 0;
  schedOnChordStart = undefined;
  schedOnEnd = undefined;
  schedEndedScheduled = false;
}

function tick() {
  if (!schedEvents.length) return;
  const ctx = getAudioContext();
  const beatSec = 60 / schedBpm;
  const horizon = ctx.currentTime + SCHEDULE_AHEAD_S;

  while (schedNextIdx < schedEvents.length) {
    const ev = schedEvents[schedNextIdx];
    const eventAt = schedOriginAcTime + ev.startBeat * beatSec;
    if (eventAt >= horizon) break;
    const durSec = ev.lengthBeats * beatSec;
    const safeStart = Math.max(ctx.currentTime, eventAt);
    spawnChord(ev.chord, safeStart, safeStart + durSec, ev.chord.octave ?? schedOctave);
    if (schedOnChordStart) {
      const idx = schedNextIdx;
      const delayMs = Math.max(0, (eventAt - ctx.currentTime) * 1000);
      const cb = schedOnChordStart;
      window.setTimeout(() => cb(idx), delayMs);
    }
    schedNextIdx++;
  }

  if (schedNextIdx >= schedEvents.length) {
    if (schedLoopBeats != null && schedLoopBeats > 0) {
      schedOriginAcTime += schedLoopBeats * beatSec;
      schedNextIdx = 0;
    } else if (schedOnEnd && !schedEndedScheduled) {
      schedEndedScheduled = true;
      const lastEnd = schedEvents.reduce(
        (m, e) => Math.max(m, e.startBeat + e.lengthBeats),
        0,
      );
      const endAt = schedOriginAcTime + lastEnd * beatSec;
      const delayMs = Math.max(0, (endAt - ctx.currentTime) * 1000);
      const cb = schedOnEnd;
      window.setTimeout(() => cb(), delayMs);
    }
  }

  schedulerTimerId = window.setTimeout(tick, LOOKAHEAD_MS);
}

export async function playProgression(
  events: ScheduledChord[],
  bpm: number,
  options: PlayProgressionOptions = {},
): Promise<PlaybackHandle> {
  await ensureAudio();
  stopProgression();

  const { onChordStart, onEnd, loopBeats, octave = 4, startAt } = options;
  const ctx = getAudioContext();

  schedEvents = events;
  schedBpm = bpm;
  schedOctave = octave;
  schedOriginAcTime = startAt != null ? startAt : ctx.currentTime + 0.04;
  schedLoopBeats = loopBeats && loopBeats > 0 ? loopBeats : null;
  schedNextIdx = 0;
  schedOnChordStart = onChordStart;
  schedOnEnd = onEnd;
  schedEndedScheduled = false;

  tick();

  return { stop: () => stopProgression() };
}

export function stopProgression() {
  clearScheduler();
  const ctx = getAudioContext();
  const t = Math.max(0, ctx.currentTime);
  for (const v of liveVoices) { try { v.release(t); } catch { /* noop */ } }
}
