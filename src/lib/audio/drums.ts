// Synthesized drum kits. Each lane is rendered once per kit into a sample
// buffer (plain JS, seeded noise, so it's deterministic and testable), then
// every hit is just a buffer source and a gain: cheap enough for sixteenth
// hats on a phone.

import type { DrumLane } from "@/lib/music/grooves";

export type DrumKit = "acoustic" | "808" | "electronic" | "lofi";

export const DRUM_KITS: { value: DrumKit; label: string }[] = [
  { value: "acoustic", label: "Acoustic" },
  { value: "808", label: "808" },
  { value: "electronic", label: "Electronic" },
  { value: "lofi", label: "Lo-fi" },
];

type Samples = Float32Array;

function noise(seed: number) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}

/** RBJ-cookbook biquad, run over a buffer in place. */
function biquad(d: Samples, sr: number, type: "lowpass" | "highpass" | "bandpass", f: number, q: number): Samples {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === "lowpass") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else if (type === "highpass") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    d[i] = y;
  }
  return d;
}

const buf = (sr: number, sec: number) => new Float32Array(Math.ceil(sr * sec));

/** Sum `fn(t)` into a new buffer. */
function render(sr: number, sec: number, fn: (t: number) => number): Samples {
  const d = buf(sr, sec);
  for (let i = 0; i < d.length; i++) d[i] = fn(i / sr);
  return d;
}

function mix(...parts: Samples[]): Samples {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

function scale(d: Samples, fn: (t: number) => number, sr: number): Samples {
  for (let i = 0; i < d.length; i++) d[i] *= fn(i / sr);
  return d;
}

const decay = (tau: number) => (t: number) => Math.exp(-t / tau);

/** A sine falling from `f0` to `f1`, phase-continuous. */
function sweep(sr: number, sec: number, f0: number, f1: number, tau: number, ampTau: number): Samples {
  let phase = 0;
  return render(sr, sec, (t) => {
    phase += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t / tau))) / sr;
    return Math.sin(phase) * Math.exp(-t / ampTau);
  });
}

function noiseBurst(sr: number, sec: number, seed: number, ampTau: number): Samples {
  const n = noise(seed);
  return render(sr, sec, (t) => n() * Math.exp(-t / ampTau));
}

/** The 808 hi-hat trick: six detuned square waves make a metallic cluster. */
function metal(sr: number, sec: number, ampTau: number, mult = 1): Samples {
  const step = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => (f * mult) / sr);
  const phase = new Float64Array(step.length);
  return render(sr, sec, (t) => {
    let s = 0;
    for (let k = 0; k < step.length; k++) {
      phase[k] = (phase[k] + step[k]) % 1;
      s += phase[k] < 0.5 ? 1 : -1;
    }
    return (s / step.length) * Math.exp(-t / ampTau);
  });
}

function drive(d: Samples, amount: number): Samples {
  const k = Math.tanh(amount);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * amount) / k;
  return d;
}

function normalize(d: Samples, peak: number): Samples {
  let m = 0;
  for (const x of d) m = Math.max(m, Math.abs(x));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  // A few ms fade at the end so a buffer never stops on a non-zero sample.
  const fade = Math.min(d.length, 64);
  for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  return d;
}

function lofi(d: Samples, sr: number): Samples {
  biquad(d, sr, "lowpass", 4500, 0.7);
  let held = 0;
  for (let i = 0; i < d.length; i++) {
    if (i % 3 === 0) held = Math.round(d[i] * 48) / 48;
    d[i] = held;
  }
  return drive(d, 1.6);
}

type Voice = (sr: number) => Samples;

