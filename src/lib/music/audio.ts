// Phase 1.6 — Web Audio synth engine + lookahead scheduler.
//
// Synthesis and scheduling are 100% raw Web Audio on the shared context from
// src/lib/audio/context.ts.
//
// Polyphony is capped at MAX_VOICES; the quietest voice at a new note's start is stolen.

import { ChordSymbol, chordToMidi, midiToFreq } from "./chords";
import {
  presetVoice,
  resolveBass,
  resolveDrums,
  resolvePad,
  useSoundStore,
  type BassSound,
  type DrumSettings,
  type EQ3,
  type FX,
  type SoundPreset,
  type SoundSettings,
} from "@/store/sound";
import { useSongStore } from "@/store/song";
import { useMetronomeStore } from "@/store/metronome";
import { getAudioContext, getMasterChain } from "@/lib/audio/context";
import { makeBassVoice, makeVoice, type Voice } from "@/lib/audio/voices";
import { scheduleClick } from "@/lib/audio/metronome";
import { chokeHit, playHit, warmKit, type DrumKit, type Hit } from "@/lib/audio/drums";
import { DRUM_LANES } from "./grooves";
import {
  drumHits,
  renderTrack,
  windowEvents,
  type Arrangement,
  type PlayNote,
  type RenderSettings,
  type Track,
} from "./arrangement";

// ---- Lifecycle ----
let started = false;

