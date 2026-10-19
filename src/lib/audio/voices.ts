// Phase 1.6 — Web Audio voice engines.
//
// Three archetypes:
//   - FM (2-op)         : "rhodes", "dxkeys", "piano", "glassPad"
//   - Subtractive       : "juno", "stringMachine", "organ", "warmPad", "sweepPad", "airPad"
//   - Formant (vocal)   : "vocalChoir"
//
// The exported makeVoice() returns a Voice that owns its own subgraph and
// provides start/release + an immediate dispose() for cleanup.
// The engine layer handles polyphony limiting.

import type { ADSR, SoundPreset, SoundEngine } from "@/store/sound";
import { PRESET_BY_VALUE } from "@/store/sound";

export interface VoiceParams {
  ctx: BaseAudioContext;
  destination: AudioNode;
  preset: SoundPreset;
  /** 0..1 macro that the preset maps to internal parameters. */
  timbre: number;
  adsr: ADSR;
  freq: number;
  /** Per-voice level (0..1). The engine pre-scales for chord size. */
  velocity: number;
}

export interface Voice {
  /** Trigger envelope at the given audio-context time. */
  start(at: number): void;
  /**
   * Fade out from `at` over `fade` seconds (default: the ADSR release). Can be
   * called again to shorten a fade, never to lengthen it. At or before the
   * start time it cancels the note instead.
   */
  release(at: number, fade?: number): void;
  /** Hard-stop and disconnect. Safe to call any time. */
  dispose(): void;
  /** Envelope level at `t` as a fraction of the voice's peak. */
  levelAt(t: number): number;
  /** Audio-context time at which the voice will be silent and self-removable. */
  endsAt: number;
  /** Audio-context time at which the voice will start (set by start()). */
  startsAt: number;
}

const FLOOR = 0.0001;

interface EnvEvent { t: number; v: number; curve: "set" | "linear" | "exp" }

/**
 * ADSR on a gain param that keeps its own copy of what it scheduled. The
 * attack is linear (an exponential rise from the floor stays inaudible for
 * most of its length); decay and release are exponential.
 *
 * Releases are often scheduled before the note has even started, when
 * `AudioParam.value` is still the floor, so the level at release time has to
 * come from the schedule. Cancelling at the release time also deletes any
 * ramp still in progress; re-adding it as a ramp to the level it would have
 * reached keeps the same curve up to the release.
 */
export function makeEnvelope(param: AudioParam, adsr: ADSR, peak: number) {
  let events: EnvEvent[] = [];
  let releaseEnd = Infinity;
  const top = Math.max(FLOOR, peak);

  const levelAt = (t: number): number => {
    if (!events.length || t < events[0].t) return FLOOR;
    let i = events.length - 1;
    while (i > 0 && events[i].t > t) i--;
    const prev = events[i];
    const next = events[i + 1];
    if (!next || next.curve === "set") return prev.v;
    const span = next.t - prev.t;
    if (span <= 0) return next.v;
    const k = (t - prev.t) / span;
    return next.curve === "linear"
      ? prev.v + (next.v - prev.v) * k
      : prev.v * Math.pow(next.v / prev.v, k);
  };

  return {
    start(at: number) {
      const a = Math.max(0.001, adsr.attack);
      const d = Math.max(0.001, adsr.decay);
      const sustain = Math.max(FLOOR, top * Math.max(FLOOR, adsr.sustain));
      events = [
        { t: at, v: FLOOR, curve: "set" },
        { t: at + a, v: top, curve: "linear" },
        { t: at + a + d, v: sustain, curve: "exp" },
      ];
      releaseEnd = Infinity;
      param.cancelScheduledValues(at);
      param.setValueAtTime(FLOOR, at);
      param.linearRampToValueAtTime(top, at + a);
      param.exponentialRampToValueAtTime(sustain, at + a + d);
    },
    /** Returns the time the envelope reaches the floor. */
    release(at: number, fade: number): number {
      if (at >= releaseEnd) return releaseEnd;
      const end = Math.min(releaseEnd, at + Math.max(0.01, fade));
      const v = levelAt(at);
      const cut = events.find((e) => e.t >= at);
      events = events.filter((e) => e.t < at);
      param.cancelScheduledValues(at);
      if (cut?.curve === "linear") param.linearRampToValueAtTime(v, at);
      else if (cut?.curve === "exp") param.exponentialRampToValueAtTime(v, at);
      else param.setValueAtTime(v, at);
      param.exponentialRampToValueAtTime(FLOOR, end);
      events.push({ t: at, v, curve: cut?.curve ?? "set" }, { t: end, v: FLOOR, curve: "exp" });
      releaseEnd = end;
      return end;
    },
    levelAt: (t: number) => levelAt(t) / top,
  };
}

