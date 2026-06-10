// Per-track WAV stem export via OfflineAudioContext.
// Each track's clips are mixed down to a stereo 44.1 kHz, 16-bit WAV,
// preserving gain and pan settings. All stems are bundled into a ZIP.

import type { RecTrack, RecClip } from "@/store/recordings";
import { getAudioBlob } from "@/lib/audio/blob-store";

const SAMPLE_RATE = 44100;

// ── WAV encoder ────────────────────────────────────────────────────────────

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const numCh = 2;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const byteRate = sampleRate * numCh * 2;          // 16-bit
  const dataBytes = numSamples * numCh * 2;

  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  const str = (s: string, offset: number) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  // RIFF header
  str("RIFF", 0); view.setUint32(4, 36 + dataBytes, true);
  str("WAVE", 8);
  // fmt chunk
  str("fmt ", 12); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, numCh * 2, true);     // block align
  view.setUint16(34, 16, true);            // bits per sample
  // data chunk
  str("data", 36); view.setUint32(40, dataBytes, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Interleaved L/R, clamped to [-1, 1], scaled to int16
    view.setInt16(offset,     Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767))), true);
    view.setInt16(offset + 2, Math.max(-32768, Math.min(32767, Math.round(ch1[i] * 32767))), true);
    offset += 4;
  }
  return new Uint8Array(out);
}

// ── per-track offline render ───────────────────────────────────────────────

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Returns null when the track has no audio blobs (nothing to render). */
async function renderTrack(
  track: RecTrack,
  totalSec: number,
  onProgress?: (pct: number) => void,
): Promise<AudioBuffer | null> {
  if (track.clips.length === 0) return null;

  const lengthSamples = Math.ceil(totalSec * SAMPLE_RATE) + SAMPLE_RATE; // 1-sec tail
  const ctx = new OfflineAudioContext(2, lengthSamples, SAMPLE_RATE);

  const gain = ctx.createGain();
  gain.gain.value = dbToGain(track.gainDb);
  const pan = ctx.createStereoPanner();
  pan.pan.value = track.pan;
  gain.connect(pan);
  pan.connect(ctx.destination);

  let loaded = 0;
  const total = track.clips.length;

  for (const clip of track.clips) {
    const blob = await getAudioBlob(clip.blobId);
    if (!blob) { loaded++; onProgress?.(loaded / total); continue; }

    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    } catch {
      loaded++; onProgress?.(loaded / total); continue;
    }

    const body = clip.trimEndSec - clip.trimStartSec;
    const fillEnd = clip.startSec + Math.max(body, clip.loopSec ?? 0);

    for (let pos = clip.startSec; pos < fillEnd - 0.001; pos += body) {
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(gain);
      const remaining = Math.min(body, fillEnd - pos, totalSec - pos);
      if (remaining <= 0.001) break;
      try {
        src.start(pos, clip.trimStartSec, remaining);
      } catch {
        break;
      }
    }

    loaded++;
    onProgress?.(loaded / total);
  }

  return await ctx.startRendering();
}

// ── public export ─────────────────────────────────────────────────────────

export interface StemExportProgress {
  current: number;
  total: number;
  label: string;
}

export async function exportStemsAsZip(
  tracks: RecTrack[],
  songTitle: string,
  onProgress?: (p: StemExportProgress) => void,
): Promise<void> {
  const activeTracks = tracks.filter((t) => t.clips.length > 0);
  if (activeTracks.length === 0) return;

  // Total song length = max clip end time across all tracks.
  const totalSec = Math.max(
    1,
    ...activeTracks.flatMap((t) =>
      t.clips.map((c) => c.startSec + Math.max(c.trimEndSec - c.trimStartSec, c.loopSec ?? 0)),
    ),
  );

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder("stems") ?? zip;

  for (let i = 0; i < activeTracks.length; i++) {
    const track = activeTracks[i];
    onProgress?.({ current: i, total: activeTracks.length, label: track.name });
    const buf = await renderTrack(track, totalSec);
    if (!buf) continue;
    const wav = encodeWav(buf);
    const safeName = track.name.replace(/[/\\:*?"<>|]/g, "_") || `Track ${i + 1}`;
    folder.file(`${safeName}.wav`, wav);
  }

  onProgress?.({ current: activeTracks.length, total: activeTracks.length, label: "Packing ZIP…" });
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${songTitle || "song"}-stems.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
