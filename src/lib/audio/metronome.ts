// Metronome click sound. Playback clicks are scheduled by the transport in
// src/lib/music/audio.ts, on the same grid as the chords; this module only
// makes the click, the count-in and the settings preview.
//
// - Beat 1 of every bar is accented (pitched +2 semitones above the base tone).
// - Uses the shared AudioContext from context.ts so we share the audio device.

import { getAudioContext } from "./context";

const BASE_HZ = 880;
const ACCENT_HZ = BASE_HZ * Math.pow(2, 2 / 12); // +2 semitones

export function scheduleClick(at: number, accent: boolean, volume: number): OscillatorNode {
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
  osc.onended = () => gain.disconnect();
  return osc;
}

/** One bar of clicks (downbeat accented) that ends exactly at `endAt` — a count-in. */
export function scheduleCountIn(opts: { bpm: number; beatsPerBar: number; volume: number; endAt: number }) {
  const beatSec = 60 / Math.max(20, opts.bpm);
  for (let i = 0; i < opts.beatsPerBar; i++) {
    scheduleClick(opts.endAt - (opts.beatsPerBar - i) * beatSec, i === 0, opts.volume);
  }
}

export function previewClick(volume: number) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  scheduleClick(ctx.currentTime + 0.01, true, volume);
}