/** Wraps a voice's graph: envelope on `amp`, sources started and stopped together. */
function assembleVoice({
  ctx, sources, nodes, amp, adsr, peak, onStart,
}: {
  ctx: BaseAudioContext;
  sources: AudioScheduledSourceNode[];
  /** Every node to disconnect once the voice is done. */
  nodes: AudioNode[];
  amp: GainNode;
  adsr: ADSR;
  peak: number;
  onStart?: (at: number) => void;
}): Voice {
  const env = makeEnvelope(amp.gain, adsr, peak);
  let startsAt = Infinity;
  let endsAt = Infinity;
  let disposed = false;
  const disconnect = () => {
    if (disposed) return;
    disposed = true;
    for (const n of nodes) { try { n.disconnect(); } catch { /* noop */ } }
  };
  sources[0].onended = disconnect;
  const stopAll = (t: number) => {
    for (const s of sources) { try { s.stop(t); } catch { /* noop */ } }
  };

  return {
    start(at: number) {
      startsAt = Math.max(0, at);
      for (const s of sources) s.start(startsAt);
      env.start(startsAt);
      onStart?.(startsAt);
    },
    release(atRaw: number, fade = adsr.release) {
      const at = Math.max(0, atRaw);
      if (at <= startsAt) {
        stopAll(0);
        endsAt = Math.min(endsAt, Math.max(at, ctx.currentTime));
        return;
      }
      endsAt = env.release(at, fade) + 0.02;
      stopAll(endsAt);
    },
    dispose() {
      stopAll(0);
      disconnect();
    },
    levelAt: (t: number) => (t < startsAt || t >= endsAt ? 0 : env.levelAt(t)),
    get endsAt() { return endsAt; },
    get startsAt() { return startsAt; },
  };
}

// ---------- FM (2-op) ----------
function makeFmVoice(p: VoiceParams): Voice {
  const { ctx, destination, preset, timbre, adsr, freq, velocity } = p;

  // Per-preset character defaults.
  const cfg = (() => {
    switch (preset) {
      case "rhodes":
        // Tine: harmonicity ~14, low-ish mod index that decays quickly.
        return { harmonicity: 14, modIndexBase: 60, modIndexPeak: 320, modDecay: 0.8 };
      case "dxkeys":
        return { harmonicity: 1, modIndexBase: 80, modIndexPeak: 220, modDecay: 1.5 };
      case "glassPad":
        // A non-integer ratio rings like struck glass, then settles to a soft sine.
        return { harmonicity: 3.5, modIndexBase: 15, modIndexPeak: 110, modDecay: 2.5 };
      case "piano":
      default:
        return { harmonicity: 1, modIndexBase: 30, modIndexPeak: 120, modDecay: 0.6 };
    }
  })();

  // Timbre macro mapping.
  const t = timbre;
  const modIndex = cfg.modIndexBase + (cfg.modIndexPeak - cfg.modIndexBase) * t;

  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const modulator = ctx.createOscillator();
  modulator.type = "sine";
  modulator.frequency.value = freq * cfg.harmonicity;

  const modGain = ctx.createGain();
  modGain.gain.value = freq * modIndex / 100;

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  carrier.connect(amp);

  // Slight tone shaping based on preset (a soft lowpass for piano warmth)
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = preset === "rhodes" ? 5500 : preset === "piano" ? 4500 : preset === "glassPad" ? 8000 : 7500;
  tone.Q.value = 0.4;
  amp.connect(tone);
  tone.connect(destination);

  return assembleVoice({
    // The glass ratio's sidebands add ~6 dB over the other FM presets.
    ctx, adsr, amp, peak: preset === "glassPad" ? velocity * 0.5 : velocity,
    sources: [carrier, modulator],
    nodes: [amp, tone, modGain],
    onStart(at) {
      // Mod-index envelope: fast bell-like decay.
      const mg = modGain.gain;
      const startVal = freq * (modIndex * 1.6) / 100;
      const tailVal = freq * (modIndex * 0.3) / 100;
      mg.cancelScheduledValues(at);
      mg.setValueAtTime(startVal, at);
      mg.exponentialRampToValueAtTime(Math.max(0.0001, tailVal), at + cfg.modDecay);
    },
  });
}

