import { create } from "zustand";
import { nanoid } from "nanoid";
import { notifyStorageQuota } from "@/lib/storage-quota";

export type RecTrackId = string;
export type RecBlobId = string;

export interface RecClip {
  blobId: RecBlobId;
  mime: string;
  durationSec: number;
  /** Position in the loop timeline where this clip starts playing. */
  startSec: number;
  trimStartSec: number;
  trimEndSec: number;
  /** When set and larger than the clip body, the clip repeats back-to-back to
   *  fill this many seconds on the timeline (BandLab-style loop). */
  loopSec?: number;
}

export interface RecTrack {
  id: RecTrackId;
  name: string;
  color: string;
  /** All clips on this track, ordered by startSec, non-overlapping. */
  clips: RecClip[];
  gainDb: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  /** Delay-compensation offset in milliseconds applied to this track's clips
   *  during playback and stem export. Positive = later, negative = earlier. */
  offsetMs: number;
}

export const MAX_TRACKS = 4;

export const TRACK_COLOR_PRESETS = [
  "var(--track-color-amber)",
  "var(--track-color-teal)",
  "var(--track-color-rose)",
  "var(--track-color-indigo)",
] as const;

const DEFAULT_NAMES = ["Track 1", "Track 2", "Track 3", "Track 4"];

/** Length of a single playback of the clip body (after trimming). */
export function clipBodySec(clip: RecClip): number {
  return clip.trimEndSec - clip.trimStartSec;
}

/** Visible length of a clip on the timeline, including any loop fill. */
export function clipSpanSec(clip: RecClip): number {
  return Math.max(clipBodySec(clip), clip.loopSec ?? 0);
}

/** Effective end of a clip in loop time. */
export function clipEndSec(clip: RecClip): number {
  return clip.startSec + clipSpanSec(clip);
}

/** Punch-in: remove/trim any clips overlapping [punchStart, punchEnd] and
 *  insert the new clip. Returns the updated clips array. */
export function applyPunchIn(
  clips: RecClip[],
  newClip: RecClip,
  punchStart: number,
  punchEnd: number,
): RecClip[] {
  const result: RecClip[] = [];
  for (const c of clips) {
    const cStart = c.startSec;
    const cEnd = clipEndSec(c);
    if (cEnd <= punchStart || cStart >= punchEnd) {
      // No overlap — keep as-is.
      result.push(c);
    } else if (cStart < punchStart && cEnd > punchEnd) {
      // Clip spans the whole punch range — split into before and after.
      const beforeLen = punchStart - cStart;
      result.push({ ...c, trimEndSec: c.trimStartSec + beforeLen });
      const afterOffset = punchEnd - cStart;
      result.push({
        ...c,
        blobId: c.blobId,
        startSec: punchEnd,
        trimStartSec: c.trimStartSec + afterOffset,
      });
    } else if (cStart < punchStart) {
      // Clip starts before punch — trim its end.
      const keepLen = punchStart - cStart;
      result.push({ ...c, trimEndSec: c.trimStartSec + keepLen });
    } else if (cEnd > punchEnd) {
      // Clip ends after punch — trim its start.
      const skipLen = punchEnd - cStart;
      result.push({
        ...c,
        startSec: punchEnd,
        trimStartSec: c.trimStartSec + skipLen,
      });
    }
    // else fully within punch range — drop it
  }
  result.push(newClip);
  result.sort((a, b) => a.startSec - b.startSec);
  return result;
}

type TracksSnapshot = RecTrack[];

const UNDO_LIMIT = 30;
const undoStack: TracksSnapshot[] = [];
const redoStack: TracksSnapshot[] = [];

