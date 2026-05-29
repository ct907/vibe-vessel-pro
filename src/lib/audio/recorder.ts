import { getAudioContext } from "@/lib/audio/context";
import { normalizeRecording } from "@/lib/audio/normalize";

const MIME_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a",
  "audio/mp4",
];

export function pickSupportedMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const m of MIME_PREFERENCES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* noop */
    }
  }
  return "audio/webm";
}

export interface RecorderHandle {
  stop: () => Promise<{ blob: Blob; durationSec: number; mime: string }>;
  cancel: () => void;
  mime: string;
}

export async function startRecording(opts: {
  onLevel?: (level: number) => void;
  deviceId?: string | null;
}): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
  });
  const mime = pickSupportedMime();

  // Route through a unity-gain node so the level meter taps the same signal
  // that's recorded. Peak normalization to -2 dBFS happens after stop().
  const ac = getAudioContext();
  const src = ac.createMediaStreamSource(stream);
  const boostGain = ac.createGain();
  boostGain.gain.value = 1.0;
  const dest = ac.createMediaStreamDestination();
  src.connect(boostGain);
  boostGain.connect(dest);

  const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Level monitor — tap the boosted signal so the meter matches the recording.
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  boostGain.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let rafId = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / data.length);
    opts.onLevel?.(Math.min(1, rms));
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  recorder.start(250);

  const stop = (): Promise<{ blob: Blob; durationSec: number; mime: string }> =>
    new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        cancelAnimationFrame(rafId);
        try { src.disconnect(); } catch { /* noop */ }
        try { boostGain.disconnect(); } catch { /* noop */ }
        stream.getTracks().forEach((t) => t.stop());
        try {
          const raw = new Blob(chunks, { type: mime });
          const normalized = await normalizeRecording(raw);
          resolve({
            blob: normalized.blob,
            durationSec: normalized.durationSec,
            mime: normalized.mime,
          });
        } catch (e) {
          reject(e);
        }
      };
      try {
        recorder.stop();
      } catch (e) {
        reject(e);
      }
    });

  const cancel = () => {
    cancelAnimationFrame(rafId);
    try { recorder.stop(); } catch { /* noop */ }
    try { src.disconnect(); } catch { /* noop */ }
    try { boostGain.disconnect(); } catch { /* noop */ }
    stream.getTracks().forEach((t) => t.stop());
  };

  return { stop, cancel, mime };
}
