// Local recent-projects store. Pure localStorage; no backend.
// TODO: cloud sync — once Lovable Cloud is enabled, mirror these entries to a
// per-user `projects` table so recents follow the user across devices.

const STORAGE_KEY = "songwriters-notebook:recents:v1";
const MAX = 10;

export interface RecentProject {
  id: string;
  name: string;
  savedAt: number;
  /** Snapshot of the song JSON. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: any;
}

export function listRecent(): RecentProject[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecent(entry: Omit<RecentProject, "id" | "savedAt"> & { id?: string }) {
  if (typeof localStorage === "undefined") return;
  try {
    const id = entry.id ?? `r-${Date.now().toString(36)}`;
    const list = listRecent().filter((r) => r.name !== entry.name);
    list.unshift({ id, name: entry.name, savedAt: Date.now(), snapshot: entry.snapshot });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
}

export function removeRecent(id: string) {
  try {
    const list = listRecent().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Re-inserts a previously removed entry at `index` — used to undo `removeRecent`. */
export function restoreRecent(entry: RecentProject, index: number) {
  if (typeof localStorage === "undefined") return;
  try {
    const list = listRecent();
    list.splice(Math.min(index, list.length), 0, entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}