const KITS: Record<Exclude<DrumKit, "lofi">, Record<DrumLane, Voice>> = {
  acoustic: {
    kick: (sr) => mix(sweep(sr, 0.6, 140, 50, 0.04, 0.22), scale(biquad(noiseBurst(sr, 0.02, 1, 0.003), sr, "highpass", 3000, 0.7), () => 0.5, sr)),
    snare: (sr) => mix(
      scale(mix(sweep(sr, 0.3, 200, 185, 0.05, 0.07), sweep(sr, 0.3, 340, 330, 0.05, 0.05)), () => 0.6, sr),
      biquad(noiseBurst(sr, 0.4, 2, 0.13), sr, "bandpass", 3000, 0.6),
    ),
    clap: (sr) => clap(sr, 3, 1200),
    rim: (sr) => mix(sweep(sr, 0.08, 1800, 1700, 0.01, 0.012), biquad(noiseBurst(sr, 0.05, 4, 0.006), sr, "bandpass", 2500, 2)),
    hatClosed: (sr) => mix(biquad(noiseBurst(sr, 0.15, 5, 0.035), sr, "highpass", 8000, 0.7), scale(biquad(metal(sr, 0.15, 0.03), sr, "highpass", 7000, 0.7), () => 0.4, sr)),
    hatOpen: (sr) => mix(biquad(noiseBurst(sr, 0.8, 6, 0.25), sr, "highpass", 7500, 0.7), scale(biquad(metal(sr, 0.8, 0.25), sr, "highpass", 7000, 0.7), () => 0.4, sr)),
    ride: (sr) => mix(biquad(metal(sr, 1.6, 0.6, 1.6), sr, "bandpass", 8000, 1), scale(render(sr, 1.6, (t) => Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t / 0.35)), () => 0.3, sr)),
    shaker: (sr) => scale(biquad(noiseBurst(sr, 0.15, 7, 0.05), sr, "highpass", 6000, 0.7), (t) => Math.min(1, t / 0.01), sr),
    perc: (sr) => sweep(sr, 0.5, 240, 190, 0.03, 0.15),
    crash: (sr) => mix(biquad(noiseBurst(sr, 2.5, 8, 0.9), sr, "highpass", 4000, 0.7), scale(biquad(metal(sr, 2.5, 0.8, 2.1), sr, "highpass", 5000, 0.7), () => 0.5, sr)),
  },
  "808": {
    kick: (sr) => drive(sweep(sr, 1.2, 120, 45, 0.03, 0.5), 1.5),
    snare: (sr) => mix(
      scale(mix(sweep(sr, 0.3, 190, 180, 0.04, 0.1), sweep(sr, 0.3, 335, 330, 0.04, 0.08)), () => 0.7, sr),
      biquad(noiseBurst(sr, 0.35, 12, 0.12), sr, "highpass", 1500, 0.7),
    ),
    clap: (sr) => clap(sr, 13, 1000),
    rim: (sr) => sweep(sr, 0.06, 1700, 1650, 0.01, 0.01),
    hatClosed: (sr) => biquad(metal(sr, 0.12, 0.025), sr, "highpass", 7000, 0.7),
    hatOpen: (sr) => biquad(metal(sr, 0.7, 0.22), sr, "highpass", 7000, 0.7),
    ride: (sr) => biquad(metal(sr, 1.4, 0.55, 1.5), sr, "bandpass", 7500, 1.2),
    shaker: (sr) => scale(biquad(noiseBurst(sr, 0.12, 17, 0.04), sr, "highpass", 7000, 0.7), (t) => Math.min(1, t / 0.008), sr),
    perc: (sr) => sweep(sr, 0.5, 320, 210, 0.04, 0.2),
    crash: (sr) => biquad(mix(noiseBurst(sr, 2, 18, 0.7), metal(sr, 2, 0.7, 2.3)), sr, "highpass", 4500, 0.7),
  },
  electronic: {
    kick: (sr) => drive(mix(sweep(sr, 0.8, 220, 55, 0.02, 0.2), scale(noiseBurst(sr, 0.01, 21, 0.002), () => 0.6, sr)), 2),
    snare: (sr) => mix(scale(sweep(sr, 0.2, 210, 200, 0.03, 0.05), () => 0.5, sr), biquad(noiseBurst(sr, 0.3, 22, 0.16), sr, "bandpass", 2000, 0.8)),
    clap: (sr) => clap(sr, 23, 1500),
    rim: (sr) => biquad(noiseBurst(sr, 0.05, 24, 0.008), sr, "bandpass", 3000, 3),
    hatClosed: (sr) => biquad(noiseBurst(sr, 0.1, 25, 0.022), sr, "highpass", 9000, 0.7),
    hatOpen: (sr) => biquad(noiseBurst(sr, 0.6, 26, 0.18), sr, "highpass", 8500, 0.7),
    ride: (sr) => biquad(metal(sr, 1.2, 0.45, 1.8), sr, "highpass", 6000, 0.7),
    shaker: (sr) => scale(biquad(noiseBurst(sr, 0.1, 27, 0.035), sr, "bandpass", 7000, 1.5), (t) => Math.min(1, t / 0.006), sr),
    perc: (sr) => sweep(sr, 0.3, 500, 300, 0.02, 0.08),
    crash: (sr) => biquad(noiseBurst(sr, 2, 28, 0.6), sr, "highpass", 5000, 0.7),
  },
};

