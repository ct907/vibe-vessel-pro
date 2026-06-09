// Offline chord detection — runs entirely client-side, no upload.
//
// Pipeline: downmix to mono -> downsample -> Hann-windowed FFT frames ->
// 12-bin chromagram -> median-smooth -> match against chord templates derived
// from QUALITY_INTERVALS -> merge into a stable chord timeline.
//
// Accuracy is good on clean, simple recordings (solo piano/guitar) and
// degrades on dense or distorted material — surfaced to the user via the
// per-chord `confidence` and a UI disclaimer.

import { fftMagnitudes } from "./fft";
import { QUALITY_INTERVALS, QUALITY_PRETTY, pcToName, type ChordSymbol, type Quality } from "./chords";

export interface DetectedChord {
  chord: ChordSymbol;
  startSec: number;
  endSec: number;
  /** Cosine-similarity match score of the winning template, 0..1. */
  confidence: number;
}

export interface DetectOptions {
  /** Spell roots with flats (from the song key) instead of sharps. */
  useFlat?: boolean;
  /** 0..1 progress callback while framing the signal. */
  onProgress?: (progress: number) => void;
}

const TARGET_SR = 11025;
const FRAME = 4096;
const HOP = 2048;
const FMIN = 65; // ~C2
const FMAX = 2000;
const SMOOTH_RADIUS = 2; // chroma median filter half-window (5 frames)
const MIN_SEGMENT_SEC = 0.4;
// Below this fraction of the loudest frame's energy, treat a frame as silence.
const SILENCE_REL = 0.04;

// Qualities the matcher can output. A robust common set — exotic extensions
// rarely survive template matching on real audio and only add false splits.
const TEMPLATE_QUALITIES: Quality[] = [
  "maj", "min", "7", "maj7", "min7", "dim", "m7b5", "sus4", "aug", "6",
];

interface Template {
  rootPc: number;
  quality: Quality;
  /** L2-normalized 12-bin pitch-class mask. */
  vec: Float32Array;
}

const TEMPLATES: Template[] = buildTemplates();

function buildTemplates(): Template[] {
  const out: Template[] = [];
  for (const quality of TEMPLATE_QUALITIES) {
    const mask = new Float32Array(12);
    for (const interval of QUALITY_INTERVALS[quality]) mask[interval % 12] = 1;
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const vec = new Float32Array(12);
      let norm = 0;
      for (let pc = 0; pc < 12; pc++) {
        const v = mask[(pc - rootPc + 12) % 12];
        vec[pc] = v;
        norm += v * v;
      }
      const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
      for (let pc = 0; pc < 12; pc++) vec[pc] *= inv;
      out.push({ rootPc, quality, vec });
    }
  }
  return out;
}

/** Average all channels of an AudioBuffer into a single Float32Array. */
export function downmixMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  if (ch > 1) for (let i = 0; i < len; i++) out[i] /= ch;
  return out;
}

/** Linear-interpolation resample to TARGET_SR. */
function resample(data: Float32Array, fromSr: number): Float32Array {
  if (fromSr === TARGET_SR) return data;
  const ratio = TARGET_SR / fromSr;
  const outLen = Math.max(0, Math.floor(data.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, data.length - 1);
    const frac = src - i0;
    out[i] = data[i0] * (1 - frac) + data[i1] * frac;
  }
  return out;
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

const HANN = hannWindow(FRAME);

/** Fold an FFT magnitude spectrum into a 12-bin pitch-class profile. */
function chromaFromSpectrum(mag: Float32Array, sr: number): Float32Array {
  const chroma = new Float32Array(12);
  const binHz = sr / FRAME;
  const kMin = Math.max(1, Math.floor(FMIN / binHz));
  const kMax = Math.min(mag.length - 1, Math.ceil(FMAX / binHz));
  for (let k = kMin; k <= kMax; k++) {
    const freq = k * binHz;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag[k];
  }
  return chroma;
}

function l2normalize(v: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  if (norm <= 0) return;
  const inv = 1 / Math.sqrt(norm);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
}

/** Median-filter chroma frames per pitch class to suppress frame-level jitter. */
function smoothChroma(frames: Float32Array[]): Float32Array[] {
  const n = frames.length;
  const out: Float32Array[] = [];
  const scratch: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(12);
    for (let pc = 0; pc < 12; pc++) {
      scratch.length = 0;
      for (let j = Math.max(0, i - SMOOTH_RADIUS); j <= Math.min(n - 1, i + SMOOTH_RADIUS); j++) {
        scratch.push(frames[j][pc]);
      }
      scratch.sort((a, b) => a - b);
      v[pc] = scratch[scratch.length >> 1];
    }
    out.push(v);
  }
  return out;
}