export async function ensureAudio(): Promise<void> {
  // Resume synchronously inside the caller's gesture; awaiting anything first
  // loses the autoplay unlock on iOS.
  const ac = getAudioContext();
  if (!started) {
    getMasterChain();
    started = true;
    applySettings(useSoundStore.getState());
  }
  // Safari also reports "interrupted" after a call, Siri or an app switch.
  if (ac.state !== "running") {
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
  if (lastReverbDecay !== fx.reverbDecay) {
    lastReverbDecay = fx.reverbDecay;
    c.setReverbDecay(fx.reverbDecay);
  }
}
let lastReverbDecay: number | null = null;

function applySettings(s: SoundSettings) {
  if (!started) return;
  const c = getMasterChain();
  c.master.gain.setTargetAtTime(dbToGain(s.volume), c.ctx.currentTime, 0.02);
  c.padBus.gain.setTargetAtTime(dbToGain(s.mix.pad.volume), c.ctx.currentTime, 0.02);
  c.bassBus.gain.setTargetAtTime(dbToGain(s.mix.bass.volume), c.ctx.currentTime, 0.02);
  c.drumBus.gain.setTargetAtTime(dbToGain(s.mix.drums.volume), c.ctx.currentTime, 0.02);
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

type Owner = "transport" | "preview" | "audition";
type VoicePart = "pad" | "bass";

interface LiveVoice {
  v: Voice;
  owner: Owner;
  part: VoicePart;
  freq: number;
  /** Held chord chips: released by the caller, never stolen. */
  held: boolean;
}

/** Pad voices only: the bass is monophonic and drum hits end by themselves. */
const MAX_VOICES = 20;
const BASS_HANDOFF = 0.015;
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

function makeRoom(at: number, freq: number, owner: Owner, part: VoicePart) {
  reapVoices();
  const now = getAudioContext().currentTime;
  if (part === "bass") {
    // One string: each bass note hands over from the last.
    for (const l of liveVoices) {
      if (l.part === "bass" && l.owner === owner && l.v.startsAt < at && l.v.endsAt > at) l.v.release(at, BASS_HANDOFF);
    }
    return;
  }
  const { attack } = useSoundStore.getState().adsr;
  // A re-struck pitch replaces its own ringing tail, like a re-struck string.
  // The old note crossfades over the new note's attack so slow pads don't dip.
  for (const l of liveVoices) {
    if (l.part === "pad" && l.owner === owner && !l.held && Math.abs(l.freq - freq) < 0.01
        && l.v.startsAt < at && l.v.endsAt > at) {
      l.v.release(at, Math.max(0.02, attack));
    }
  }
  const sounding = liveVoices.filter((l) => l.part === "pad" && l.v.levelAt(at) > AUDIBLE);
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
  part: VoicePart = "pad",
  /** A section's own pad preset or bass sound; defaults to the song's. */
  sound?: string,
): Voice {
  makeRoom(startAt, freq, owner, part);
  const s = useSoundStore.getState();
  const chain = getMasterChain();
  let v: Voice;
  if (part === "bass") {
    v = makeBassVoice({ ctx: chain.ctx, destination: chain.bassBus, sound: (sound as BassSound) ?? s.bass.sound, tone: s.bass.tone, freq, velocity });
  } else {
    const preset = (sound as SoundPreset) ?? s.preset;
    v = makeVoice({ ctx: chain.ctx, destination: chain.padBus, preset, ...presetVoice(s, preset), freq, velocity });
  }
  v.start(startAt);
  if (releaseAt !== null) v.release(releaseAt);
  liveVoices.push({ v, owner, part, freq, held: releaseAt === null });
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

// ---- Public API ----

export async function playChord(chord: ChordSymbol, durationSec = 1.2, octave = 4): Promise<void> {
  await ensureAudio();
  const ac = getAudioContext();
  const start = ac.currentTime + 0.005;
  spawnChord(chord, start, start + durationSec, octave, "audition");
}

/** Play an explicit set of MIDI notes (used by the Chord Explorer's edited voicings). */
/** Two bars of a groove, for the Sound panel. */
export async function previewDrums(drums: DrumSettings = useSoundStore.getState().drums): Promise<void> {
  await ensureAudio();
  const { beatsPerBar, beatUnit } = useSongStore.getState().meta;
  const chain = getMasterChain();
  warmKit(chain.ctx, drums.kit, DRUM_LANES);
  const span = { sectionId: "", startBeat: 0, lengthBeats: beatsPerBar * 2, blocks: [{ startBeat: 0, lengthBeats: beatsPerBar * 2, beatsPerBar }] };
  const beatSec = 60 / useSongStore.getState().meta.bpm;
  const t0 = chain.ctx.currentTime + 0.05;
  for (const n of drumHits(span, drums, { beatsPerBar, beatUnit })) {
    playHit(chain.ctx, chain.drumBus, drums.kit, DRUM_LANES[n.midi], t0 + n.startBeat * beatSec, n.velocity);
  }
}

/** A short line on a bass sound, for the Sound panel. */
export async function previewBass(sound?: BassSound): Promise<void> {
  await ensureAudio();
  const t = getAudioContext().currentTime + 0.01;
  [36, 43, 48, 43].forEach((midi, i) => spawnNote(midiToFreq(midi), t + i * 0.3, t + i * 0.3 + 0.28, 0.9, "audition", "bass", sound));
}

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

// ---- Players: the transport and previews ----
//
// A player renders its loop to notes once (renderTrack) and each tick hands
// the AudioContext only the notes starting within the next second, or three
// while the tab is hidden and timers are throttled. Edits, tempo and sound
// changes "rewind": notes not yet started are cancelled and rescheduled from
// a pivot just ahead of now, so nothing doubles or drops. Previews have their
// own player, so auditioning a progression never touches the song's voices.

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
  /** Optional: beat within the loop that `startAt` corresponds to. */
  fromBeat?: number;
}

const TICK_MS = 25;
const PIVOT_S = 0.03;

interface Scheduled {
  startAbs: number;
  endAbs: number;
  startT: number;
  voice?: Voice;
  node?: AudioScheduledSourceNode;
}

interface PlayerStart {
  track: Track;
  bpm: number;
  startAt: number;
  fromBeat: number;
  loop: boolean;
  onChordStart?: (index: number) => void;
  onEnd?: () => void;
}

function sameTrack(a: Track, b: Track): boolean {
  if (a.loopBeats !== b.loopBeats || a.notes.length !== b.notes.length || a.chordStarts.length !== b.chordStarts.length) return false;
  for (let i = 0; i < a.notes.length; i++) {
    const x = a.notes[i], y = b.notes[i];
    if (x.part !== y.part || x.midi !== y.midi || x.startBeat !== y.startBeat || x.lengthBeats !== y.lengthBeats || x.velocity !== y.velocity) return false;
  }
  return a.chordStarts.every((c, i) => c.beat === b.chordStarts[i].beat && c.index === b.chordStarts[i].index);
}

function createPlayer(owner: Owner) {
  let timer: number | null = null;
  let track: Track | null = null;
  let loop = true;
  let bpm = 120;
  /** AudioContext time of absolute beat 0. Absolute beats never wrap. */
  let originT = 0;
  /** Next absolute beat to schedule from. */
  let cursor = 0;
  /** Absolute beat `epochAbs` is at loop position `epochLocal` (unwrapped). */
  let epochAbs = 0;
  let epochLocal = 0;
  let scheduled: Scheduled[] = [];
  let timers: { id: number; at: number }[] = [];
  let onChordStart: ((index: number) => void) | undefined;
  let onEnd: (() => void) | undefined;
  let ended = false;
  let openHat: Hit | null = null;

  const now = () => getAudioContext().currentTime;
  const beatSec = () => 60 / bpm;
  const timeAt = (abs: number) => originT + abs * beatSec();
  const absAt = (t: number) => (t - originT) / beatSec();

  const later = (at: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers = timers.filter((x) => x.id !== id);
      fn();
    }, Math.max(0, (at - now()) * 1000));
    timers.push({ id, at });
  };

  const play = (n: PlayNote, abs: number) => {
    const t = timeAt(abs);
    if (n.part === "click") {
      const m = useMetronomeStore.getState();
      if (!m.enabled) return;
      scheduled.push({ startAbs: abs, endAbs: abs, startT: t, node: scheduleClick(t, n.midi === 1, m.volume) });
      return;
    }
    if (n.part === "drums") {
      const lane = DRUM_LANES[n.midi];
      const chain = getMasterChain();
      const hit = playHit(chain.ctx, chain.drumBus, n.sound as DrumKit, lane, t, n.velocity);
      // A closed hat (or the next open one) cuts off a ringing open hat.
      if ((lane === "hatClosed" || lane === "hatOpen") && openHat) chokeHit(openHat, t);
      if (lane === "hatOpen") openHat = hit;
      scheduled.push({ startAbs: abs, endAbs: abs + 0.5, startT: t, node: hit.source });
      return;
    }
    const voice = spawnNote(midiToFreq(n.midi), t, timeAt(abs + n.lengthBeats), n.velocity, owner, n.part === "bass" ? "bass" : "pad", n.sound);
    scheduled.push({ startAbs: abs, endAbs: abs + n.lengthBeats, startT: t, voice });
  };

  const scheduleWindow = (from: number, to: number) => {
    if (!track) return;
    const w = windowEvents(track, from, to, { abs: epochAbs, local: epochLocal }, loop);
    for (const { note, abs } of w.notes) play(note, abs);
    const startCb = onChordStart;
    if (startCb) for (const { index, abs } of w.chords) later(timeAt(abs), () => startCb(index));
    if (w.endAbs != null && !ended) {
      ended = true;
      const endCb = onEnd;
      if (endCb) later(timeAt(w.endAbs), endCb);
    }
  };

  const tick = () => {
    const t = now();
    scheduled = scheduled.filter((x) => timeAt(x.endAbs) > t - 0.1);
    const horizon = absAt(t + (document.hidden ? 3 : 1));
    if (!ended && horizon > cursor) {
      try { scheduleWindow(cursor, horizon); }
      catch (err) { console.error("[audio] scheduler tick failed", err); }
      cursor = horizon;
    }
    timer = window.setTimeout(tick, TICK_MS);
  };

  const clearTimers = (fromT: number) => {
    timers = timers.filter((x) => {
      if (x.at < fromT) return true;
      clearTimeout(x.id);
      return false;
    });
  };

  /** Cancel everything from `pivot` on, let `change` remap time or content, then reschedule. */
  const rewind = (change: (pivot: number, pivotT: number) => void) => {
    const pivotT = now() + PIVOT_S;
    const pivot = absAt(pivotT);
    for (const x of scheduled) {
      if (x.startAbs < pivot) continue;
      x.voice?.release(x.startT);
      try { x.node?.stop(0); } catch { /* noop */ }
    }
    scheduled = scheduled.filter((x) => x.startAbs < pivot);
    clearTimers(pivotT);
    change(pivot, pivotT);
    ended = false;
    cursor = pivot;
    scheduleWindow(cursor, absAt(now() + (document.hidden ? 3 : 1)));
    cursor = Math.max(cursor, absAt(now() + (document.hidden ? 3 : 1)));
  };

  return {
    get active() { return timer != null; },
    start(o: PlayerStart) {
      this.stop();
      track = o.track;
      bpm = o.bpm;
      loop = o.loop;
      originT = o.startAt;
      cursor = 0;
      epochAbs = 0;
      epochLocal = o.fromBeat;
      onChordStart = o.onChordStart;
      onEnd = o.onEnd;
      ended = false;
      tick();
    },
    /** Swap in re-rendered content; `force` reschedules even if the notes match (new sound). */
    update(next: Track, force = false) {
      if (timer == null || !track) return;
      if (!force && sameTrack(track, next)) return;
      rewind((pivot) => {
        const oldL = track!.loopBeats;
        track = next;
        if (next.loopBeats === oldL) return;
        const unwrapped = epochLocal + (pivot - epochAbs);
        const pos = loop ? ((unwrapped % oldL) + oldL) % oldL : unwrapped;
        epochAbs = pivot;
        epochLocal = pos < next.loopBeats ? pos : 0;
      });
    },
    setBpm(next: number) {
      if (timer == null || next === bpm) return;
      rewind((pivot, pivotT) => {
        bpm = next;
        originT = pivotT - pivot * beatSec();
        // Notes already sounding were released on the old grid; pull in any
        // that should now end sooner.
        for (const x of scheduled) {
          if (x.voice && x.endAbs > pivot) x.voice.release(Math.max(pivotT, timeAt(x.endAbs)));
        }
      });
    },
    stop() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      clearTimers(-Infinity);
      const t = now() + 0.005;
      const fade = Math.min(0.3, useSoundStore.getState().adsr.release);
      for (const x of scheduled) {
        if (x.startT > t) {
          x.voice?.release(x.startT);
          try { x.node?.stop(0); } catch { /* noop */ }
        } else {
          x.voice?.release(t, fade);
        }
      }
      scheduled = [];
      track = null;
    },
  };
}