/** Three quick bursts, then a short tail: a hand clap. */
function clap(sr: number, seed: number, f: number): Samples {
  const n = noise(seed);
  const d = render(sr, 0.35, (t) => {
    const burst = [0, 0.011, 0.022].some((b) => t >= b && t < b + 0.008) ? 1 : 0;
    return n() * (t < 0.03 ? burst : Math.exp(-(t - 0.03) / 0.09));
  });
  return biquad(d, sr, "bandpass", f, 1.2);
}

/** Peak level per lane, so a groove is balanced before velocity. */
const LANE_PEAK: Record<DrumLane, number> = {
  kick: 0.9, snare: 0.7, clap: 0.65, rim: 0.45, hatClosed: 0.3, hatOpen: 0.3,
  ride: 0.28, shaker: 0.22, perc: 0.5, crash: 0.35,
};

export function renderLane(kit: DrumKit, lane: DrumLane, sr: number): Samples {
  const base = kit === "lofi" ? KITS.acoustic : KITS[kit];
  const d = normalize(base[lane](sr), LANE_PEAK[lane]);
  return kit === "lofi" ? normalize(lofi(d, sr), LANE_PEAK[lane]) : d;
}

const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** The lane's sample buffer for this context, rendered on first use. */
export function laneBuffer(ctx: BaseAudioContext, kit: DrumKit, lane: DrumLane): AudioBuffer {
  let byKey = cache.get(ctx);
  if (!byKey) { byKey = new Map(); cache.set(ctx, byKey); }
  const key = `${kit}:${lane}`;
  let b = byKey.get(key);
  if (!b) {
    const d = renderLane(kit, lane, ctx.sampleRate);
    b = ctx.createBuffer(1, d.length, ctx.sampleRate);
    b.copyToChannel(d, 0);
    byKey.set(key, b);
  }
  return b;
}

/** Render a whole kit ahead of playback so the first bar doesn't stall. */
export function warmKit(ctx: BaseAudioContext, kit: DrumKit, lanes: readonly DrumLane[]) {
  for (const lane of lanes) laneBuffer(ctx, kit, lane);
}

export interface Hit {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** One drum hit at `at`. Velocity 0..1. */
export function playHit(ctx: BaseAudioContext, destination: AudioNode, kit: DrumKit, lane: DrumLane, at: number, velocity: number): Hit {
  const source = ctx.createBufferSource();
  source.buffer = laneBuffer(ctx, kit, lane);
  const gain = ctx.createGain();
  gain.gain.value = Math.pow(velocity, 1.5);
  source.connect(gain).connect(destination);
  source.onended = () => gain.disconnect();
  source.start(at);
  return { source, gain };
}

/** Cut a ringing hit (an open hat closed by the next closed hat) without a click. */
export function chokeHit(hit: Hit, at: number) {
  hit.gain.gain.setTargetAtTime(0, at, 0.008);
  try { hit.source.stop(at + 0.06); } catch { /* noop */ }
}
