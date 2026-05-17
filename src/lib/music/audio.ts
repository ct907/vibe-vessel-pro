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
const MAX_VOICES = 24;
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

function spawnNote(
  freq: number,
  startAt: number,
  releaseAt: number | null,
  velocity: number,
): Voice {
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
  liveVoices.push(v);
  return v;
}

function ensureHeadroom(need: number) {
  reapVoices();
  const overflow = (liveVoices.length + need) - MAX_VOICES;
  if (overflow > 0) steal(overflow);
}

function spawnChord(
  chord: ChordSymbol,
  startAt: number,
  releaseAt: number | null,
  octave: number,
): Voice[] {
  const freqs = chordToMidi(chord, octave).map(midiToFreq);
  ensureHeadroom(freqs.length);
  // Per-voice attenuation when chord is dense (3-note triad ≈ 1.0; 6-note ≈ 0.55).
  const vel = Math.min(1, 1.4 / Math.sqrt(freqs.length));
  return freqs.map((f) => spawnNote(f, startAt, releaseAt, vel));
}

// ---- Arpeggio expansion ----

const ARP_STEP_BEATS: Record<ArpRepeat, number> = {
  "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25,
};
const BASS_STEP_BEATS: Record<BassRepeat, number> = {
  "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5,
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
function spawnArpForEvent(
  chord: ChordSymbol,
  startAt: number,
  lengthSec: number,
  octave: number,
  arp: ArpSettings,
  beatSec: number,
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
      ensureHeadroom(1);
      spawnNote(bassFreq, startAt, startAt + lengthSec, 0.95);
    } else {
      let t = 0;
      let i = 0;
      while (t < lengthSec - 1e-4) {
        const delay = swingDelay(i, stepSec, arp.swing);
        const noteStart = startAt + t + delay;
        const noteEnd = Math.min(startAt + lengthSec, noteStart + stepSec);
        if (noteStart < startAt + lengthSec) {
          ensureHeadroom(1);
          spawnNote(bassFreq, noteStart, noteEnd, 0.95);
        }
        t += stepSec;
        i++;
      }
    }
  }

  // ---- Arp melody scheduling ----
  // Pattern "all" with no slash means parallel chord (handled by spawnChord upstream).
  // If we reach here with "all", we still play parallel chord notes per arp step.
  const arpEnabled = arp.pattern !== "all";
  if (melody.length === 0) return;

  const stepSec = ARP_STEP_BEATS[arp.repeat] * beatSec;
  // Chord beat length wins: if step >= length, schedule only one note.
  const noteVel = Math.min(1, 1.4 / Math.sqrt(Math.max(1, melody.length)));

  if (!arpEnabled) {
    // Block chord at start, releases at lengthSec.
    ensureHeadroom(melody.length);
    for (const m of melody) {
      spawnNote(midiToFreq(m), startAt, startAt + lengthSec, noteVel);
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
    ensureHeadroom(1);
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
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

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

    while (schedNextIdx < schedEvents.length) {
      const ev = schedEvents[schedNextIdx];
      const eventAt = schedOriginAcTime + ev.startBeat * beatSec;
      if (eventAt >= horizon) break;
      const durSec = ev.lengthBeats * beatSec;
      const safeStart = Math.max(ctx.currentTime, eventAt);
      const octave = ev.chord.octave ?? schedOctave;
      const arp = useSoundStore.getState().arp;
      const armed = ev.sectionId ? sectionArpArmed(ev.sectionId) : true;
      const hasSlashBass = !!ev.chord.bass;
      const useArpPath = armed && (arp.pattern !== "all" || arp.bassMode !== "off" || hasSlashBass);
      if (useArpPath) {
        spawnArpForEvent(ev.chord, safeStart, durSec, octave, arp, beatSec);
      } else {
        spawnChord(ev.chord, safeStart, safeStart + durSec, octave);
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
  } catch { /* audio glitch acceptable; scheduler must survive */ }
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

/**
 * Swap the live schedule with a fresh event array without restarting playback.
 * Chords already handed to the AudioContext (inside the lookahead window) keep
 * their pre-update sound this iteration. Anything past the lookahead, including
 * inserts and removes ahead of the playhead, is picked up immediately by the
 * next tick. Behind-the-playhead changes apply on the next loop wrap.
 *
 * No-op when the scheduler is idle.
 */
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
