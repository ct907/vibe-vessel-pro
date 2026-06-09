// Shared message contract between the chord-detection worker and its caller.

import type { DetectedChord } from "./detect-chords";

export interface detectChannelData_message {
  channel: Float32Array;
  sampleRate: number;
  useFlat: boolean;
}

export type DetectWorkerResponse =
  | { type: "progress"; progress: number }
  | { type: "result"; result: DetectedChord[] }
  | { type: "error"; message: string };
