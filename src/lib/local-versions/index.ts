// Rotating offline project versions. Each version is a self-contained project
// zip (song.json + embedded audio) stored in IndexedDB; a small metadata index
// lives in localStorage so the version list renders without unpacking any zip.
//
// Three rolling slots: a new save overwrites the oldest. Because the audio is
// embedded inside each zip, these versions are fully portable and do not depend
// on the shared `audio:` blobs in IndexedDB.

import { set, get } from "idb-keyval";

const SLOT_COUNT = 3;
const SLOT_PREFIX = "zip-slot:";
const META_KEY = "songwriters-notebook:zip-slots:v1";

export interface LocalVersionMeta {
  slot: number;
  title: string;
  savedAt: number;
  sizeBytes: number;
}

interface SlotIndex {
  current: number;
  slots: LocalVersionMeta[];
}

function readIndex(): SlotIndex {
  if (typeof localStorage === "undefined") return { current: -1, slots: [] };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { current: -1, slots: [] };
    const data = JSON.parse(raw) as SlotIndex;
    if (typeof data.current !== "number" || !Array.isArray(data.slots)) {
      return { current: -1, slots: [] };
    }
    return data;
  } catch {
    return { current: -1, slots: [] };
  }
}

function writeIndex(index: SlotIndex) {
  localStorage.setItem(META_KEY, JSON.stringify(index));
}

export async function saveLocalVersion(blob: Blob, title: string): Promise<LocalVersionMeta> {
  const index = readIndex();
  const slot = (index.current + 1) % SLOT_COUNT;
  await set(SLOT_PREFIX + slot, blob);
  const meta: LocalVersionMeta = { slot, title, savedAt: Date.now(), sizeBytes: blob.size };
  const slots = index.slots.filter((s) => s.slot !== slot);
  slots.push(meta);
  writeIndex({ current: slot, slots });
  return meta;
}

export function listLocalVersions(): LocalVersionMeta[] {
  return readIndex().slots.sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadLocalVersion(slot: number): Promise<Blob | undefined> {
  return (await get(SLOT_PREFIX + slot)) as Blob | undefined;
}

export function latestLocalVersion(): LocalVersionMeta | undefined {
  const index = readIndex();
  return index.slots.find((s) => s.slot === index.current);
}
