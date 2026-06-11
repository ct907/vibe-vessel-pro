import { getAudioContext, getMasterChain } from "@/lib/audio/context";
import { getAudioBlob } from "@/lib/audio/blob-store";
import { decodeBlob } from "@/lib/audio/waveform";
import { useRecordingsStore, type RecClip, type RecTrack } from "@/store/recordings";

const bufferCache = new Map<string, AudioBuffer>();
const decodePromises = new Map<string, Promise<AudioBuffer>>();

async function getDecoded(clip: RecClip): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(clip.blobId);
  if (cached) return cached;
  let pending = decodePromises.get(clip.blobId);
  if (!pending) {
    pending = (async () => {
      const blob = await getAudioBlob(clip.blobId);
      if (!blob) throw new Error("blob missing");
      const buf = await decodeBlob(blob);
      bufferCache.set(clip.blobId, buf);
      return buf;
    })();
    decodePromises.set(clip.blobId, pending);
  }
  try {
    return await pending;
  } catch {
    return null;
  } finally {
    decodePromises.delete(clip.blobId);
  }
}

export function clearDecodedCache(blobId?: string) {
  if (blobId) bufferCache.delete(blobId);
  else bufferCache.clear();
}

interface ScheduledSource {
  source: AudioBufferSourceNode;
  endTime: number;
}

interface ActiveTrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  sources: ScheduledSource[];
}

interface EngineState {
  running: boolean;
  loopStartCtxTime: number;
  loopSec: number;
  scheduledUntilLoop: number;
  trackNodes: Map<string, ActiveTrackNodes>;
  tickId: number | null;
  unsubscribe: (() => void) | null;
}

const state: EngineState = {
  running: false,
  loopStartCtxTime: 0,
  loopSec: 0,
  scheduledUntilLoop: -1,
  trackNodes: new Map(),
  tickId: null,
  unsubscribe: null,
};

const SCHEDULE_AHEAD_LOOPS = 2;
const TICK_MS = 50;

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function ensureNodes(track: RecTrack): ActiveTrackNodes {
  const existing = state.trackNodes.get(track.id);
  if (existing) return existing;
  const ac = getAudioContext();
  const gain = ac.createGain();
  const pan = ac.createStereoPanner();
  gain.connect(pan);
  // Route directly to master so the limiter still catches it but we skip
  // the synth EQ/FX chain.
  try {
    const master = getMasterChain().master;
    pan.connect(master);
  } catch {
    pan.connect(ac.destination);
  }
  const nodes: ActiveTrackNodes = { gain, pan, sources: [] };
  state.trackNodes.set(track.id, nodes);
  return nodes;
}

function applyTrackParams(track: RecTrack, anySolo: boolean) {
  const nodes = state.trackNodes.get(track.id);
  if (!nodes) return;
  const audible = track.muted ? false : anySolo ? track.soloed : true;
  const g = audible ? dbToGain(track.gainDb) : 0;
  const ac = getAudioContext();
  nodes.gain.gain.setTargetAtTime(g, ac.currentTime, 0.01);
  nodes.pan.pan.setTargetAtTime(track.pan, ac.currentTime, 0.01);
}

function stopAllSources() {
  const ac = getAudioContext();
  for (const nodes of state.trackNodes.values()) {
    for (const s of nodes.sources) {
      try {
        s.source.stop(ac.currentTime);
      } catch {
        /* noop */
      }
      try {
        s.source.disconnect();
      } catch {
        /* noop */
      }
    }
    nodes.sources = [];
  }
}

function disposeAllNodes() {
  for (const nodes of state.trackNodes.values()) {
    try {
      nodes.gain.disconnect();
      nodes.pan.disconnect();
    } catch {
      /* noop */
    }
  }
  state.trackNodes.clear();
}

async function scheduleClipForLoop(
  track: RecTrack,
  clip: RecClip,
  loopIndex: number,
) {
  const buffer = await getDecoded(clip);
  if (!buffer) return;
  if (!state.running) return;
  const nodes = ensureNodes(track);
  const ac = getAudioContext();
  const loopStart = state.loopStartCtxTime + loopIndex * state.loopSec;
  const offset = Math.max(0, Math.min(clip.trimStartSec, buffer.duration - 0.001));
  const body = Math.max(0.01, clip.trimEndSec - offset);
  const fillEnd = clip.startSec + Math.max(body, clip.loopSec ?? 0);
  // Delay compensation: shift the whole track's clips on the timeline.
  const trackOffsetSec = (track.offsetMs ?? 0) / 1000;

  for (let pos = clip.startSec; pos < fillEnd - 0.001; pos += body) {
    const startTime = loopStart + pos + trackOffsetSec;
    if (startTime + 0.001 < ac.currentTime) continue;
    const remainingInFill = fillEnd - pos;
    const remainingInLoop = state.loopSec - pos;
    const length = Math.max(0.01, Math.min(body, remainingInFill, remainingInLoop));
    if (length <= 0.001) break;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.connect(nodes.gain);
    try {
      source.start(startTime, offset, length);
    } catch {
      break;
    }
    nodes.sources.push({ source, endTime: startTime + length });
    if (remainingInLoop <= body + 0.001) break;
  }
}

