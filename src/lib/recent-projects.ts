// Local song library. One IndexedDB record per song, keyed by the song's stable
// `meta.songId`, holding the song plus its takes and timeline tracks (audio bytes
// stay in the shared `audio:` blob store and are referenced by id).
// TODO: cloud sync — once Lovable Cloud is enabled, mirror these entries to a
// per-user `projects` table so recents follow the user across devices.

import { createStore, del, get, set, setMany, values } from "idb-keyval";
import { nanoid } from "nanoid";
import { songHasContent, useSongStore, type SerializedSong } from "@/store/song";
import { useTakesStore, type Take } from "@/store/takes";
import { useRecordingsStore, type RecTrack } from "@/store/recordings";
import { notifyStorageQuota } from "@/lib/storage-quota";

const LEGACY_KEY = "songwriters-notebook:recents:v1";
const library = createStore("songwriters-notebook-library", "songs");

export interface RecentProject {
  /** The song's `meta.songId`. */
  id: string;
  name: string;
  savedAt: number;
  snapshot: SerializedSong;
  takes: Take[];
  tracks: RecTrack[];
}

function lyricLines(snapshot: SerializedSong): string[] {
  return (snapshot.sections ?? [])
    .flatMap((sec) => sec.lines.filter((l) => !l._isChordOverflow).map((l) => l.text.trim()))
    .filter(Boolean);
}

/** Title if the writer gave one, otherwise the first lyric line, so untitled ideas stay distinguishable. */
export function songDisplayName(snapshot: SerializedSong): string {
  const title = snapshot.meta?.title?.trim();
  if (title) return title;
  const first = lyricLines(snapshot)[0];
  if (!first) return "Untitled idea";
  return first.length > 40 ? `${first.slice(0, 40).trimEnd()}…` : first;
}

/** A lyric line to show under the name — the first one, or the second when the first already is the name. */
export function songPreview(entry: RecentProject): string {
  const lines = lyricLines(entry.snapshot);
  return (entry.snapshot.meta?.title?.trim() ? lines[0] : lines[1]) ?? "";
}

export function songHasAudio(entry: Pick<RecentProject, "takes" | "tracks">): boolean {
  return entry.takes.length > 0 || entry.tracks.some((t) => t.clips.length > 0);
}

export function songMatches(entry: RecentProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [entry.name, entry.snapshot.meta?.title, entry.snapshot.meta?.description, ...lyricLines(entry.snapshot)]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

/** True when the live song holds anything worth keeping — words, chords, photos, or audio. */
export function currentSongHasContent(): boolean {
  return (
    songHasContent() ||
    useTakesStore.getState().takes.length > 0 ||
    useRecordingsStore.getState().tracks.some((t) => t.clips.length > 0)
  );
}

// Songs saved before the library existed live in a capped localStorage list
// keyed by name. Move them over once; the live song adopts the id of the legacy
// entry with its name so it doesn't reappear as a duplicate.
let migration: Promise<void> | null = null;
export function migrateLegacyRecents(): Promise<void> {
  if (migration) return migration;
  migration = (async () => {
    let legacy: { id: string; name: string; savedAt: number; snapshot: SerializedSong }[];
    try {
      legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
      if (!Array.isArray(legacy) || legacy.length === 0) return;
    } catch {
      return;
    }
    const live = useSongStore.getState().meta;
    if (!live.songId) {
      const match = legacy.find((r) => r.name === (live.title || "Untitled Song"));
      if (match) useSongStore.setState((s) => ({ meta: { ...s.meta, songId: match.id } }));
    }
    try {
      await setMany(
        legacy.map((r) => [
          r.id,
          {
            id: r.id,
            name: r.name,
            savedAt: r.savedAt,
            snapshot: { ...r.snapshot, meta: { ...r.snapshot.meta, songId: r.id } },
            takes: [],
            tracks: [],
          } satisfies RecentProject,
        ]),
        library,
      );
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* keep the legacy list; try again next launch */
    }
  })();
  return migration;
}

export async function listRecent(): Promise<RecentProject[]> {
  await migrateLegacyRecents();
  try {
    const all = (await values(library)) as RecentProject[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// What counts as an edit. layoutMeta is re-stamped on every toJSON, pattern
// blocks are re-derived from section chords on load, and loading reorders meta
// keys — none of those are the writer's changes.
const sortKeys = (_key: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
    : v;
const contentKey = (e: RecentProject) =>
  JSON.stringify([{ ...e.snapshot, layoutMeta: undefined, progression: undefined }, e.takes, e.tracks], sortKeys);

/**
 * Save the live song (with its takes and tracks) to the library. The snapshot is
 * taken synchronously, so callers can reset or replace the song right after.
 * `savedAt` only moves when the content changed, so the list's dates tell the
 * writer when they last worked on each idea.
 */
export function commitCurrentSongToRecents(): Promise<void> {
  if (!currentSongHasContent()) return Promise.resolve();
  if (!useSongStore.getState().meta.songId) {
    useSongStore.setState((s) => ({ meta: { ...s.meta, songId: nanoid() } }));
  }
  const snapshot = useSongStore.getState().toJSON();
  const entry: RecentProject = {
    id: snapshot.meta.songId!,
    name: songDisplayName(snapshot),
    savedAt: Date.now(),
    snapshot,
    takes: useTakesStore.getState().toJSON().takes,
    tracks: useRecordingsStore.getState().toJSON().tracks,
  };
  return get<RecentProject>(entry.id, library)
    .then((prev) => set(entry.id, prev && contentKey(prev) === contentKey(entry) ? { ...entry, savedAt: prev.savedAt } : entry, library))
    .catch(() => notifyStorageQuota());
}

/**
 * Make `entry` the live song. Opening the song that's already live is a no-op —
 * its library snapshot can lag behind the autosaved copy.
 */
export function openRecentSong(entry: RecentProject) {
  if (entry.id === useSongStore.getState().meta.songId) return;
  void commitCurrentSongToRecents();
  useSongStore.getState().loadFromJSON(entry.snapshot);
  useTakesStore.getState().hydrate(entry.takes);
  useRecordingsStore.getState().clear();
  useRecordingsStore.getState().hydrate(entry.tracks);
}

export function removeRecent(id: string): Promise<void> {
  return del(id, library).catch(() => {});
}

/** Re-insert a removed entry — used to undo `removeRecent`. */
export function restoreRecent(entry: RecentProject): Promise<void> {
  return set(entry.id, entry, library).catch(() => {});
}

/** Audio blob ids held by songs in the library, so startup pruning keeps them. */
export async function libraryBlobIds(): Promise<string[]> {
  const songs = await listRecent();
  return songs.flatMap((s) => [
    ...s.takes.map((t) => t.blobId).filter((id): id is string => !!id),
    ...s.tracks.flatMap((t) => t.clips.map((c) => c.blobId)),
  ]);
}
