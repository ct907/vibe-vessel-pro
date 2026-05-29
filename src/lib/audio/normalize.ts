import { decodeBlob } from "@/lib/audio/waveform";

const TARGET_DBFS = -2;
const TARGET_PEAK = Math.pow(10, TARGET_DBFS / 20); // ≈ 0.7943

function findPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

function encodeWav(buffer: AudioBuffer, gain: number): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numCh * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let off = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i] * gain;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export async function normalizeRecording(
  blob: Blob,
): Promise<{ blob: Blob; mime: string; durationSec: number; gain: number }> {
  try {
    const buffer = await decodeBlob(blob);
    const peak = findPeak(buffer);
    if (peak <= 0) {
      return { blob, mime: blob.type, durationSec: buffer.duration, gain: 1 };
    }
    const gain = TARGET_PEAK / peak;
    const wav = encodeWav(buffer, gain);
    return { blob: wav, mime: "audio/wav", durationSec: buffer.duration, gain };
  } catch {
    return { blob, mime: blob.type, durationSec: 0, gain: 1 };
  }
}
