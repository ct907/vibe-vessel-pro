// Lightweight Web Audio metronome with lookahead scheduling.
//
// - Beat 1 of every bar is accented (pitched +2 semitones above the base tone).
// - Uses the shared AudioContext from context.ts so we share the audio device.
// - Lookahead loop schedules clicks ~100 ms ahead every 25 ms. This stays
//   stable through tab throttling / GC pauses better than setInterval per beat.

import { getAudioContext } from "./context";

interface Opts {
  bpm: number;
  beatsPerBar: number;
  /** 0..1 */
  volume: number;
  /** Optional: start the first tick at this AudioContext time (sec). */
  startAt?: number;
}

let timerId: number | null = null;
let nextNoteTime = 0;
let beatInBar = 0;
let current: Opts | null = null;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
const BASE_HZ = 880;
const ACCENT_HZ = BASE_HZ * Math.pow(2, 2 / 12); // +2 semitones

function scheduleClick(at: number, accent: boolean, volume: number) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = accent ? ACCENT_HZ : BASE_HZ;
  const peak = Math.max(0, Math.min(1, volume)) * (accent ? 0.9 : 0.6);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.08);
}

function tick() {
  if (!current) return;
  const ctx = getAudioContext();
  const beatSec = 60 / Math.max(20, current.bpm);
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    const accent = beatInBar === 0;
    scheduleClick(nextNoteTime, accent, current.volume);
    nextNoteTime += beatSec;
    beatInBar = (beatInBar + 1) % Math.max(1, current.beatsPerBar);
  }
  timerId = window.setTimeout(tick, LOOKAHEAD_MS);
}

export function startMetronome(opts: Opts) {
  stopMetronome();
  const ctx = getAudioContext();
  // Resume in case it's suspended (must be called after a user gesture).
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  current = { ...opts };
  nextNoteTime = ctx.currentTime + 0.05;
  beatInBar = 0;
  tick();
}

export function updateMetronome(opts: Partial<Opts>) {
  if (!current) return;
  current = { ...current, ...opts };
}

export function stopMetronome() {
  if (timerId != null) {
    clearTimeout(timerId);
    timerId = null;
  }
  current = null;
}

export function previewClick(volume: number) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  scheduleClick(ctx.currentTime + 0.01, true, volume);
}
