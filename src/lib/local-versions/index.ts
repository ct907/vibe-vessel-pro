// Rotating offline project versions, split into two independent pools:
//
//   "manual" — explicit Saves. 5 rolling slots; a new save overwrites the oldest.
//   "auto"   — idle/interval safety-net checkpoints. 2 rolling slots.
//
// Keeping them separate means an automatic checkpoint can never evict a version
// the user deliberately saved. Each version is a self-contained project zip
// (song.json + embedded audio) stored in IndexedDB; a small metadata index lives
// in localStorage so the version list renders without unpacking any zip. Because
// the audio is embedded inside each zip, these versions are fully portable and do
// not depend on the shared `audio:` blobs in IndexedDB.

import { set, get } from "idb-keyval";

export type VersionKind = "manual" | "auto";

const POOLS = {
  // Manual keeps the original keys so versions saved before this split survive.
  manual: { count: 5, prefix: "zip-slot:", metaKey: "songwriters-notebook:zip-slots:v1" },
  auto: { count: 2, prefix: "zip-checkpoint:", metaKey: "songwriters-notebook:zip-checkpoints:v1" },
} as const;

export interface LocalVersionMeta {
  kind: VersionKind;
  slot: number;
  title: string;
  savedAt: number;
  sizeBytes: number;
}

interface SlotIndex {
  current: number;
  slots: LocalVersionMeta[];
}

function readIndex(kind: VersionKind): SlotIndex {
  if (typeof localStorage === "undefined") return { current: -1, slots: [] };
  try {
    const raw = localStorage.getItem(POOLS[kind].metaKey);
    if (!raw) return { current: -1, slots: [] };
    const data = JSON.parse(raw) as SlotIndex;
    if (typeof data.current !== "number" || !Array.isArray(data.slots)) {
      return { current: -1, slots: [] };
    }
    // Legacy indexes predate the `kind` field; stamp it on read.
    return { current: data.current, slots: data.slots.map((s) => ({ ...s, kind })) };
  } catch {
    return { current: -1, slots: [] };
  }
}

function writeIndex(kind: VersionKind, index: SlotIndex) {
  localStorage.setItem(POOLS[kind].metaKey, JSON.stringify(index));
}

async function saveToPool(kind: VersionKind, blob: Blob, title: string): Promise<LocalVersionMeta> {
  const pool = POOLS[kind];
  const index = readIndex(kind);
  const slot = (index.current + 1) % pool.count;
  await set(pool.prefix + slot, blob);
  const meta: LocalVersionMeta = { kind, slot, title, savedAt: Date.now(), sizeBytes: blob.size };
  const slots = index.slots.filter((s) => s.slot !== slot);
  slots.push(meta);
  writeIndex(kind, { current: slot, slots });
  return meta;
}

function listPool(kind: VersionKind): LocalVersionMeta[] {
  return readIndex(kind).slots.sort((a, b) => b.savedAt - a.savedAt);
}

function loadFromPool(kind: VersionKind, slot: number): Promise<Blob | undefined> {
  return get(POOLS[kind].prefix + slot) as Promise<Blob | undefined>;
}

export function saveLocalVersion(blob: Blob, title: string): Promise<LocalVersionMeta> {
  return saveToPool("manual", blob, title);
}

export function saveCheckpoint(blob: Blob, title: string): Promise<LocalVersionMeta> {
  return saveToPool("auto", blob, title);
}

export function listLocalVersions(): LocalVersionMeta[] {
  return listPool("manual");
}

export function listCheckpoints(): LocalVersionMeta[] {
  return listPool("auto");
}

export function loadLocalVersion(slot: number): Promise<Blob | undefined> {
  return loadFromPool("manual", slot);
}

export function loadCheckpoint(slot: number): Promise<Blob | undefined> {
  return loadFromPool("auto", slot);
}

export function latestLocalVersion(): LocalVersionMeta | undefined {
  const index = readIndex("manual");
  return index.slots.find((s) => s.slot === index.current);
}