function renderSettings(octave = 4): RenderSettings {
  const s = useSoundStore.getState();
  const { beatsPerBar, beatUnit } = useSongStore.getState().meta;
  return {
    pad: (sectionId) => {
      const pad = resolvePad(s, sectionId);
      return pad.on ? { arp: pad.arp, preset: pad.preset, octave, bassOn: resolveBass(s, sectionId).on } : null;
    },
    bass: (sectionId) => {
      const bass = resolveBass(s, sectionId);
      return bass.on ? bass.settings : null;
    },
    drums: (sectionId) => resolveDrums(s, sectionId),
    meter: { beatsPerBar, beatUnit },
    click: true,
  };
}

const transport = createPlayer("transport");
const preview = createPlayer("preview");
let transportArr: Arrangement | null = null;
let transportLoop = 0;

const renderTransport = () => renderTrack(transportArr, transportLoop, renderSettings());

export interface TransportStart {
  /** Null plays only the click (audio-only songs). */
  arrangement: Arrangement | null;
  loopBeats: number;
  bpm: number;
  startAt: number;
  fromBeat: number;
  onChordStart?: (index: number) => void;
}

export async function startTransport(o: TransportStart): Promise<void> {
  await ensureAudio();
  preview.stop();
  const { drums, mix } = useSoundStore.getState();
  if (mix.drums.on) warmKit(getAudioContext(), drums.kit, DRUM_LANES);
  transportArr = o.arrangement;
  transportLoop = o.loopBeats;
  transport.start({
    track: renderTransport(),
    bpm: o.bpm,
    startAt: o.startAt,
    fromBeat: o.fromBeat,
    loop: true,
    onChordStart: o.onChordStart,
  });
}

