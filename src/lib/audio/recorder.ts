import { getAudioContext } from "@/lib/audio/context";
import { decodeBlob } from "@/lib/audio/waveform";

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

  // Boost the captured signal before feeding it to the MediaRecorder.
  // Raw mic levels are often quiet; ×2 brings them up to a usable level
  // and matches what the level meter shows.
  const ac = getAudioContext();
  const src = ac.createMediaStreamSource(stream);
  const boostGain = ac.createGain();
  boostGain.gain.value = 2.0;
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
          const blob = new Blob(chunks, { type: mime });
          let durationSec = 0;
          try {
            const buf = await decodeBlob(blob);
            durationSec = buf.duration;
          } catch {
            durationSec = 0;
          }
          resolve({ blob, durationSec, mime });
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
