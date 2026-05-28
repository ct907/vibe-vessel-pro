import { create } from "zustand";
import { nanoid } from "nanoid";

export type RecTrackId = string;
export type RecBlobId = string;

export interface RecClip {
  blobId: RecBlobId;
  mime: string;
  durationSec: number;
  startSec: number;
  trimStartSec: number;
  trimEndSec: number;
}

export interface RecTrack {
  id: RecTrackId;
  name: string;
  color: string;
  clip: RecClip | null;
  gainDb: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
}

export const MAX_TRACKS = 4;

export const TRACK_COLOR_PRESETS = [
  "var(--track-color-amber)",
  "var(--track-color-teal)",
  "var(--track-color-rose)",
  "var(--track-color-indigo)",
] as const;

const DEFAULT_NAMES = ["Track 1", "Track 2", "Track 3", "Track 4"];

interface RecordingsState {
  tracks: RecTrack[];
  selectedTrackId: RecTrackId | null;
  isRecording: boolean;
  recordingTrackId: RecTrackId | null;
  monitorLevel: number;
  addTrack: () => RecTrackId | null;
  removeTrack: (id: RecTrackId) => void;
  renameTrack: (id: RecTrackId, name: string) => void;
  setTrackColor: (id: RecTrackId, color: string) => void;
  setGainDb: (id: RecTrackId, db: number) => void;
  setPan: (id: RecTrackId, pan: number) => void;
  toggleMute: (id: RecTrackId) => void;
  toggleSolo: (id: RecTrackId) => void;
  setClip: (id: RecTrackId, clip: RecClip | null) => void;
  setClipTrim: (id: RecTrackId, trimStart: number, trimEnd: number) => void;
  setClipStart: (id: RecTrackId, startSec: number) => void;
  selectTrack: (id: RecTrackId | null) => void;
  setRecording: (isRecording: boolean, trackId: RecTrackId | null) => void;
  setMonitorLevel: (level: number) => void;
  hydrate: (tracks: RecTrack[]) => void;
  clear: () => void;
  toJSON: () => { tracks: RecTrack[] };
}

const updateOne = (tracks: RecTrack[], id: RecTrackId, patch: Partial<RecTrack>): RecTrack[] =>
  tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));

export const useRecordingsStore = create<RecordingsState>((set, get) => ({
  tracks: [],
  selectedTrackId: null,
  isRecording: false,
  recordingTrackId: null,
  monitorLevel: 0,

  addTrack: () => {
    const tracks = get().tracks;
    if (tracks.length >= MAX_TRACKS) return null;
    const id = nanoid();
    const color = TRACK_COLOR_PRESETS[tracks.length % TRACK_COLOR_PRESETS.length];
    const name = DEFAULT_NAMES[tracks.length] ?? `Track ${tracks.length + 1}`;
    const track: RecTrack = {
      id,
      name,
      color,
      clip: null,
      gainDb: 0,
      pan: 0,
      muted: false,
      soloed: false,
    };
    set({ tracks: [...tracks, track], selectedTrackId: id });
    return id;
  },

  removeTrack: (id) =>
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId,
    })),

  renameTrack: (id, name) => set((s) => ({ tracks: updateOne(s.tracks, id, { name }) })),
  setTrackColor: (id, color) => set((s) => ({ tracks: updateOne(s.tracks, id, { color }) })),
  setGainDb: (id, gainDb) => set((s) => ({ tracks: updateOne(s.tracks, id, { gainDb }) })),
  setPan: (id, pan) => set((s) => ({ tracks: updateOne(s.tracks, id, { pan }) })),
  toggleMute: (id) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)),
    })),
  toggleSolo: (id) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, soloed: !t.soloed } : t)),
    })),

  setClip: (id, clip) => set((s) => ({ tracks: updateOne(s.tracks, id, { clip }) })),

  setClipTrim: (id, trimStart, trimEnd) =>
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id || !t.clip) return t;
        const ts = Math.max(0, Math.min(trimStart, t.clip.durationSec));
        const te = Math.max(ts + 0.01, Math.min(trimEnd, t.clip.durationSec));
        return { ...t, clip: { ...t.clip, trimStartSec: ts, trimEndSec: te } };
      }),
    })),

  setClipStart: (id, startSec) =>
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id || !t.clip) return t;
        return { ...t, clip: { ...t.clip, startSec: Math.max(0, startSec) } };
      }),
    })),

  selectTrack: (id) => set({ selectedTrackId: id }),
  setRecording: (isRecording, recordingTrackId) => set({ isRecording, recordingTrackId }),
  setMonitorLevel: (monitorLevel) => set({ monitorLevel }),

  hydrate: (tracks) => set({ tracks: tracks.slice(0, MAX_TRACKS), selectedTrackId: null }),
  clear: () => set({ tracks: [], selectedTrackId: null, isRecording: false, recordingTrackId: null, monitorLevel: 0 }),
  toJSON: () => ({ tracks: get().tracks }),
}));
