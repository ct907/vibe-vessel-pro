// Decode an audio blob and run offline chord detection in a Web Worker.
// Centralizes the decode -> downmix -> worker round-trip so any caller (e.g.
// per-take transcription) can await a chord timeline without touching the
// worker plumbing directly.

import { getAudioContext } from "@/lib/audio/context";
import { downmixMono, type DetectedChord } from "./detect-chords";
import type { DetectWorkerResponse } from "./detect-chords-worker-types";
import type { MelodyNote } from "./detect-melody";

export async function transcribeBlob(
  blob: Blob,
  useFlat: boolean,
  onProgress?: (progress: number) => void,
): Promise<DetectedChord[]> {
  const arrayBuf = await blob.arrayBuffer();
  const audioBuf = await getAudioContext().decodeAudioData(arrayBuf);
  const mono = downmixMono(audioBuf);

  return new Promise<DetectedChord[]>((resolve, reject) => {
    const worker = new Worker(new URL("./detect-chords.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<DetectWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.(msg.progress);
      } else if (msg.type === "result") {
        worker.terminate();
        resolve(msg.result);
      } else {
        worker.terminate();
        reject(new Error(msg.message || "Detection failed"));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Detection failed"));
    };
    worker.postMessage({ channel: mono, sampleRate: audioBuf.sampleRate, useFlat }, [mono.buffer]);
  });
}

export async function transcribeMelodyBlob(
  blob: Blob,
  useFlat: boolean,
  onProgress?: (progress: number) => void,
): Promise<MelodyNote[]> {
  const arrayBuf = await blob.arrayBuffer();
  const audioBuf = await getAudioContext().decodeAudioData(arrayBuf);
  const mono = downmixMono(audioBuf);

  return new Promise<MelodyNote[]>((resolve, reject) => {
    const worker = new Worker(new URL("./detect-melody.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ type: string; progress?: number; result?: MelodyNote[]; message?: string }>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.(msg.progress ?? 0);
      } else if (msg.type === "result") {
        worker.terminate();
        resolve(msg.result ?? []);
      } else {
        worker.terminate();
        reject(new Error(msg.message || "Detection failed"));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Detection failed"));
    };
    worker.postMessage({ channel: mono, sampleRate: audioBuf.sampleRate, useFlat }, [mono.buffer]);
  });
}