/** Best-matching template for one (L2-normalized) chroma vector. */
function matchTemplate(chroma: Float32Array): { index: number; score: number } {
  let best = -1;
  let bestScore = -Infinity;
  for (let t = 0; t < TEMPLATES.length; t++) {
    const vec = TEMPLATES[t].vec;
    let dot = 0;
    for (let pc = 0; pc < 12; pc++) dot += chroma[pc] * vec[pc];
    if (dot > bestScore) {
      bestScore = dot;
      best = t;
    }
  }
  return { index: best, score: bestScore };
}

function templateToChord(t: Template, useFlat: boolean): ChordSymbol {
  const root = pcToName(t.rootPc, useFlat);
  return { root, quality: t.quality, display: root + QUALITY_PRETTY[t.quality] };
}

/**
 * Detect chords from raw mono/multi-channel PCM. The worker path calls this
 * with a single channel already downmixed; `detectChordsFromAudioBuffer`
 * downmixes first.
 */
export function detectChordsFromChannelData(
  channel: Float32Array,
  sampleRate: number,
  opts: DetectOptions = {},
): DetectedChord[] {
  const useFlat = opts.useFlat ?? false;
  const mono = resample(channel, sampleRate);
  if (mono.length < FRAME) return [];

  const rawFrames: Float32Array[] = [];
  const energies: number[] = [];
  const windowed = new Float32Array(FRAME);
  const frameCount = Math.floor((mono.length - FRAME) / HOP) + 1;

  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP;
    let energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = mono[start + i] * HANN[i];
      windowed[i] = s;
      energy += s * s;
    }
    const chroma = chromaFromSpectrum(fftMagnitudes(windowed), TARGET_SR);
    rawFrames.push(chroma);
    energies.push(energy);
    if (opts.onProgress && (f & 31) === 0) opts.onProgress(f / frameCount);
  }
  opts.onProgress?.(1);

  const maxEnergy = energies.reduce((m, e) => Math.max(m, e), 0);
  const silenceFloor = maxEnergy * SILENCE_REL;

  const smoothed = smoothChroma(rawFrames);

  // Per-frame label: template index, or -1 for silence.
  const labels: number[] = [];
  const scores: number[] = [];
  for (let f = 0; f < smoothed.length; f++) {
    if (energies[f] < silenceFloor) {
      labels.push(-1);
      scores.push(0);
      continue;
    }
    const v = smoothed[f];
    l2normalize(v);
    const { index, score } = matchTemplate(v);
    labels.push(index);
    scores.push(score);
  }

  const hopSec = HOP / TARGET_SR;
  return buildSegments(labels, scores, hopSec, useFlat);
}

function buildSegments(
  labels: number[],
  scores: number[],
  hopSec: number,
  useFlat: boolean,
): DetectedChord[] {
  interface Seg { label: number; start: number; end: number; scoreSum: number; frames: number; }
  const raw: Seg[] = [];
  for (let f = 0; f < labels.length; f++) {
    const label = labels[f];
    const start = f * hopSec;
    const end = start + hopSec;
    const last = raw[raw.length - 1];
    if (last && last.label === label) {
      last.end = end;
      last.scoreSum += scores[f];
      last.frames += 1;
    } else {
      raw.push({ label, start, end, scoreSum: scores[f], frames: 1 });
    }
  }

  // Absorb sub-threshold and silence segments into the previous chord so the
  // timeline doesn't flicker. A leading short/silent run is dropped.
  const merged: Seg[] = [];
  for (const seg of raw) {
    const tooShort = seg.end - seg.start < MIN_SEGMENT_SEC;
    if (seg.label < 0 || tooShort) {
      const prev = merged[merged.length - 1];
      if (prev) {
        prev.end = seg.end;
        if (seg.label >= 0) { prev.scoreSum += seg.scoreSum; prev.frames += seg.frames; }
      }
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.label === seg.label) {
      prev.end = seg.end;
      prev.scoreSum += seg.scoreSum;
      prev.frames += seg.frames;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged
    .filter((seg) => seg.label >= 0)
    .map((seg) => ({
      chord: templateToChord(TEMPLATES[seg.label], useFlat),
      startSec: seg.start,
      endSec: seg.end,
      confidence: seg.frames > 0 ? seg.scoreSum / seg.frames : 0,
    }));
}

/** Convenience wrapper for a decoded AudioBuffer (main-thread path). */
export function detectChordsFromAudioBuffer(buffer: AudioBuffer, opts: DetectOptions = {}): DetectedChord[] {
  return detectChordsFromChannelData(downmixMono(buffer), buffer.sampleRate, opts);
}
