// Phase 1.6 — Shared AudioContext + master FX chain.
//
// Graph:
//   voice -> voiceBus -> eq(low,mid,high) -> chorus(send/wet) ─┐
//                                                              ├-> dryBus
//                                                              ├-> delay -> reverb -> wet
//                                                              ├-> reverb -> wet
//   dryBus + wet -> limiter -> destination
//
// All graph nodes are constructed lazily on first call so that the
// AudioContext only resumes after a user gesture (Tone.start() handles
// the actual resume in the engine layer).

let ctx: AudioContext | null = null;

/**
 * Returns the shared AudioContext used by both the Web Audio synthesis layer
 * and Tone.js scheduling. Callers may inject the context explicitly (the
 * engine layer passes Tone's raw context after Tone.start()) so that
 * scheduled times line up with `Tone.now()` exactly.
 */
export function getAudioContext(injected?: AudioContext): AudioContext {
  if (injected && !ctx) ctx = injected;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext =
    (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  ctx = new Ctor({ latencyHint: "interactive" });
  return ctx;
}

export interface MasterChain {
  ctx: AudioContext;
  /** All synth voices connect here. */
  voiceBus: GainNode;
  // EQ
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  // Chorus
  chorusSend: GainNode;
  chorusWet: GainNode;
  chorus: ChorusNode;
  // Delay (BPM-syncable from outside)
  delaySend: GainNode;
  delay: DelayNode;
  delayFb: GainNode;
  delayWet: GainNode;
  // Reverb (synthetic IR convolver)
  reverbSend: GainNode;
  reverb: ConvolverNode;
  reverbWet: GainNode;
  // Master
  master: GainNode;
  limiter: DynamicsCompressorNode;
  /** Rebuild the synthetic IR for the given decay time (sec). */
  setReverbDecay: (decaySec: number) => void;
}

export interface ChorusNode {
  input: GainNode;
  output: GainNode;
  /** Set LFO rate Hz. */
  setRate: (hz: number) => void;
  /** Set depth 0..1. */
  setDepth: (d: number) => void;
}

let chain: MasterChain | null = null;

function makeChorus(ac: AudioContext): ChorusNode {
  // Two stereo-ish detuned delay lines modulated by sine LFOs in opposite phase.
  const input = ac.createGain();
  const output = ac.createGain();
  const split = ac.createGain();
  input.connect(split);

  const makeBranch = (basisMs: number, lfoPhaseOffsetSec: number) => {
    const delay = ac.createDelay(0.05);
    delay.delayTime.value = basisMs / 1000;
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.8;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.003; // 3 ms depth default
    lfo.connect(lfoGain).connect(delay.delayTime);
    lfo.start(ac.currentTime + lfoPhaseOffsetSec);
    split.connect(delay).connect(output);
    return { lfo, lfoGain, delay, basis: basisMs / 1000 };
  };
  const a = makeBranch(12, 0);
  const b = makeBranch(20, 0.25);
  // Pass-through some dry through the chorus block? No — caller mixes wet/dry.

  return {
    input,
    output,
    setRate: (hz) => {
      a.lfo.frequency.setTargetAtTime(hz, ac.currentTime, 0.05);
      b.lfo.frequency.setTargetAtTime(hz * 1.13, ac.currentTime, 0.05);
    },
    setDepth: (d) => {
      const max = 0.006; // 6 ms max swing
      a.lfoGain.gain.setTargetAtTime(d * max, ac.currentTime, 0.05);
      b.lfoGain.gain.setTargetAtTime(d * max, ac.currentTime, 0.05);
    },
  };
}

function makeImpulseResponse(ac: AudioContext, decaySec: number): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.max(1, Math.floor(rate * decaySec));
  const ir = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponential decay of white noise. Slight pre-delay shaping at the head.
      const env = Math.pow(1 - t, 3);
      const head = Math.min(1, i / (rate * 0.01));
      data[i] = (Math.random() * 2 - 1) * env * head;
    }
  }
  return ir;
}

export function getMasterChain(): MasterChain {
  if (chain) return chain;
  const ac = getAudioContext();

  const voiceBus = ac.createGain();
  voiceBus.gain.value = 1;

  // EQ — series lowshelf -> peaking -> highshelf
  const eqLow = ac.createBiquadFilter();
  eqLow.type = "lowshelf"; eqLow.frequency.value = 200; eqLow.gain.value = 0;
  const eqMid = ac.createBiquadFilter();
  eqMid.type = "peaking"; eqMid.frequency.value = 1000; eqMid.Q.value = 0.9; eqMid.gain.value = 0;
  const eqHigh = ac.createBiquadFilter();
  eqHigh.type = "highshelf"; eqHigh.frequency.value = 4500; eqHigh.gain.value = 0;
  voiceBus.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);

  // Limiter (master)
  const master = ac.createGain();
  master.gain.value = 1;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  master.connect(limiter); limiter.connect(ac.destination);

  // Dry path
  eqHigh.connect(master);

  // Chorus
  const chorusSend = ac.createGain(); chorusSend.gain.value = 0;
  const chorusWet = ac.createGain(); chorusWet.gain.value = 1;
  const chorus = makeChorus(ac);
  eqHigh.connect(chorusSend);
  chorusSend.connect(chorus.input);
  chorus.output.connect(chorusWet);
  chorusWet.connect(master);

  // Delay (BPM-syncable from engine)
  const delaySend = ac.createGain(); delaySend.gain.value = 0;
  const delay = ac.createDelay(2.0);
  delay.delayTime.value = 0.25;
  const delayFb = ac.createGain(); delayFb.gain.value = 0.25;
  const delayWet = ac.createGain(); delayWet.gain.value = 1;
  eqHigh.connect(delaySend);
  delaySend.connect(delay);
  delay.connect(delayFb); delayFb.connect(delay);
  delay.connect(delayWet); delayWet.connect(master);

  // Reverb
  const reverbSend = ac.createGain(); reverbSend.gain.value = 0;
  const reverb = ac.createConvolver();
  reverb.normalize = true;
  const reverbWet = ac.createGain(); reverbWet.gain.value = 1;
  reverb.buffer = makeImpulseResponse(ac, 2.2);
  eqHigh.connect(reverbSend); reverbSend.connect(reverb);
  delay.connect(reverbSend); // delay tails into reverb
  reverb.connect(reverbWet); reverbWet.connect(master);

  chain = {
    ctx: ac, voiceBus,
    eqLow, eqMid, eqHigh,
    chorusSend, chorusWet, chorus,
    delaySend, delay, delayFb, delayWet,
    reverbSend, reverb, reverbWet,
    master, limiter,
    setReverbDecay: (d) => {
      reverb.buffer = makeImpulseResponse(ac, Math.max(0.2, d));
    },
  };
  return chain;
}