/** Mirror song edits into the running loop; no-op when nothing audible changed. */
export function updateTransport(arrangement: Arrangement | null, loopBeats: number): void {
  if (!transport.active) return;
  transportArr = arrangement;
  transportLoop = loopBeats;
  transport.update(renderTransport());
}

export function setTransportBpm(bpm: number): void {
  transport.setBpm(bpm);
}

export function stopTransport(): void {
  transport.stop();
}

// Discrete sound changes (preset, arp) are heard straight away rather than
// after the notes already queued. Sliders apply to the next notes, so a drag
// doesn't reschedule on every tick.
useSoundStore.subscribe((s, prev) => {
  if (started && s.mix.drums.on && (s.drums.kit !== prev.drums.kit || !prev.mix.drums.on)) {
    warmKit(getAudioContext(), s.drums.kit, DRUM_LANES);
  }
  const heardNow = s.arp !== prev.arp || s.preset !== prev.preset
    || s.bass.sound !== prev.bass.sound || s.bass.pattern !== prev.bass.pattern || s.bass.rate !== prev.bass.rate
    || s.drums !== prev.drums || s.sectionSound !== prev.sectionSound
    || s.mix.pad.on !== prev.mix.pad.on || s.mix.bass.on !== prev.mix.bass.on || s.mix.drums.on !== prev.mix.drums.on;
  if (heardNow) rerenderSoon();
});

