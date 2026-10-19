// Phase 1.6 — Web Audio synth engine + lookahead scheduler.
//
// Synthesis and scheduling are 100% raw Web Audio. Tone.js is retained only
// for ensureAudio() — it owns the autoplay-policy unlock (Tone.start()) and
// donates its rawContext so any future Tone-using code shares our AC.
//
// Polyphony is capped at MAX_VOICES; the quietest voice at a new note's start is stolen.

import * as Tone from "tone";
import { ChordSymbol, chordToMidi, midiToFreq } from "./chords";
import {
  useSoundStore,
  type ADSR,
  type ArpRepeat,
  type ArpSettings,
  type BassRepeat,
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
    const Ctor: typeof AudioContext =
      (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const preCtx = new Ctor({ latencyHint: "playback" });
    Tone.setContext(new Tone.Context(preCtx));
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
//
// Notes are scheduled ahead of time, so every decision is made at the note's
// own start time T rather than "now": what is still audible at T, which voice
// is quietest at T, and when a stolen voice has to be silent (by T).

type Owner = "transport" | "audition";

interface LiveVoice {
  v: Voice;
  owner: Owner;
  freq: number;
  /** Held chord chips: released by the caller, never stolen. */
  held: boolean;
}

const MAX_VOICES = 20;
/** Below this (~-60 dB of the voice's peak) a voice no longer counts as playing. */
const AUDIBLE = 0.001;
const STEAL_FADE = 0.025;
const liveVoices: LiveVoice[] = [];

/** Read by the browser test harness. */
export const audioStats = { audibleSteals: 0, peakVoices: 0 };

function reapVoices() {
  const now = getAudioContext().currentTime;
  for (let i = liveVoices.length - 1; i >= 0; i--) {
    if (liveVoices[i].v.endsAt <= now) {
      liveVoices[i].v.dispose();
      liveVoices.splice(i, 1);
    }
  }
}

function makeRoom(at: number, freq: number, owner: Owner) {
  reapVoices();
  const now = getAudioContext().currentTime;
  const { attack } = useSoundStore.getState().adsr;
  // A re-struck pitch replaces its own ringing tail, like a re-struck string.
  // The old note crossfades over the new note's attack so slow pads don't dip.
  for (const l of liveVoices) {
    if (l.owner === owner && !l.held && Math.abs(l.freq - freq) < 0.01
        && l.v.startsAt < at && l.v.endsAt > at) {
      l.v.release(at, Math.max(0.02, attack));
    }
  }
  const sounding = liveVoices.filter((l) => l.v.levelAt(at) > AUDIBLE);
  audioStats.peakVoices = Math.max(audioStats.peakVoices, sounding.length + 1);
  const candidates = sounding.filter((l) => !l.held).sort((a, b) => a.v.levelAt(at) - b.v.levelAt(at));
  for (let n = sounding.length + 1 - MAX_VOICES; n > 0 && candidates.length; n--) {
    const victim = candidates.shift()!;
    if (victim.v.levelAt(at) > 0.01) audioStats.audibleSteals++;
    const from = Math.max(now, at - STEAL_FADE);
    victim.v.release(from, at - from);
  }
}

function spawnNote(
  freq: number,
  startAt: number,
  releaseAt: number | null,
  velocity: number,
  owner: Owner = "transport",
): Voice {
  makeRoom(startAt, freq, owner);
  const s = useSoundStore.getState();
  const chain = getMasterChain();
  const v = makeVoice({
    ctx: chain.ctx,
    destination: chain.voiceBus,
    preset: s.preset,
    timbre: s.timbre,
    adsr: s.adsr,
    freq,
    velocity,
  });
  v.start(startAt);
  if (releaseAt !== null) v.release(releaseAt);
  liveVoices.push({ v, owner, freq, held: releaseAt === null });
  return v;
}

function spawnChord(
  chord: ChordSymbol,
  startAt: number,
  releaseAt: number | null,
  octave: number,
  owner: Owner = "transport",
): Voice[] {
  const freqs = chordToMidi(chord, octave).map(midiToFreq);
  // Per-voice attenuation when chord is dense (3-note triad ≈ 1.0; 6-note ≈ 0.55).
  const vel = Math.min(1, 1.4 / Math.sqrt(freqs.length));
  return freqs.map((f) => spawnNote(f, startAt, releaseAt, vel, owner));
}

// ---- Arpeggio expansion ----

const ARP_STEP_BEATS: Record<ArpRepeat, number> = {
  "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25, "1/32": 0.125,
};
const BASS_STEP_BEATS: Record<BassRepeat, number> = {
  "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25,
};

/**
 * Build the ordered MIDI step list for a directional arp pattern.
 * Notes are pre-sorted low→high. Turnarounds drop the repeated endpoints.
 */
function buildStepNotes(
  notes: number[],
  pattern: ArpSettings["pattern"],
): number[] {
  if (notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) => a - b);
  switch (pattern) {
    case "asc":  return sorted;
    case "desc": return [...sorted].reverse();
    case "ascDesc": {
      if (sorted.length < 2) return sorted;
      return [...sorted, ...sorted.slice(1, -1).reverse()];
    }
    case "descAsc": {
      if (sorted.length < 2) return sorted;
      const desc = [...sorted].reverse();
      return [...desc, ...desc.slice(1, -1).reverse()];
    }
    case "random":
    case "all":
    default:
      return sorted;
  }
}

/**
 * DAW-convention swing: slider 0.5 = straight; 0.5..0.75 delays the off-beat
 * step. Within a 2-step pair, the second step (odd index) is delayed by
 * `swingAmount * stepSec` where swingAmount = (swing - 0.5) / 0.5 * (1/3).
 * 0.75 → 1/3 of a step (full triplet swing on the off-beat).
 */
function swingDelay(stepIndex: number, stepSec: number, swing: number): number {
  if (stepIndex % 2 === 0) return 0;
  const s = Math.max(0.5, Math.min(0.75, swing));
  return ((s - 0.5) / 0.5) * (stepSec / 3);
}

/**
 * Schedule one chord event as an arp + optional bass.
 * Honors per-section disarm via `armed`. Returns true if arp path was used.
 */
const TRIPLET_SUBDIVS = new Set<ArpRepeat>(["1/8", "1/16", "1/32"]);

function spawnArpForEvent(
  chord: ChordSymbol,
  startAt: number,
  lengthSec: number,
  octave: number,
  arp: ArpSettings,
  beatSec: number,
  triplet: boolean,
): void {
  const allMidi = chordToMidi(chord, octave);
  const hasSlashBass = !!chord.bass;
  // chordToMidi puts slash-bass at notes[0] (octave below). Split it out.
  const slashBassMidi = hasSlashBass ? allMidi[0] : null;
  const melodyAll = hasSlashBass ? allMidi.slice(1) : allMidi;
  // Quality intervals always start at 0, so the chord root sits at melodyAll[0].
  const chordRootMidi = melodyAll[0];

  let bassMidi: number | null = null;
  let melody = melodyAll;
  if (hasSlashBass) {
    // Slash bass overrides Bass Note Mode regardless of arp setting.
    bassMidi = slashBassMidi;
    // The slash bass note doesn't appear in the arp melody — it's already excluded.
  } else if (arp.bassMode === "bass" || arp.bassMode === "bassArp") {
    bassMidi = chordRootMidi - 12;
    if (arp.bassMode === "bass") {
      melody = melodyAll.filter((m) => m !== chordRootMidi);
    }
  }

  // ---- Bass scheduling ----
  if (bassMidi != null) {
    const bassFreq = midiToFreq(bassMidi);
    const repeatKey: BassRepeat =
      hasSlashBass && arp.bassMode === "off" ? "1" : arp.bassRepeat;
    const stepSec = BASS_STEP_BEATS[repeatKey] * beatSec;
    if (stepSec >= lengthSec) {
      spawnNote(bassFreq, startAt, startAt + lengthSec, 0.95);
    } else {
      let t = 0;
      let i = 0;
      while (t < lengthSec - 1e-4) {
        const noteStart = startAt + t;
        const noteEnd = Math.min(startAt + lengthSec, noteStart + stepSec);
        if (noteStart < startAt + lengthSec) {
          spawnNote(bassFreq, noteStart, noteEnd, 0.95);
        }
        t += stepSec;
        i++;
      }
    }
  }

  // ---- Arp melody scheduling ----
  const arpEnabled = arp.pattern !== "all";
  if (melody.length === 0) return;

  const tripletScale = triplet && TRIPLET_SUBDIVS.has(arp.repeat) ? 2 / 3 : 1;
  const stepSec = ARP_STEP_BEATS[arp.repeat] * beatSec * tripletScale;
  const noteVel = Math.min(1, 1.4 / Math.sqrt(Math.max(1, melody.length)));

  if (!arpEnabled) {
    // "All" pattern: repeat block chord at pattern repeat interval.
    if (stepSec >= lengthSec) {
      for (const m of melody) {
        spawnNote(midiToFreq(m), startAt, startAt + lengthSec, noteVel);
      }
    } else {
      let t = 0;
      let i = 0;
      while (t < lengthSec - 1e-4) {
        const delay = swingDelay(i, stepSec, arp.swing);
        const noteStart = startAt + t + delay;
        if (noteStart >= startAt + lengthSec) break;
        const noteEnd = Math.min(startAt + lengthSec, noteStart + stepSec);
        for (const m of melody) {
          spawnNote(midiToFreq(m), noteStart, noteEnd, noteVel);
        }
        t += stepSec;
        i++;
      }
    }
    return;
  }

  const stepNotes = buildStepNotes(melody, arp.pattern);
  if (stepNotes.length === 0) return;

  let t = 0;
  let i = 0;
  let prevRandom = -1;
  while (t < lengthSec - 1e-4) {
    const delay = swingDelay(i, stepSec, arp.swing);
    const noteStart = startAt + t + delay;
    if (noteStart >= startAt + lengthSec) break;
    const noteEnd = Math.min(startAt + lengthSec, noteStart + stepSec);

    let midi: number;
    if (arp.pattern === "random") {
      let pick = Math.floor(Math.random() * stepNotes.length);
      if (stepNotes.length > 1 && pick === prevRandom) pick = (pick + 1) % stepNotes.length;
      prevRandom = pick;
      midi = stepNotes[pick];
    } else {
      midi = stepNotes[i % stepNotes.length];
    }
    spawnNote(midiToFreq(midi), noteStart, noteEnd, noteVel);
    t += stepSec;
    i++;
  }
}

// ---- Public API ----

export async function playChord(chord: ChordSymbol, durationSec = 1.2, octave = 4): Promise<void> {
  await ensureAudio();
  const ac = getAudioContext();
  const start = ac.currentTime + 0.005;
  spawnChord(chord, start, start + durationSec, octave, "audition");
}

/** Play an explicit set of MIDI notes (used by the Chord Explorer's edited voicings). */
export async function playNotes(midiNotes: number[], durationSec = 1.2): Promise<void> {
  await ensureAudio();
  if (midiNotes.length === 0) return;
  const ac = getAudioContext();
  const start = ac.currentTime + 0.005;
  const vel = Math.min(1, 1.4 / Math.sqrt(midiNotes.length));
  for (const m of midiNotes) {
    spawnNote(midiToFreq(m), start, start + durationSec, vel, "audition");
  }
}

/**
 * Begin sustaining a chord; returns a release callback.
 * If the preset's release > 0 the natural decay still applies after release.
 */
export async function holdChord(chord: ChordSymbol, octave = 4): Promise<() => void> {
  await ensureAudio();
  const ac = getAudioContext();
  const start = ac.currentTime + 0.005;
  const voices = spawnChord(chord, start, null, octave, "audition");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const t = getAudioContext().currentTime + 0.005;
    for (const v of voices) v.release(t);
    for (const l of liveVoices) if (voices.includes(l.v)) l.held = false;
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
  /** Owning section id — used to look up the per-section arp arm toggle. */
  sectionId?: string;
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
  /** Optional: beat within the loop that `startAt` corresponds to; earlier chords are skipped. */
  fromBeat?: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 3.0;

function sectionArpArmed(sectionId: string): boolean {
  const sec = useSongStore.getState().sections.find((s) => s.id === sectionId);
  return sec ? sec.arpArmed !== false : true;
}

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
  try {
    const ctx = getAudioContext();
    const beatSec = 60 / schedBpm;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_S;
    const m = useSongStore.getState().meta;
    const triplet = (m.beatsPerBar === 3 && m.beatUnit === 4)
                 || (m.beatsPerBar === 6 && m.beatUnit === 8);

    while (schedNextIdx < schedEvents.length) {
      const ev = schedEvents[schedNextIdx];
      const eventAt = schedOriginAcTime + ev.startBeat * beatSec;
      if (eventAt >= horizon) break;
      const durSec = ev.lengthBeats * beatSec;
      const safeStart = Math.max(ctx.currentTime, eventAt);
      const octave = ev.chord.octave ?? schedOctave;
      const arp = useSoundStore.getState().arp;
      const armed = ev.sectionId ? sectionArpArmed(ev.sectionId) : true;
      const useArpPath = armed;
      // Per-event try/catch so a single malformed chord doesn't wedge the
      // scheduler on the same index forever (silently dropping audio).
      try {
        if (useArpPath) {
          spawnArpForEvent(ev.chord, safeStart, durSec, octave, arp, beatSec, triplet);
        } else {
          spawnChord(ev.chord, safeStart, safeStart + durSec, octave);
        }
      } catch (err) {
        console.error("[audio] failed to spawn chord", ev.chord, err);
      }
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
  } catch (err) {
    console.error("[audio] scheduler tick failed", err);
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

  const { onChordStart, onEnd, loopBeats, octave = 4, startAt, fromBeat = 0 } = options;
  const ctx = getAudioContext();

  schedEvents = events;
  schedBpm = bpm;
  schedOctave = octave;
  schedOriginAcTime = (startAt != null ? startAt : ctx.currentTime + 0.04) - fromBeat * (60 / bpm);
  schedLoopBeats = loopBeats && loopBeats > 0 ? loopBeats : null;
  const firstIdx = events.findIndex((e) => e.startBeat >= fromBeat - 1e-9);
  schedNextIdx = firstIdx < 0 ? events.length : firstIdx;
  schedOnChordStart = onChordStart;
  schedOnEnd = onEnd;
  schedEndedScheduled = false;

  tick();

  return { stop: () => stopProgression() };
}

export function stopProgression() {
  clearScheduler();
  const t = getAudioContext().currentTime + 0.005;
  const fade = Math.min(0.3, useSoundStore.getState().adsr.release);
  for (const l of liveVoices) if (l.owner === "transport") l.v.release(t, fade);
}


/**
 * Swap the live schedule with a fresh event array without restarting playback.
 * Chords already handed to the AudioContext (inside the lookahead window) keep
 * their pre-update sound this iteration. Anything past the lookahead, including
 * inserts and removes ahead of the playhead, is picked up immediately by the
 * next tick. Behind-the-playhead changes apply on the next loop wrap.
 *
 * No-op when the scheduler is idle.
 */
/**
 * Smoothly update the tempo of a running progression. Adjusts the internal
 * beat-to-AC-time mapping so the current beat position is preserved — chords
 * already handed to the AC (inside the lookahead window) keep their pre-update
 * timing; everything past the lookahead plays at the new BPM.
 *
 * No-op when the scheduler is idle.
 */
export function updateScheduledBpm(bpm: number): void {
  if (schedulerTimerId == null) return;
  const ctx = getAudioContext();
  const oldBeatSec = 60 / schedBpm;
  const newBeatSec = 60 / bpm;
  // Shift the origin so the "current beat" maps to the same AC time under
  // the new tempo: currentBeat = (now - origin) / oldBeatSec  →  new origin.
  const currentBeat = (ctx.currentTime - schedOriginAcTime) / oldBeatSec;
  schedOriginAcTime = ctx.currentTime - currentBeat * newBeatSec;
  schedBpm = bpm;
}

export function updateScheduledProgression(
  events: ScheduledChord[],
  loopBeats?: number,
): void {
  if (schedulerTimerId == null) return;
  const ctx = getAudioContext();
  const beatSec = 60 / schedBpm;
  const currentBeat = (ctx.currentTime - schedOriginAcTime) / beatSec;
  const lookaheadBeats = SCHEDULE_AHEAD_S / beatSec;
  schedEvents = events;
  if (loopBeats != null) {
    schedLoopBeats = loopBeats > 0 ? loopBeats : null;
  }
  let nextIdx = events.findIndex(
    (e) => e.startBeat > currentBeat + lookaheadBeats,
  );
  if (nextIdx < 0) nextIdx = events.length;
  schedNextIdx = nextIdx;
  schedEndedScheduled = false;
}
