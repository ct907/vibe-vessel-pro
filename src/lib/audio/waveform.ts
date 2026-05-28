import { getAudioContext } from "@/lib/audio/context";

const peaksCache = new Map<string, Float32Array>();

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arr = await blob.arrayBuffer();
  return await getAudioContext().decodeAudioData(arr);
}

export function computePeaks(buffer: AudioBuffer, targetSamples: number): Float32Array {
  const channels = buffer.numberOfChannels;
  const total = buffer.length;
  const step = Math.max(1, Math.floor(total / targetSamples));
  const out = new Float32Array(targetSamples);
  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : null;
  for (let i = 0; i < targetSamples; i++) {
    const start = i * step;
    const end = Math.min(total, start + step);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const v0 = Math.abs(ch0[j] ?? 0);
      const v1 = ch1 ? Math.abs(ch1[j] ?? 0) : v0;
      const v = Math.max(v0, v1);
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}

export function cachedPeaks(blobId: string, buffer: AudioBuffer, width: number): Float32Array {
  const key = `${blobId}:${width}`;
  const hit = peaksCache.get(key);
  if (hit) return hit;
  const peaks = computePeaks(buffer, width);
  peaksCache.set(key, peaks);
  return peaks;
}

export function invalidatePeaks(blobId: string) {
  for (const k of Array.from(peaksCache.keys())) {
    if (k.startsWith(blobId + ":")) peaksCache.delete(k);
  }
}

export function extFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "bin";
}