// ---------- Subtractive ----------

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of seeded white noise per context, shared by every voice. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let x = 0x9e3779b9;
  for (let i = 0; i < d.length; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    d[i] = ((x >>> 0) / 4294967296) * 2 - 1;
  }
  noiseBuffers.set(ctx, buf);
  return buf;
}
function makeSubtractiveVoice(p: VoiceParams): Voice {
  const { ctx, destination, preset, timbre, adsr, freq, velocity } = p;

  // Per-preset oscillator stack.
  const stack: { type: OscillatorType; detuneCents: number; gain: number }[] = (() => {
    switch (preset) {
      case "stringMachine":
        // Rich detuned saws — ensemble sound.
        return [
          { type: "sawtooth", detuneCents: -10, gain: 0.4 },
          { type: "sawtooth", detuneCents: 0,   gain: 0.4 },
          { type: "sawtooth", detuneCents: +10, gain: 0.4 },
          { type: "sawtooth", detuneCents: -1200 + 7, gain: 0.2 },
        ];
      case "warmPad":
        return [
          { type: "sawtooth", detuneCents: -12, gain: 0.35 },
          { type: "sawtooth", detuneCents: +12, gain: 0.35 },
          { type: "sine",     detuneCents: -1200, gain: 0.45 },
        ];
      case "sweepPad":
        return [
          { type: "sawtooth", detuneCents: -6, gain: 0.4 },
          { type: "sawtooth", detuneCents: +6, gain: 0.4 },
          { type: "square",   detuneCents: -1200, gain: 0.2 },
        ];
      case "airPad":
        return [
          { type: "triangle", detuneCents: -5, gain: 0.5 },
          { type: "triangle", detuneCents: +5, gain: 0.5 },
          { type: "sine",     detuneCents: +1200, gain: 0.15 },
        ];
      case "organ":
        // Drawbar harmonics: 16', 8', 4', 2 2/3'
        return [
          { type: "sine", detuneCents: -1200, gain: 0.35 },
          { type: "sine", detuneCents: 0,     gain: 0.45 },
          { type: "sine", detuneCents: +1200, gain: 0.30 },
          { type: "sine", detuneCents: +1902, gain: 0.18 }, // ~3rd harmonic
        ];
      case "juno":
      default:
        return [
          { type: "sawtooth", detuneCents: -7, gain: 0.5 },
          { type: "sawtooth", detuneCents: +7, gain: 0.5 },
          { type: "square",   detuneCents: 0,  gain: 0.18 },
        ];
    }
  })();

  // Filter cutoff macro mapping.
  const cutoff = (() => {
    switch (preset) {
      case "stringMachine":
        // Timbre = ensemble → slightly opens cutoff and boosts detune amount via LFO.
        return 1200 + timbre * 4500;
      case "organ":
        // Timbre = drawbar mix (handled below by re-balancing harmonics).
        return 6000;
      case "warmPad":
        return 600 + timbre * 3400;
      case "sweepPad":
        return 900;
      case "airPad":
        return 5000;
      case "juno":
      default:
        return 250 + Math.pow(timbre, 2) * 7500;
    }
  })();

  const sources = stack.map((s) => {
    const o = ctx.createOscillator();
    o.type = s.type;
    o.frequency.value = freq;
    o.detune.value = s.detuneCents;
    const g = ctx.createGain();
    let gn = s.gain;
    if (preset === "organ") {
      // Re-balance drawbars by timbre macro: low → fundamental-heavy, high → bright harmonics.
      if (s.detuneCents <= 0) gn *= 1.3 - timbre * 0.6;
      else gn *= 0.4 + timbre * 0.9;
    }
    g.gain.value = gn;
    o.connect(g);
    return { o, g };
  });

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = preset === "juno" ? 1.2 : preset === "sweepPad" ? 5 : 0.6;
  sources.forEach((s) => s.g.connect(filter));

  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  filter.connect(amp);
  amp.connect(destination);

  // String Machine ensemble LFO — wobbles individual osc detunes.
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (preset === "stringMachine") {
    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5.5;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 6 + timbre * 14; // cents
    lfo.connect(lfoGain);
    sources.forEach((s) => lfoGain!.connect(s.o.detune));
  }

  // Sweep Pad: a slow LFO opens and closes the resonant filter.
  let sweep: OscillatorNode | null = null;
  let sweepGain: GainNode | null = null;
  if (preset === "sweepPad") {
    sweep = ctx.createOscillator();
    sweep.frequency.value = 0.12 + timbre * 0.3;
    sweepGain = ctx.createGain();
    sweepGain.gain.value = 300 + timbre * 1800;
    sweep.connect(sweepGain).connect(filter.frequency);
  }

  // Air Pad: breath noise, band-passed a couple of octaves above the note.
  let noise: AudioBufferSourceNode | null = null;
  let noiseNodes: AudioNode[] = [];
  if (preset === "airPad") {
    noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = Math.min(9000, freq * 4);
    band.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.15 + timbre * 0.6;
    noise.connect(band).connect(noiseGain).connect(filter);
    noiseNodes = [band, noiseGain];
  }

  const extraSources: AudioScheduledSourceNode[] = [];
  for (const n of [lfo, sweep, noise]) if (n) extraSources.push(n);
  const extraNodes: AudioNode[] = [...noiseNodes];
  for (const n of [lfoGain, sweepGain]) if (n) extraNodes.push(n);

  return assembleVoice({
    ctx, adsr, amp, peak: velocity * 0.7,
    sources: [...sources.map((s) => s.o), ...extraSources],
    nodes: [...sources.map((s) => s.g), filter, amp, ...extraNodes],
    onStart(at) {
      if (preset !== "warmPad") return;
      // The filter opens as the note swells in.
      const f = filter.frequency;
      f.setValueAtTime(cutoff * 0.3, at);
      f.exponentialRampToValueAtTime(cutoff, at + Math.max(0.05, adsr.attack + adsr.decay));
    },
  });
}

