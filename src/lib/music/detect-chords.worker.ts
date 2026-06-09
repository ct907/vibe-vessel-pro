// Web Worker wrapper for the offline chord detector. Keeps FFT/chroma/template
// work off the main thread so the UI stays responsive on multi-minute audio.
// The main thread decodes + downmixes the audio and transfers the mono PCM
// buffer here; we post back progress updates and the final chord timeline.

import type { detectChannelData_message } from "./detect-chords-worker-types";
import { detectChordsFromChannelData } from "./detect-chords";

// `self` types as Window without the webworker lib; cast for the worker API.
const ctx: { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void } = self as never;

ctx.onmessage = (e: MessageEvent<detectChannelData_message>) => {
  const { channel, sampleRate, useFlat } = e.data;
  try {
    const result = detectChordsFromChannelData(channel, sampleRate, {
      useFlat,
      onProgress: (progress) => ctx.postMessage({ type: "progress", progress }),
    });
    ctx.postMessage({ type: "result", result });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