function pushHistory(tracks: RecTrack[]) {
  undoStack.push(tracks.map((t) => ({ ...t, clips: [...t.clips] })));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

interface RecordingsState {
  tracks: RecTrack[];
  selectedTrackId: RecTrackId | null;
  isRecording: boolean;
  recordingTrackId: RecTrackId | null;
  monitorLevel: number;
  selectedInputDeviceId: string | null;
  setSelectedInputDeviceId: (id: string | null) => void;

  playheadSec: number;
  setPlayheadSec: (sec: number) => void;

  addTrack: () => RecTrackId | null;
  removeTrack: (id: RecTrackId) => void;
  renameTrack: (id: RecTrackId, name: string) => void;
  setTrackColor: (id: RecTrackId, color: string) => void;
  setGainDb: (id: RecTrackId, db: number) => void;
  setPan: (id: RecTrackId, pan: number) => void;
  /** Set the delay-compensation offset (clamped to ±2000ms). */
  setTrackOffsetMs: (id: RecTrackId, offsetMs: number) => void;
  toggleMute: (id: RecTrackId) => void;
  toggleSolo: (id: RecTrackId) => void;

  /** Add a clip to a track. Replaces any overlapping clips in the clip's time range. */
  addClip: (id: RecTrackId, clip: RecClip) => void;
  /** Append a real recorded clip onto the first track, creating it if none exists. */
  recordToFirstTrack: (blobId: string, durationSec: number, mime: string) => void;
  /** Remove a single clip by blobId. */
  removeClip: (id: RecTrackId, blobId: RecBlobId) => void;
  /** Remove every clip on a track in a single undoable step. */
  clearTrackClips: (id: RecTrackId) => void;
  /** Punch-in: replace audio in [punchStart, punchEnd] with newClip. */
  punchInClip: (id: RecTrackId, clip: RecClip, punchStart: number, punchEnd: number) => void;
  setClipTrim: (id: RecTrackId, blobId: RecBlobId, trimStart: number, trimEnd: number) => void;
  setClipStart: (id: RecTrackId, blobId: RecBlobId, startSec: number) => void;
  /** Set the looped fill length. Pass undefined / a value <= body to disable looping. */
  setClipLoop: (id: RecTrackId, blobId: RecBlobId, loopSec: number | undefined) => void;
  /** Move a clip within or across tracks, re-applying non-overlap at the destination. */
  moveClip: (from: RecTrackId, to: RecTrackId, blobId: RecBlobId, startSec: number) => void;
  /** Snapshot the current tracks for a single undo step (call once at the start of a drag). */
  beginClipEdit: () => void;

  /** @deprecated use addClip instead */
  setClip: (id: RecTrackId, clip: RecClip | null) => void;

  selectTrack: (id: RecTrackId | null) => void;
  setRecording: (isRecording: boolean, trackId: RecTrackId | null) => void;
  setMonitorLevel: (level: number) => void;

  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;

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
  selectedInputDeviceId: null,
  setSelectedInputDeviceId: (id) => set({ selectedInputDeviceId: id }),

  playheadSec: 0,
  setPlayheadSec: (sec) => set({ playheadSec: Math.max(0, sec) }),

  addTrack: () => {
    const tracks = get().tracks;
    if (tracks.length >= MAX_TRACKS) return null;
    pushHistory(tracks);
    const id = nanoid();
    const color = TRACK_COLOR_PRESETS[tracks.length % TRACK_COLOR_PRESETS.length];
    const name = DEFAULT_NAMES[tracks.length] ?? `Track ${tracks.length + 1}`;
    const track: RecTrack = { id, name, color, clips: [], gainDb: 0, pan: 0, muted: false, soloed: false, offsetMs: 0 };
    set({ tracks: [...tracks, track], selectedTrackId: id });
    return id;
  },

  removeTrack: (id) => {
    pushHistory(get().tracks);
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId,
    }));
  },

  renameTrack: (id, name) => set((s) => ({ tracks: updateOne(s.tracks, id, { name }) })),
  setTrackColor: (id, color) => set((s) => ({ tracks: updateOne(s.tracks, id, { color }) })),
  setGainDb: (id, gainDb) => set((s) => ({ tracks: updateOne(s.tracks, id, { gainDb }) })),
  setPan: (id, pan) => set((s) => ({ tracks: updateOne(s.tracks, id, { pan }) })),
  setTrackOffsetMs: (id, offsetMs) =>
    set((s) => ({ tracks: updateOne(s.tracks, id, { offsetMs: Math.max(-2000, Math.min(2000, offsetMs)) }) })),
  toggleMute: (id) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)) })),
  toggleSolo: (id) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, soloed: !t.soloed } : t)) })),

  addClip: (id, clip) => {
    pushHistory(get().tracks);
    const punchStart = clip.startSec;
    const punchEnd = clipEndSec(clip);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        return { ...t, clips: applyPunchIn(t.clips, clip, punchStart, punchEnd) };
      }),
    }));
  },

  recordToFirstTrack: (blobId, durationSec, mime) => {
    let id = get().tracks[0]?.id ?? null;
    if (!id) id = get().addTrack();
    if (!id) return;
    const track = get().tracks.find((t) => t.id === id);
    const startSec = track ? track.clips.reduce((m, c) => Math.max(m, clipEndSec(c)), 0) : 0;
    const clip: RecClip = { blobId, mime, durationSec, startSec, trimStartSec: 0, trimEndSec: durationSec };
    get().addClip(id, clip);
  },

  removeClip: (id, blobId) => {
    pushHistory(get().tracks);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        return { ...t, clips: t.clips.filter((c) => c.blobId !== blobId) };
      }),
    }));
  },

  clearTrackClips: (id) => {
    pushHistory(get().tracks);
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, clips: [] } : t)) }));
  },

  punchInClip: (id, clip, punchStart, punchEnd) => {
    pushHistory(get().tracks);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        return { ...t, clips: applyPunchIn(t.clips, clip, punchStart, punchEnd) };
      }),
    }));
  },

  setClipTrim: (id, blobId, trimStart, trimEnd) =>
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            if (c.blobId !== blobId) return c;
            const ts = Math.max(0, Math.min(trimStart, c.durationSec));
            const te = Math.max(ts + 0.01, Math.min(trimEnd, c.durationSec));
            return { ...c, trimStartSec: ts, trimEndSec: te };
          }),
        };
      }),
    })),

  setClipStart: (id, blobId, startSec) =>
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          clips: t.clips.map((c) =>
            c.blobId !== blobId ? c : { ...c, startSec: Math.max(0, startSec) },
          ),
        };
      }),
    })),

  setClipLoop: (id, blobId, loopSec) =>
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            if (c.blobId !== blobId) return c;
            const body = clipBodySec(c);
            const next = loopSec === undefined || loopSec <= body + 0.001 ? undefined : loopSec;
            return { ...c, loopSec: next };
          }),
        };
      }),
    })),

  moveClip: (from, to, blobId, startSec) =>
    set((s) => {
      const src = s.tracks.find((t) => t.id === from);
      const clip = src?.clips.find((c) => c.blobId === blobId);
      if (!clip) return {};
      const moved: RecClip = { ...clip, startSec: Math.max(0, startSec) };
      return {
        tracks: s.tracks.map((t) => {
          if (t.id === from && from !== to) {
            return { ...t, clips: t.clips.filter((c) => c.blobId !== blobId) };
          }
          if (t.id === to) {
            const base = from === to ? t.clips.filter((c) => c.blobId !== blobId) : t.clips;
            return { ...t, clips: applyPunchIn(base, moved, moved.startSec, clipEndSec(moved)) };
          }
          return t;
        }),
      };
    }),

  beginClipEdit: () => pushHistory(get().tracks),

  setClip: (id, clip) => {
    pushHistory(get().tracks);
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== id) return t;
        if (clip === null) return { ...t, clips: [] };
        return { ...t, clips: applyPunchIn([], clip, clip.startSec, clipEndSec(clip)) };
      }),
    }));
  },

  selectTrack: (id) => set({ selectedTrackId: id }),
  setRecording: (isRecording, recordingTrackId) => set({ isRecording, recordingTrackId }),
  setMonitorLevel: (monitorLevel) => set({ monitorLevel }),

  undo: () => {
    if (!undoStack.length) return false;
    const cur = get().tracks;
    const prev = undoStack.pop()!;
    redoStack.push(cur.map((t) => ({ ...t, clips: [...t.clips] })));
    if (redoStack.length > UNDO_LIMIT) redoStack.shift();
    set({ tracks: prev });
    return true;
  },
  redo: () => {
    if (!redoStack.length) return false;
    const cur = get().tracks;
    const next = redoStack.pop()!;
    undoStack.push(cur.map((t) => ({ ...t, clips: [...t.clips] })));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    set({ tracks: next });
    return true;
  },
  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

  hydrate: (raw) => {
    const tracks = raw.slice(0, MAX_TRACKS).map((t) => {
      // Migrate legacy clip: RecClip | null → clips: RecClip[]
      const legacy = t as unknown as RecTrack & { clip?: RecClip | null };
      if (!t.clips && legacy.clip) {
        return { ...t, clips: [legacy.clip], offsetMs: t.offsetMs ?? 0 };
      }
      return { ...t, clips: t.clips ?? [], offsetMs: t.offsetMs ?? 0 };
    });
    set({ tracks, selectedTrackId: null });
  },
  clear: () => {
    undoStack.length = 0;
    redoStack.length = 0;
    set({ tracks: [], selectedTrackId: null, isRecording: false, recordingTrackId: null, monitorLevel: 0 });
  },
  toJSON: () => ({ tracks: get().tracks }),
}));

// ---- localStorage persistence ----
// Persist only the track/clip metadata (blobId refs) so a refresh restores the
// arrangement; the audio bytes already live durably in IndexedDB. High-frequency
// fields like monitorLevel and playheadSec leave `tracks` referentially stable, so
// the reference guard keeps us from hammering localStorage during playback.
const RECORDINGS_STORAGE_KEY = "songwriters-notebook:recordings:v1";

export function hydrateRecordingsFromStorage() {
  try {
    const raw = localStorage.getItem(RECORDINGS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.tracks)) useRecordingsStore.getState().hydrate(data.tracks);
  } catch { /* ignore */ }
}

export function startRecordingsAutosave() {
  let last = useRecordingsStore.getState().tracks;
  return useRecordingsStore.subscribe((state) => {
    if (state.tracks === last) return;
    last = state.tracks;
    try {
      localStorage.setItem(RECORDINGS_STORAGE_KEY, JSON.stringify({ tracks: state.tracks }));
    } catch { notifyStorageQuota(); }
  });
}

/** Every blobId currently referenced by a recording clip — used to prune orphans. */
export function referencedRecordingBlobIds(): string[] {
  return useRecordingsStore.getState().tracks.flatMap((t) => t.clips.map((c) => c.blobId));
}