// ---------- Formant (vocal choir) ----------
// Vowel formant frequencies (F1, F2, F3) for a male/mixed choir.
const VOWELS = {
  ah: [800, 1150, 2900],
  oo: [325, 700,  2530],
};

function makeFormantVoice(p: VoiceParams): Voice {
  const { ctx, destination, timbre, adsr, freq, velocity } = p;

  // Source: detuned saws (3 voices for choir thickness).
  const sources = [-7, 0, +7].map((d) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = d;
    return o;
  });
  const sourceMix = ctx.createGain();
  sourceMix.gain.value = 0.5;
  sources.forEach((o) => o.connect(sourceMix));

  // Interpolate between Ah (timbre=0) and Oo (timbre=1).
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const f1 = mix(VOWELS.ah[0], VOWELS.oo[0], timbre);
  const f2 = mix(VOWELS.ah[1], VOWELS.oo[1], timbre);
  const f3 = mix(VOWELS.ah[2], VOWELS.oo[2], timbre);

  const formants = [f1, f2, f3].map((center, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = center;
    bp.Q.value = 12 + i * 2;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1.0 : i === 1 ? 0.7 : 0.45;
    sourceMix.connect(bp); bp.connect(g);
    return g;
  });

  const sum = ctx.createGain();
  // The narrow formant bandpasses drop ~20 dB versus the other engines.
  sum.gain.value = 4.5;
  formants.forEach((g) => g.connect(sum));

  // Slight tremolo / vibrato to humanize.
  const vibrato = ctx.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.value = 5;
  const vibGain = ctx.createGain();
  vibGain.gain.value = 4; // cents
  vibrato.connect(vibGain);
  sources.forEach((o) => vibGain.connect(o.detune));

  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  sum.connect(amp);
  amp.connect(destination);

  return assembleVoice({
    ctx, adsr, amp, peak: velocity * 0.6,
    sources: [...sources, vibrato],
    nodes: [sourceMix, vibGain, ...formants, sum, amp],
  });
}

export function engineFor(preset: SoundPreset): SoundEngine {
  return PRESET_BY_VALUE[preset].engine;
}

export function makeVoice(p: VoiceParams): Voice {
  switch (engineFor(p.preset)) {
    case "fm":          return makeFmVoice(p);
    case "formant":     return makeFormantVoice(p);
    case "subtractive":
    default:            return makeSubtractiveVoice(p);
  }
}
