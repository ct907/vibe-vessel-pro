// Offline monophonic melody extraction. Same autocorrelation core as the
// realtime pitch detector (lib/audio/pitch-detector.ts), but run over a whole
// decoded take and segmented into discrete notes with start/end times.

export interface MelodyNote {
  midi: number;
  noteName: string;
  startSec: number;
  endSec: number;
}

export interface DetectMelodyOptions {
  useFlat?: boolean;
  onProgress?: (progress: number) => void;
}

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Working sample rate — autocorrelation cost scales with rate², and 16 kHz
// comfortably covers the 60–1300 Hz vocal range.
const TARGET_RATE = 16000;
const FRAME = 1024;
const HOP = 256;
const FMIN = 60;
const FMAX = 1300;
const MIN_NOTE_SEC = 0.1;
const MAX_UNVOICED_GAP_FRAMES = 3;

function midiToName(midi: number, useFlat: boolean): string {
  const names = useFlat ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${names[pc]}${oct}`;
}

function downsample(channel: Float32Array, sampleRate: number): { data: Float32Array; rate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_RATE));
  if (factor === 1) return { data: channel, rate: sampleRate };
  const out = new Float32Array(Math.floor(channel.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    const base = i * factor;
    for (let j = 0; j < factor; j++) sum += channel[base + j];
    out[i] = sum / factor;
  }
  return { data: out, rate: sampleRate / factor };
}

/** Autocorrelation pitch of one frame, or null when unvoiced. */
function framePitch(data: Float32Array, offset: number, rate: number, corr: Float32Array): number | null {
  let energy = 0;
  for (let i = 0; i < FRAME; i++) {
    const v = data[offset + i];
    energy += v * v;
  }
  const meanSq = energy / FRAME;
  if (meanSq < 0.00001) return null;

  const minLag = Math.floor(rate / FMAX);
  const maxLag = Math.min(FRAME - 2, Math.ceil(rate / FMIN));

  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    const n = FRAME - lag;
    for (let i = 0; i < n; i++) sum += data[offset + i] * data[offset + i + lag];
    corr[lag] = n > 0 ? sum / n : 0;
  }

  let bestLag = minLag;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corr[lag] > corr[bestLag]) bestLag = lag;
  }

  // Clarity: periodic energy relative to total energy. Noise and consonants
  // score low even when loud.
  if (corr[bestLag] / meanSq < 0.45) return null;

  const y1 = bestLag > minLag ? corr[bestLag - 1] : corr[bestLag];
  const y2 = corr[bestLag];
  const y3 = bestLag < maxLag ? corr[bestLag + 1] : corr[bestLag];
  const denom = 2 * (2 * y2 - y1 - y3);
  const shift = denom !== 0 ? (y3 - y1) / denom : 0;

  const freq = rate / (bestLag + shift);
  if (freq < FMIN || freq > FMAX * 1.05) return null;
  return freq;
}

export function detectMelodyFromChannelData(
  channel: Float32Array,
  sampleRate: number,
  opts: DetectMelodyOptions = {},
): MelodyNote[] {
  const { data, rate } = downsample(channel, sampleRate);
  const frameCount = Math.floor((data.length - FRAME) / HOP) + 1;
  if (frameCount <= 0) return [];

  const corr = new Float32Array(FRAME);
  const midiPerFrame = new Float32Array(frameCount).fill(NaN);

  for (let f = 0; f < frameCount; f++) {
    const freq = framePitch(data, f * HOP, rate, corr);
    if (freq !== null) midiPerFrame[f] = 69 + 12 * Math.log2(freq / 440);
    if (f % 64 === 0) opts.onProgress?.(f / frameCount);
  }

  // Median filter (window 5) kills single-frame octave errors and flickers.
  const smoothed = new Float32Array(frameCount).fill(NaN);
  const win: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    win.length = 0;
    for (let k = Math.max(0, f - 2); k <= Math.min(frameCount - 1, f + 2); k++) {
      if (!Number.isNaN(midiPerFrame[k])) win.push(midiPerFrame[k]);
    }
    if (win.length >= 3 && !Number.isNaN(midiPerFrame[f])) {
      win.sort((a, b) => a - b);
      smoothed[f] = win[Math.floor(win.length / 2)];
    }
  }

  const hopSec = HOP / rate;
  const useFlat = opts.useFlat ?? false;
  const notes: MelodyNote[] = [];
  let curMidi: number | null = null;
  let curStart = 0;
  let lastVoiced = 0;
  let gap = 0;

  const close = (endFrame: number) => {
    if (curMidi === null) return;
    const startSec = curStart * hopSec;
    const endSec = endFrame * hopSec;
    if (endSec - startSec >= MIN_NOTE_SEC) {
      notes.push({ midi: curMidi, noteName: midiToName(curMidi, useFlat), startSec, endSec });
    }
    curMidi = null;
  };

  for (let f = 0; f < frameCount; f++) {
    const m = smoothed[f];
    if (Number.isNaN(m)) {
      if (curMidi !== null && ++gap > MAX_UNVOICED_GAP_FRAMES) close(lastVoiced + 1);
      continue;
    }
    gap = 0;
    const rounded = Math.round(m);
    if (curMidi === null) {
      curMidi = rounded;
      curStart = f;
    } else if (rounded !== curMidi) {
      close(f);
      curMidi = rounded;
      curStart = f;
    }
    lastVoiced = f;
  }
  close(lastVoiced + 1);

  opts.onProgress?.(1);
  return notes;
}