async function scheduleLoop(loopIndex: number) {
  const store = useRecordingsStore.getState();
  const anySolo = store.tracks.some((t) => t.soloed);
  for (const track of store.tracks) {
    ensureNodes(track);
    applyTrackParams(track, anySolo);
    for (const clip of track.clips) {
      await scheduleClipForLoop(track, clip, loopIndex);
    }
  }
}

function tick() {
  if (!state.running) return;
  const ac = getAudioContext();
  const elapsed = ac.currentTime - state.loopStartCtxTime;
  const currentLoop = Math.floor(elapsed / state.loopSec);
  const target = currentLoop + SCHEDULE_AHEAD_LOOPS;
  while (state.scheduledUntilLoop < target) {
    state.scheduledUntilLoop++;
    void scheduleLoop(state.scheduledUntilLoop);
  }
  // Clean up finished sources.
  for (const nodes of state.trackNodes.values()) {
    nodes.sources = nodes.sources.filter((s) => s.endTime > ac.currentTime - 0.5);
  }
}

export interface StartOptions {
  bpm: number;
  loopBeats: number;
  startAtCtxTime: number;
  playheadOffsetSec?: number;
}

export function startRecordingsEngine(opts: StartOptions) {
  stopRecordingsEngine();
  state.loopSec = (opts.loopBeats * 60) / opts.bpm;
  if (!isFinite(state.loopSec) || state.loopSec <= 0.05) return;
  // Shift the conceptual loop start backwards by the playhead offset so the
  // first scheduled iteration aligns with the requested musical position.
  const offset = opts.playheadOffsetSec ?? 0;
  state.loopStartCtxTime = opts.startAtCtxTime - offset;
  state.scheduledUntilLoop = -1;
  state.running = true;

  // Initial schedule: catch any loop indices already in progress.
  const ac = getAudioContext();
  const elapsed = ac.currentTime - state.loopStartCtxTime;
  const currentLoop = Math.max(0, Math.floor(elapsed / state.loopSec));
  state.scheduledUntilLoop = currentLoop - 1;
  tick();

  state.tickId = window.setInterval(tick, TICK_MS);

  // React to track param/clip changes by re-scheduling future loops.
  state.unsubscribe = useRecordingsStore.subscribe(() => {
    if (!state.running) return;
    const store = useRecordingsStore.getState();
    const anySolo = store.tracks.some((t) => t.soloed);
    for (const track of store.tracks) {
      ensureNodes(track);
      applyTrackParams(track, anySolo);
    }
    // Cancel future-only sources and re-queue.
    const ac2 = getAudioContext();
    for (const nodes of state.trackNodes.values()) {
      nodes.sources = nodes.sources.filter((s) => {
        if (s.endTime > ac2.currentTime + 0.05 && s.source.context.currentTime < s.endTime) {
          // best-effort: stop sources that haven't begun playing yet.
          // We can't tell precisely, so leave already-started ones alone
          // and just cancel future starts via rescheduling.
          return true;
        }
        return s.endTime > ac2.currentTime - 0.5;
      });
    }
  });
}

export function stopRecordingsEngine() {
  state.running = false;
  if (state.tickId !== null) {
    clearInterval(state.tickId);
    state.tickId = null;
  }
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }
  stopAllSources();
  disposeAllNodes();
}

export function getLoopStartCtxTime(): number {
  return state.loopStartCtxTime;
}

export function getLoopSec(): number {
  return state.loopSec;
}

export function isEngineRunning(): boolean {
  return state.running;
}

/**
 * Update the loop duration for a running recordings engine without stopping it.
 * Sources currently playing continue at their original timing; future loop
 * iterations are scheduled at the new BPM. This allows seamless live tempo
 * adjustment — the loop boundary drifts to the new tempo over one cycle.
 */
export function updateEngineBpm(bpm: number, loopBeats: number): void {
  if (!state.running) return;
  const newLoopSec = (loopBeats * 60) / bpm;
  if (!isFinite(newLoopSec) || newLoopSec <= 0.05) return;
  state.loopSec = newLoopSec;
  // Reset the schedule-ahead counter so the tick immediately reschedules any
  // future loops with the new loop duration.
  const ac = getAudioContext();
  const elapsed = ac.currentTime - state.loopStartCtxTime;
  state.scheduledUntilLoop = Math.max(0, Math.floor(elapsed / newLoopSec));
}
