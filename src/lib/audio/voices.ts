// Phase 1.6 — Web Audio voice engines.
//
// Three archetypes:
//   - FM (2-op)         : "rhodes", "dxkeys", "piano"
//   - Subtractive       : "juno", "stringMachine", "organ"
//   - Formant (vocal)   : "vocalChoir"
//
// The exported makeVoice() returns a Voice that owns its own subgraph and
// provides triggerAttack/triggerRelease + an immediate dispose() for cleanup.
// The engine layer handles polyphony limiting (max 16 voices).

import type { ADSR, SoundPreset, SoundEngine } from "@/store/sound";
import { PRESET_BY_VALUE } from "@/store/sound";

export interface VoiceParams {
  ctx: AudioContext;
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
  /** Begin release envelope at the given time. */
  release(at: number): void;
  /** Hard-stop and disconnect. Safe to call any time. */
  dispose(): void;
  /** Audio-context time at which the voice will be silent and self-removable. */
  endsAt: number;
}

// Convenience: schedule a smooth ADSR on a GainNode at the given start time.
function applyAttack(g: GainNode, adsr: ADSR, peak: number, at: number) {
  const p = g.gain;
  p.cancelScheduledValues(at);
  p.setValueAtTime(0.0001, at);
  p.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + Math.max(0.001, adsr.attack));
  const sustainLevel = Math.max(0.0001, peak * Math.max(0.0001, adsr.sustain));
  p.exponentialRampToValueAtTime(sustainLevel, at + adsr.attack + Math.max(0.001, adsr.decay));
}

function applyRelease(g: GainNode, adsr: ADSR, at: number): number {
  const p = g.gain;
  // Read current value to start a smooth tail
  const v = Math.max(0.0001, p.value);
  p.cancelScheduledValues(at);
  p.setValueAtTime(v, at);
  p.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, adsr.release));
  return at + adsr.release + 0.05;
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
  tone.frequency.value = preset === "rhodes" ? 5500 : preset === "piano" ? 4500 : 7500;
  tone.Q.value = 0.4;
  amp.connect(tone);
  tone.connect(destination);

  const peak = velocity;
  let endsAt = Infinity;

  return {
    start(at: number) {
      carrier.start(at);
      modulator.start(at);
      applyAttack(amp, adsr, peak, at);
      // Mod-index envelope: fast bell-like decay.
      const mg = modGain.gain;
      const startVal = freq * (modIndex * 1.6) / 100;
      const tailVal = freq * (modIndex * 0.3) / 100;
      mg.cancelScheduledValues(at);
      mg.setValueAtTime(startVal, at);
      mg.exponentialRampToValueAtTime(Math.max(0.0001, tailVal), at + cfg.modDecay);
    },
    release(at: number) {
      endsAt = applyRelease(amp, adsr, at);
      try { carrier.stop(endsAt + 0.1); } catch { /* noop */ }
      try { modulator.stop(endsAt + 0.1); } catch { /* noop */ }
    },
    dispose() {
      try { carrier.stop(); } catch { /* noop */ }
      try { modulator.stop(); } catch { /* noop */ }
      try { amp.disconnect(); } catch { /* noop */ }
      try { tone.disconnect(); } catch { /* noop */ }
      try { modGain.disconnect(); } catch { /* noop */ }
    },
    get endsAt() { return endsAt; },
  };
}

// ---------- Subtractive ----------
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
  filter.Q.value = preset === "juno" ? 1.2 : 0.6;
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

  const peak = velocity * 0.7;
  let endsAt = Infinity;

  return {
    start(at: number) {
      sources.forEach((s) => s.o.start(at));
      lfo?.start(at);
      applyAttack(amp, adsr, peak, at);
    },
    release(at: number) {
      endsAt = applyRelease(amp, adsr, at);
      sources.forEach((s) => { try { s.o.stop(endsAt + 0.1); } catch { /* noop */ } });
      try { lfo?.stop(endsAt + 0.1); } catch { /* noop */ }
    },
    dispose() {
      sources.forEach((s) => { try { s.o.stop(); } catch {/*noop*/} try { s.g.disconnect(); } catch {/*noop*/} });
      try { lfo?.stop(); } catch {/*noop*/}
      try { lfoGain?.disconnect(); } catch {/*noop*/}
      try { filter.disconnect(); } catch {/*noop*/}
      try { amp.disconnect(); } catch {/*noop*/}
    },
    get endsAt() { return endsAt; },
  };
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
  sum.gain.value = 0.6;
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

  const peak = velocity * 0.6;
  let endsAt = Infinity;

  return {
    start(at: number) {
      sources.forEach((o) => o.start(at));
      vibrato.start(at);
      applyAttack(amp, adsr, peak, at);
    },
    release(at: number) {
      endsAt = applyRelease(amp, adsr, at);
      sources.forEach((o) => { try { o.stop(endsAt + 0.1); } catch {/*noop*/} });
      try { vibrato.stop(endsAt + 0.1); } catch {/*noop*/}
    },
    dispose() {
      sources.forEach((o) => { try { o.stop(); } catch {/*noop*/} });
      try { vibrato.stop(); } catch {/*noop*/}
      try { vibGain.disconnect(); } catch {/*noop*/}
      formants.forEach((g) => { try { g.disconnect(); } catch {/*noop*/} });
      try { sum.disconnect(); } catch {/*noop*/}
      try { amp.disconnect(); } catch {/*noop*/}
    },
    get endsAt() { return endsAt; },
  };
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
