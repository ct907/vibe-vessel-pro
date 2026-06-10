// Web Worker wrapper for the offline melody detector — autocorrelation over
// every frame of a take is too heavy for the main thread.

import { detectMelodyFromChannelData } from "./detect-melody";

const ctx: { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void } = self as never;

ctx.onmessage = (e: MessageEvent<{ channel: Float32Array; sampleRate: number; useFlat: boolean }>) => {
  const { channel, sampleRate, useFlat } = e.data;
  try {
    const result = detectMelodyFromChannelData(channel, sampleRate, {
      useFlat,
      onProgress: (progress) => ctx.postMessage({ type: "progress", progress }),
    });
    ctx.postMessage({ type: "result", result });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