// Sliders (Energy, Velocity) fire on every tick; reschedule at most every 80 ms.
let rerenderTimer: number | null = null;
function rerenderSoon() {
  if (rerenderTimer != null) return;
  rerenderTimer = window.setTimeout(() => {
    rerenderTimer = null;
    transport.update(renderTransport(), true);
  }, 80);
}
useMetronomeStore.subscribe((s, prev) => {
  if (s.enabled !== prev.enabled) transport.update(renderTransport(), true);
});

/** Previews (preset browser, Spice, Why this chord): their own player, pad only. */
export async function playProgression(
  events: ScheduledChord[],
  bpm: number,
  options: PlayProgressionOptions = {},
): Promise<PlaybackHandle> {
  await ensureAudio();
  if (transport.active) window.dispatchEvent(new CustomEvent("lovable:request-stop"));
  const { onChordStart, onEnd, loopBeats, octave = 4, startAt, fromBeat = 0 } = options;
  const end = events.reduce((m, e) => Math.max(m, e.startBeat + e.lengthBeats), 0);
  const loop = !!loopBeats && loopBeats > 0;
  const length = loop ? loopBeats! : end;
  if (length <= 0) return { stop: () => stopProgression() };
  const arr: Arrangement = { chords: events, refs: [], sections: [], loopBeats: length };
  preview.start({
    track: renderTrack(arr, length, { ...renderSettings(octave), click: false }),
    bpm,
    startAt: startAt ?? getAudioContext().currentTime + 0.04,
    fromBeat,
    loop,
    onChordStart,
    onEnd,
  });
  return { stop: () => stopProgression() };
}

export function stopProgression() {
  preview.stop();
}
