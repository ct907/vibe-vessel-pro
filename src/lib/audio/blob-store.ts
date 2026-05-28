import { set, get, del, keys } from "idb-keyval";

const PREFIX = "audio:";

export async function putAudioBlob(id: string, blob: Blob): Promise<void> {
  await set(PREFIX + id, blob);
}

export async function getAudioBlob(id: string): Promise<Blob | undefined> {
  return (await get(PREFIX + id)) as Blob | undefined;
}

export async function deleteAudioBlob(id: string): Promise<void> {
  await del(PREFIX + id);
}

export async function listAudioBlobIds(): Promise<string[]> {
  const all = await keys();
  return all
    .filter((k): k is string => typeof k === "string" && k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length));
}

export async function pruneOrphanBlobs(referencedIds: Set<string>): Promise<void> {
  const all = await listAudioBlobIds();
  await Promise.all(all.filter((id) => !referencedIds.has(id)).map(deleteAudioBlob));
}
