import { getAudioContext } from "@/lib/audio/context";

// Autocorrelation-based monophonic pitch detector.
// Accurate from ~60 Hz (low bass) to 1300 Hz (high soprano).

function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const SIZE = buffer.length;

  // Silence gate — avoid detecting noise as a pitch.
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  if (rms / SIZE < 0.00025) return null;

  const minLag = Math.floor(sampleRate / 1300);
  const maxLag = Math.min(SIZE - 2, Math.ceil(sampleRate / 60));

  // Normalised autocorrelation
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    const n = SIZE - lag;
    for (let i = 0; i < n; i++) sum += buffer[i] * buffer[i + lag];
    corr[lag] = n > 0 ? sum / n : 0;
  }

  // Find the lag with the highest correlation (ignoring the zero-lag peak).
  let bestLag = minLag;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corr[lag] > corr[bestLag]) bestLag = lag;
  }

  if (corr[bestLag] < 0.005) return null;

  // Parabolic interpolation for sub-sample precision.
  const y1 = bestLag > minLag ? corr[bestLag - 1] : corr[bestLag];
  const y2 = corr[bestLag];
  const y3 = bestLag < maxLag ? corr[bestLag + 1] : corr[bestLag];
  const denom = 2 * (2 * y2 - y1 - y3);
  const shift = denom !== 0 ? (y3 - y1) / denom : 0;

  return sampleRate / (bestLag + shift);
}

export interface PitchResult {
  freq: number;
  midi: number;       // rounded to nearest semitone
  midiExact: number;  // fractional MIDI value
  cents: number;      // deviation from nearest semitone (-50 … +50)
  noteName: string;   // e.g. "A4"
}

export interface PitchHandle {
  stop: () => void;
}

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function freqToPitchResult(freq: number): PitchResult {
  const midiExact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiExact);
  const cents = Math.round((midiExact - midi) * 100);
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return { freq, midi, midiExact, cents, noteName: `${NOTE_NAMES_SHARP[pc]}${oct}` };
}

export async function startPitchDetection(
  onPitch: (result: PitchResult | null) => void,
): Promise<PitchHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ac = getAudioContext();
  if (ac.state === "suspended") {
    try { await ac.resume(); } catch { /* noop */ }
  }
  const src = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let rafId = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buffer);
    const freq = detectPitch(buffer, ac.sampleRate);
    if (freq !== null && freq > 60 && freq < 1350) {
      onPitch(freqToPitchResult(freq));
    } else {
      onPitch(null);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      try { src.disconnect(); } catch { /* noop */ }
      try { analyser.disconnect(); } catch { /* noop */ }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
